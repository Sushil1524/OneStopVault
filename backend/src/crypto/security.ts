/**
 * crypto/security.ts
 * Shared authentication, JWT signing/verification, constant-time comparison,
 * anti-enumeration fake salt generation, and session revocation validation.
 */

import { Context } from 'hono';
import { Env, UserRow } from '../types.js';
import { getUserById } from '../db/queries.js';

const DEV_FALLBACK_SECRET = 'onestop-dev-jwt-secret-change-in-prod';

const b64url = (str: string) =>
  btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const b64urlDecode = (str: string) => {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
};

/**
 * Resolve JWT secret consistently across all routes.
 * Fails closed in production if JWT_SECRET is not explicitly configured.
 */
export function getJwtSecret(env: Env): string {
  if (env.JWT_SECRET && env.JWT_SECRET.trim().length > 0) {
    return env.JWT_SECRET;
  }
  if (env.ENVIRONMENT === 'production') {
    throw new Error('Server misconfiguration: JWT_SECRET environment variable is required in production.');
  }
  return DEV_FALLBACK_SECRET;
}

/** Create a signed JWT token containing userId (sub) and token_version (ver), valid for 7 days. */
export async function createToken(
  userId: string,
  tokenVersion: number,
  secret: string,
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: userId,
    ver: tokenVersion,
    iat: nowSec,
    exp: nowSec + 60 * 60 * 24 * 7, // 7 days
  }));
  const data = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;
}

/**
 * Verify JWT signature and expiration.
 * Returns { userId, tokenVersion } if valid, or null otherwise.
 */
export async function verifyToken(
  token: string,
  secret: string,
): Promise<{ userId: string; tokenVersion: number } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    if (!header || !payload || !signature) return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const sigBytes = Uint8Array.from(b64urlDecode(signature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    if (!valid) return null;

    const claims = JSON.parse(b64urlDecode(payload));
    if (!claims.sub || !claims.exp || claims.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      userId: String(claims.sub),
      tokenVersion: typeof claims.ver === 'number' ? claims.ver : 1,
    };
  } catch {
    return null;
  }
}

/**
 * Authenticate an incoming request:
 * 1. Validate Bearer JWT signature & expiration
 * 2. Verify user still exists in D1
 * 3. Verify JWT `ver` matches user's current `token_version` (enforces "Log Out All Devices")
 */
export async function authenticateRequest<E extends { Bindings: Env }>(
  c: Context<E>,
): Promise<{ ok: true; user: UserRow } | { ok: false; response: Response }> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      response: c.json({ error: 'Authorization header required' }, 401),
    };
  }

  const token = authHeader.substring(7);
  const secret = getJwtSecret(c.env);
  const verified = await verifyToken(token, secret);

  if (!verified) {
    return {
      ok: false,
      response: c.json({ error: 'Invalid or expired session token' }, 401),
    };
  }

  const user = await getUserById(c.env.DB, verified.userId);
  if (!user) {
    return {
      ok: false,
      response: c.json({ error: 'Account no longer exists' }, 401),
    };
  }

  const currentVersion = user.token_version ?? 1;
  if (verified.tokenVersion !== currentVersion) {
    return {
      ok: false,
      response: c.json({ error: 'Session revoked. Please sign in again.' }, 401),
    };
  }

  return { ok: true, user };
}

/**
 * Constant-time string comparison via SHA-256 digest XOR.
 * Prevents timing side-channel leaks when comparing auth hashes.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);

  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}

/**
 * Generate a deterministic 32-char hex salt (16 bytes) for unregistered emails.
 * Prevents attackers from using /api/auth/salt to enumerate registered accounts.
 */
export async function deriveDeterministicFakeSalt(
  email: string,
  env: Env,
): Promise<string> {
  const enc = new TextEncoder();
  const secretMaterial = env.SERVER_PEPPER || getJwtSecret(env);
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretMaterial),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const normalized = email.toLowerCase().trim();
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(`onestop:fake-salt:${normalized}`),
  );

  const first16 = new Uint8Array(sig).slice(0, 16);
  return Array.from(first16).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Extract client IP address from Cloudflare / proxy headers for rate limiting. */
export function getClientIp(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown-client'
  );
}
