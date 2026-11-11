/**
 * db/queries.ts
 * All Cloudflare D1 (SQLite) database operations in one file.
 * Each function does exactly one thing — easy to follow and test.
 */

import { UserRow, VaultItemRow, VaultMetadataRow } from '../types.js';

let schemaChecked = false;
let schemaPromise: Promise<void> | null = null;

/**
 * Ensures backward-compatible security schema upgrades exist in live D1 databases:
 * - Adds `token_version` column to `users` if running against an older DB
 * - Ensures `rate_limits` table exists
 * Runs at most once per Worker isolate.
 */
export async function ensureSecuritySchema(db: D1Database): Promise<void> {
  if (schemaChecked) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    try {
      const { results } = await db.prepare('PRAGMA table_info(users)').all<{ name: string }>();
      const hasTokenVersion = (results ?? []).some(col => col.name === 'token_version');
      if (!hasTokenVersion) {
        await db.prepare('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1').run();
      }

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          reset_at INTEGER NOT NULL
        )
      `).run();

      schemaChecked = true;
    } catch (err) {
      // Reset promise on transient error so next request can retry
      schemaPromise = null;
      throw err;
    }
  })();

  return schemaPromise;
}

// ── User helpers ────────────────────────────────────────────

/** Look up a user by email address. Returns null if not found. */
export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  await ensureSecuritySchema(db);
  return (await db.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email.toLowerCase().trim())
    .first<UserRow>()) ?? null;
}

/** Look up a user by ID. Returns null if not found. */
export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  await ensureSecuritySchema(db);
  return (await db.prepare('SELECT * FROM users WHERE id = ?')
    .bind(id)
    .first<UserRow>()) ?? null;
}

/** Create a new user row and initialise their empty vault metadata. */
export async function createUser(
  db: D1Database,
  id: string,
  email: string,
  authHash: string,
  salt: string,
): Promise<UserRow> {
  await ensureSecuritySchema(db);
  const now = Date.now();
  const normalEmail = email.toLowerCase().trim();

  await db.batch([
    db.prepare('INSERT INTO users (id, email, auth_hash, salt, token_version, created_at) VALUES (?, ?, ?, ?, 1, ?)')
      .bind(id, normalEmail, authHash, salt, now),
    db.prepare('INSERT INTO vault_metadata (user_id, version, checksum, updated_at) VALUES (?, 1, ?, ?)')
      .bind(id, '', now),
  ]);

  return { id, email: normalEmail, auth_hash: authHash, salt, token_version: 1, created_at: now };
}

/** Increment token_version to immediately invalidate all existing JWT sessions for a user. */
export async function incrementTokenVersion(db: D1Database, userId: string): Promise<number> {
  await ensureSecuritySchema(db);
  await db.prepare('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?')
    .bind(userId)
    .run();

  const row = await db.prepare('SELECT token_version FROM users WHERE id = ?')
    .bind(userId)
    .first<{ token_version: number }>();

  return row?.token_version ?? 1;
}

/** Permanently delete a user account, all encrypted vault items, and metadata. */
export async function deleteUserAccount(db: D1Database, userId: string): Promise<boolean> {
  await ensureSecuritySchema(db);
  const results = await db.batch([
    db.prepare('DELETE FROM vault_items WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM vault_metadata WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);

  const userDelete = results[2];
  return Boolean(userDelete?.success);
}

// ── Rate Limiting helpers ───────────────────────────────────

/**
 * Sliding/fixed window rate limiter backed by D1.
 * Prevents brute-force credential stuffing and salt/account probing across Worker isolates.
 */
export async function checkRateLimit(
  db: D1Database,
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  await ensureSecuritySchema(db);
  const now = Date.now();

  const existing = await db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<{ count: number; reset_at: number }>();

  if (!existing || existing.reset_at <= now) {
    const resetAt = now + windowMs;
    await db.prepare(`
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = 1,
        reset_at = excluded.reset_at
    `).bind(key, resetAt).run();
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.count >= maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.reset_at - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?')
    .bind(key)
    .run();

  return { allowed: true, retryAfterSec: 0 };
}

// ── Vault item helpers ───────────────────────────────────────

/** Get all encrypted vault items for a user, newest first. */
export async function getVaultItems(db: D1Database, userId: string): Promise<VaultItemRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM vault_items WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(userId)
    .all<VaultItemRow>();
  return results ?? [];
}

/**
 * Insert a new vault item or update an existing one (upsert).
 * After writing, the vault checksum is recalculated automatically.
 */
export async function upsertVaultItem(
  db: D1Database,
  item: { id: string; user_id: string; ciphertext: string; iv: string; item_type: string },
): Promise<void> {
  const now = Date.now();

  await db.prepare(`
    INSERT INTO vault_items (id, user_id, ciphertext, iv, item_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ciphertext = excluded.ciphertext,
      iv         = excluded.iv,
      item_type  = excluded.item_type,
      updated_at = excluded.updated_at
  `).bind(item.id, item.user_id, item.ciphertext, item.iv, item.item_type || 'login', now, now)
    .run();

  await refreshChecksum(db, item.user_id);
}

/**
 * Delete a vault item. Returns true if the row was found and removed.
 * Checksum is recalculated after a successful delete.
 */
export async function deleteVaultItem(db: D1Database, id: string, userId: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM vault_items WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.success) {
    await refreshChecksum(db, userId);
    return true;
  }
  return false;
}

// ── Vault metadata helpers ───────────────────────────────────

/**
 * Get vault sync metadata (version + checksum) for a user.
 * Creates an empty metadata row if one doesn't exist yet.
 */
export async function getVaultMetadata(db: D1Database, userId: string): Promise<VaultMetadataRow> {
  const row = await db
    .prepare('SELECT * FROM vault_metadata WHERE user_id = ?')
    .bind(userId)
    .first<VaultMetadataRow>();

  if (row) return row;

  // First time — create the row and return defaults
  const now = Date.now();
  await db.prepare('INSERT INTO vault_metadata (user_id, version, checksum, updated_at) VALUES (?, 1, ?, ?)')
    .bind(userId, '', now)
    .run();
  return { user_id: userId, version: 1, checksum: '', updated_at: now };
}

/**
 * Recompute the SHA-256 vault checksum from all current items and store it.
 */
export async function refreshChecksum(db: D1Database, userId: string): Promise<string> {
  const items = await getVaultItems(db, userId);

  const input = items
    .map(i => `${i.id}:${i.updated_at}:${i.ciphertext.substring(0, 32)}`)
    .sort()
    .join('|');

  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const checksum = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  await db.prepare('UPDATE vault_metadata SET version = version + 1, checksum = ?, updated_at = ? WHERE user_id = ?')
    .bind(checksum, Date.now(), userId)
    .run();

  return checksum;
}
