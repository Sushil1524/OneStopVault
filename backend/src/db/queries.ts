/**
 * db/queries.ts
 * All Cloudflare D1 (SQLite) database operations in one file.
 * Each function does exactly one thing — easy to follow and test.
 */

import { UserRow, VaultItemRow, VaultMetadataRow } from '../types.js';

// ── User helpers ────────────────────────────────────────────

/** Look up a user by email address. Returns null if not found. */
export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email.toLowerCase().trim())
    .first<UserRow>() ?? null;
}

/** Create a new user row and initialise their empty vault metadata. */
export async function createUser(
  db: D1Database,
  id: string,
  email: string,
  authHash: string,
  salt: string,
): Promise<UserRow> {
  const now = Date.now();
  const normalEmail = email.toLowerCase().trim();

  await db.prepare('INSERT INTO users (id, email, auth_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, normalEmail, authHash, salt, now)
    .run();

  // Every user starts with an empty vault_metadata row
  await db.prepare('INSERT INTO vault_metadata (user_id, version, checksum, updated_at) VALUES (?, 1, ?, ?)')
    .bind(id, '', now)
    .run();

  return { id, email: normalEmail, auth_hash: authHash, salt, created_at: now };
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
 *
 * How checksums work:
 *   1. Collect a short "signature" string for every vault item: "<id>:<updatedAt>:<first32charsOfCiphertext>"
 *   2. Sort those strings so order doesn't matter.
 *   3. Hash the joined result with SHA-256.
 *   4. Save the hex hash in vault_metadata and bump the version counter.
 *
 * The frontend does the same calculation locally — if both match, the vault is in sync.
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
