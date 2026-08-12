export interface Env {
  DB: D1Database;
  SERVER_PEPPER?: string;
  JWT_SECRET?: string;
  ENVIRONMENT?: string;
}

export interface UserRow {
  id: string;
  email: string;
  auth_hash: string;
  salt: string;
  created_at: number;
}

export interface VaultItemRow {
  id: string;
  user_id: string;
  ciphertext: string;
  iv: string;
  item_type: string;
  created_at: number;
  updated_at: number;
}

export interface VaultMetadataRow {
  user_id: string;
  version: number;
  checksum: string;
  updated_at: number;
}
