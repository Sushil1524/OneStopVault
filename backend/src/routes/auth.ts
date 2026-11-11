/**
 * routes/auth.ts
 * Handles registration, login, anti-enumeration salt lookup,
 * session revocation ("Log Out All Devices"), and permanent account deletion.
 */

import { Hono, Context } from 'hono';
import { Env } from '../types.js';
import {
  getUserByEmail,
  createUser,
  incrementTokenVersion,
  deleteUserAccount,
  checkRateLimit,
} from '../db/queries.js';
import {
  getJwtSecret,
  createToken,
  authenticateRequest,
  constantTimeEqual,
  deriveDeterministicFakeSalt,
  getClientIp,
} from '../crypto/security.js';

const authApp = new Hono<{ Bindings: Env }>();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function enforceRateLimit(
  c: Context<{ Bindings: Env }>,
  bucket: string,
  maxRequests: number,
  windowMs: number,
): Promise<Response | null> {
  const ip = getClientIp(c);
  const { allowed, retryAfterSec } = await checkRateLimit(
    c.env.DB,
    `${bucket}:${ip}`,
    maxRequests,
    windowMs,
  );
  if (!allowed) {
    c.header('Retry-After', String(retryAfterSec));
    return c.json(
      { error: `Too many requests. Please try again in ${retryAfterSec} seconds.` },
      429,
    );
  }
  return null;
}

// ── Public Auth Routes ───────────────────────────────────────

/**
 * POST /api/auth/register
 * Rate limit: 8 registrations per hour per IP
 */
authApp.post('/register', async (c) => {
  const limited = await enforceRateLimit(c, 'auth:register', 8, 60 * 60 * 1000);
  if (limited) return limited;

  const { email, authHash, salt } = await c.req.json();
  const normalEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalEmail || !EMAIL_REGEX.test(normalEmail)) {
    return c.json({ error: 'Valid email address is required' }, 400);
  }
  if (!authHash || typeof authHash !== 'string' || authHash.length < 32) {
    return c.json({ error: 'Valid authHash is required' }, 400);
  }
  if (!salt || typeof salt !== 'string' || salt.length < 16) {
    return c.json({ error: 'Valid cryptographic salt is required' }, 400);
  }

  if (await getUserByEmail(c.env.DB, normalEmail)) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  const user = await createUser(c.env.DB, crypto.randomUUID(), normalEmail, authHash, salt);
  const token = await createToken(user.id, user.token_version ?? 1, getJwtSecret(c.env));

  return c.json({
    token,
    user: { id: user.id, email: user.email, salt: user.salt },
  });
});

/**
 * POST /api/auth/login
 * Constant-time authHash verification + rate limiting (10 attempts / 15 mins per IP+email)
 */
authApp.post('/login', async (c) => {
  const ipLimited = await enforceRateLimit(c, 'auth:login', 15, 15 * 60 * 1000);
  if (ipLimited) return ipLimited;

  const { email, authHash } = await c.req.json();
  const normalEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalEmail || !authHash || typeof authHash !== 'string') {
    return c.json({ error: 'email and authHash are required' }, 400);
  }

  const acctLimited = await enforceRateLimit(
    c,
    `auth:login_acct:${normalEmail}`,
    10,
    15 * 60 * 1000,
  );
  if (acctLimited) return acctLimited;

  const user = await getUserByEmail(c.env.DB, normalEmail);
  const isValid = user ? await constantTimeEqual(user.auth_hash, authHash) : false;

  if (!user || !isValid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const token = await createToken(user.id, user.token_version ?? 1, getJwtSecret(c.env));
  return c.json({
    token,
    user: { id: user.id, email: user.email, salt: user.salt },
  });
});

/**
 * GET /api/auth/salt?email=you@example.com
 * Anti-enumeration: always returns 200 with a valid 32-char hex salt.
 * For unregistered emails, returns a deterministic HMAC-derived dummy salt
 * so attackers cannot probe which email addresses exist.
 */
authApp.get('/salt', async (c) => {
  const limited = await enforceRateLimit(c, 'auth:salt', 30, 15 * 60 * 1000);
  if (limited) return limited;

  const email = c.req.query('email');
  if (!email || !email.trim()) {
    return c.json({ error: 'email query param is required' }, 400);
  }

  const normalEmail = email.trim().toLowerCase();
  const user = await getUserByEmail(c.env.DB, normalEmail);

  const salt = user
    ? user.salt
    : await deriveDeterministicFakeSalt(normalEmail, c.env);

  return c.json({ salt });
});

// ── Protected Session & Account Management Routes ────────────

/**
 * POST /api/auth/revoke-sessions
 * "Log Out All Devices": increments token_version so every existing JWT
 * across all browsers and mobile devices becomes immediately invalid.
 */
authApp.post('/revoke-sessions', async (c) => {
  const limited = await enforceRateLimit(c, 'auth:revoke', 10, 15 * 60 * 1000);
  if (limited) return limited;

  const auth = await authenticateRequest(c);
  if (!auth.ok) return auth.response;

  const newVersion = await incrementTokenVersion(c.env.DB, auth.user.id);

  return c.json({
    success: true,
    tokenVersion: newVersion,
    message: 'All active sessions across all devices have been revoked.',
  });
});

/**
 * DELETE /api/auth/account
 * Permanently deletes the user's account, vault items, and metadata.
 * Requires re-verifying authHash in constant time before destructive delete.
 */
authApp.delete('/account', async (c) => {
  const limited = await enforceRateLimit(c, 'auth:delete', 5, 15 * 60 * 1000);
  if (limited) return limited;

  const auth = await authenticateRequest(c);
  if (!auth.ok) return auth.response;

  const body = await c.req.json().catch(() => ({}));
  const authHash = typeof body?.authHash === 'string' ? body.authHash : '';

  if (!authHash) {
    return c.json({ error: 'Master password verification (authHash) is required' }, 400);
  }

  const verified = await constantTimeEqual(auth.user.auth_hash, authHash);
  if (!verified) {
    return c.json({ error: 'Incorrect Master Password' }, 401);
  }

  const deleted = await deleteUserAccount(c.env.DB, auth.user.id);
  if (!deleted) {
    return c.json({ error: 'Failed to delete account' }, 500);
  }

  return c.json({
    success: true,
    message: 'Account and all encrypted vault data have been permanently deleted.',
  });
});

export { authApp };
