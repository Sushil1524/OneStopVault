// Vault item types — only login (with optional 2FA) is supported
export type ItemType = 'login' | 'note';

// The decrypted contents of a vault item (stored in browser RAM only)
export interface DecryptedPayload {
  name: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  totpSecret?: string; // Base32 secret for TOTP 2FA codes (e.g. from Google Authenticator)
  favorite?: boolean;
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
  authKeyHash: string;   // Hash sent to server for authentication (not the password)
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
