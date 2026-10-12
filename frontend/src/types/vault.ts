// Vault item types — login (with optional 2FA), secure note, or developer secret / API key
export type ItemType = 'login' | 'note' | 'secret';

// The decrypted contents of a vault item (stored in browser RAM only)
export interface DecryptedPayload {
  name: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  totpSecret?: string; // Base32 secret for TOTP 2FA codes
  tags?: string[];     // Category tags (e.g. Social, Work, Finance, Personal, API, Dev)
  favorite?: boolean;
  
  // Developer Secrets & API Keys
  secretValue?: string; // Raw API Key, Token, Private Key, Connection String
  environment?: string; // e.g. Production, Staging, Development, Test

  // Soft Delete / Trash Recovery
  deletedAt?: number;   // Timestamp (ms) when item was moved to trash; undefined if active
}

// A single vault entry (encrypted on disk/network, decrypted only in memory)
export interface VaultItem {
  id: string;
  itemType: ItemType;
  ciphertext: string; // AES-256-GCM encrypted JSON blob (base64)
  iv: string;         // AES-GCM initialisation vector (base64)
  createdAt: number;
  updatedAt: number;
  decrypted?: DecryptedPayload; // Only present when vault is unlocked in RAM
}

// Vault sync metadata returned by the Cloudflare Worker
export interface VaultMetadata {
  version: number;
  checksum: string; // SHA-256 fingerprint of all vault items
  updatedAt: number;
}

// Active user session — vaultKey lives only in browser RAM, never stored
export interface UserSession {
  token: string;
  user: { id: string; email: string; salt: string };
  vaultKey: CryptoKey;   // AES-256-GCM key — purged from RAM on lock
  authKeyHash: string;   // Hash sent to server for authentication
}

// Describes the live sync state shown in the navbar badge
export type SyncState = 'IN_SYNC' | 'SYNCING' | 'MISMATCH' | 'OFFLINE' | 'ERROR';

// Result of a HaveIBeenPwned password leak check for one vault item
export interface BreachAuditResult {
  itemId: string;
  name: string;
  username?: string;
  isBreached: boolean;
  breachCount: number;
}
