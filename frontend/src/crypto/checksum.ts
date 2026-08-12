/**
 * Vault Checksum Calculation Module
 * Generates SHA-256 fingerprint matching the Cloudflare Worker algorithm.
 */

import { VaultItem } from '../types/vault.js';

export async function calculateVaultChecksum(items: VaultItem[]): Promise<string> {
  if (!items || items.length === 0) {
    return '';
  }

  // Sort by item ID for deterministic ordering
  const sortedSignatures = items
    .map(i => `${i.id}:${i.updatedAt}:${i.ciphertext.substring(0, 32)}`)
    .sort()
    .join('|');

  const encoder = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(sortedSignatures));
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
