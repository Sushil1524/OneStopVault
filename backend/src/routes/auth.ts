/**
 * routes/auth.ts
 * Handles user registration, login, and salt retrieval.
 *
 * Why do we use a salt?
 *   Each user gets a unique random salt when they register.
 *   The client mixes the salt with the master password using PBKDF2 (600k rounds)
 *   to derive two keys:
 *     - vaultKey   → used locally to encrypt/decrypt passwords (AES-256-GCM)
 *     - authKeyHash → sent here to prove identity (we never see the real password)
 */

import { Hono } from 'hono';
import { Env } from '../types.js';
import { getUserByEmail, createUser } from '../db/queries.js';

const authApp = new Hono<{ Bindings: Env }>();

// ── JWT helpers ──────────────────────────────────────────────
const b64url = (str: string) =>
  btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const b64urlDecode = (str: string) => {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
};

/** Create a signed JWT token that expires in 7 days. */
async function createToken(userId: string, secret: string): Promise<string> {
  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
  }));
  const data = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;
}

/**
 * Verify a JWT and return the userId (sub claim) if valid, or null if invalid/expired.
 * Used by vault routes to authenticate incoming requests.
 */
export async function verifyToken(token: string, secret: string): Promise<string | null> {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return null;

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );

    // Check the signature matches header + payload
    const sigBytes = Uint8Array.from(b64urlDecode(signature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${header}.${payload}`));
    if (!valid) return null;

    // Check the token hasn't expired
    const claims = JSON.parse(b64urlDecode(payload));
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;

    return claims.sub as string;
  } catch {
    return null;
  }
}

// ── Routes ───────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Body: { email, authHash, salt }
 * Creates a new user. authHash is a SHA-256 hash derived from the user's
 * master password — we never receive or store the real password.
 */
authApp.post('/register', async (c) => {
  const { email, authHash, salt } = await c.req.json();

  if (!email || !authHash || !salt) {
    return c.json({ error: 'email, authHash, and salt are required' }, 400);
  }

  if (await getUserByEmail(c.env.DB, email)) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  const user = await createUser(c.env.DB, crypto.randomUUID(), email, authHash, salt);
  const token = await createToken(user.id, c.env.JWT_SECRET ?? 'change-me-in-production');

  return c.json({ token, user: { id: user.id, email: user.email, salt: user.salt } });
});

/**
 * POST /api/auth/login
 * Body: { email, authHash }
 * Verifies the authHash against what was stored at registration.
 * The client derives authHash locally using PBKDF2 + the user's master password.
 */
authApp.post('/login', async (c) => {
  const { email, authHash } = await c.req.json();
  if (!email || !authHash) return c.json({ error: 'email and authHash are required' }, 400);

  const user = await getUserByEmail(c.env.DB, email);
  if (!user || user.auth_hash !== authHash) {
    // Return the same error for both "not found" and "wrong password" to avoid leaking info
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const token = await createToken(user.id, c.env.JWT_SECRET ?? 'change-me-in-production');
  return c.json({ token, user: { id: user.id, email: user.email, salt: user.salt } });
});

/**
 * GET /api/auth/salt?email=you@example.com
 * Returns the user's salt so the client can derive their authHash locally before logging in.
 * The salt is not sensitive — it is only useful combined with the master password.
 */
authApp.get('/salt', async (c) => {
  const email = c.req.query('email');
  if (!email) return c.json({ error: 'email query param is required' }, 400);

  const user = await getUserByEmail(c.env.DB, email);
  if (!user) return c.json({ error: 'User not found' }, 404);

  return c.json({ salt: user.salt });
});

export { authApp };
