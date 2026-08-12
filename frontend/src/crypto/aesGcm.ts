/**
 * Web Crypto API AES-256-GCM Encryption / Decryption Module
 */

import { DecryptedPayload } from '../types/vault.js';

export interface EncryptedData {
  ciphertext: string; // Base64 encoded
  iv: string;         // Base64 encoded
}

export async function encryptVaultItem(
  payload: DecryptedPayload,
  vaultKey: CryptoKey
): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const jsonStr = JSON.stringify(payload);
  const plaintext = encoder.encode(jsonStr);

  // Generate random 12-byte (96-bit) IV recommended for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    vaultKey,
    plaintext
  );

  const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  const ivBase64 = btoa(String.fromCharCode(...iv));

  return {
    ciphertext: ciphertextBase64,
    iv: ivBase64,
  };
}

export async function decryptVaultItem(
  ciphertextBase64: string,
  ivBase64: string,
  vaultKey: CryptoKey
): Promise<DecryptedPayload> {
  const ciphertextBytes = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes,
    },
    vaultKey,
    ciphertextBytes
  );

  const decoder = new TextDecoder();
  const jsonStr = decoder.decode(decryptedBuffer);
  return JSON.parse(jsonStr) as DecryptedPayload;
}
