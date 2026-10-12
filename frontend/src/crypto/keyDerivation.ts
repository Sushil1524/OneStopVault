/**
 * Web Crypto API Zero-Knowledge Key Derivation Module
 * PBKDF2-HMAC-SHA256 with 600,000 iterations
 */

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export interface DerivedKeys {
  vaultKey: CryptoKey;
  authKeyHash: string;
}

export async function deriveMasterKeys(masterPassword: string, saltHex: string): Promise<DerivedKeys> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(masterPassword);
  const saltBytes = hexToBytes(saltHex);

  // Import raw password as key material
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // PBKDF2 600,000 iterations (OWASP 2023 standard recommendation for SHA-256)
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 600000,
      hash: 'SHA-256',
    },
    baseKey,
    512 // Derive 512 bits (256 bits for Vault Key + 256 bits for Auth Key)
  );

  const derivedArray = new Uint8Array(derivedBits);
  const vaultKeyBits = derivedArray.slice(0, 32);
  const authKeyBits = derivedArray.slice(32, 64);

  // Import Vault Key as AES-256-GCM key for client encryption and quick unlock key wrapping
  const vaultKey = await crypto.subtle.importKey(
    'raw',
    vaultKeyBits,
    { name: 'AES-GCM', length: 256 },
    true, // Extractable so it can be securely wrapped for Quick PIN & Biometrics
    ['encrypt', 'decrypt']
  );

  // Hash Auth Key bits to produce Auth Key Hash sent to backend Worker
  const authHashBuffer = await crypto.subtle.digest('SHA-256', authKeyBits);
  const authKeyHash = Array.from(new Uint8Array(authHashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return { vaultKey, authKeyHash };
}
