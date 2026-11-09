import { BIP39_WORDLIST } from './bip39Wordlist.js';

export type MnemonicWordCount = 12 | 18 | 24;

/**
 * Generate cryptographically secure BIP-39 mnemonic phrase using Web Crypto CSPRNG.
 * - 12 words: 128-bit entropy + 4-bit SHA-256 checksum = 132 bits / 11 = 12 words
 * - 18 words: 192-bit entropy + 6-bit SHA-256 checksum = 198 bits / 11 = 18 words
 * - 24 words: 256-bit entropy + 8-bit SHA-256 checksum = 264 bits / 11 = 24 words
 */
export async function generateBip39Mnemonic(wordCount: MnemonicWordCount = 12): Promise<string> {
  const entropyBits = wordCount === 12 ? 128 : wordCount === 18 ? 192 : 256;
  const entropyBytes = entropyBits / 8;
  const checksumBits = entropyBits / 32;

  // 1. Generate CSPRNG entropy
  const entropy = new Uint8Array(entropyBytes);
  crypto.getRandomValues(entropy);

  // 2. Calculate SHA-256 checksum
  const hashBuffer = await crypto.subtle.digest('SHA-256', entropy);
  const hashBytes = new Uint8Array(hashBuffer);

  // 3. Convert entropy bytes to binary string
  let binaryStr = '';
  for (let i = 0; i < entropy.length; i++) {
    binaryStr += entropy[i].toString(2).padStart(8, '0');
  }

  // 4. Append checksum bits from first hash byte(s)
  let checksumBinaryStr = '';
  for (let i = 0; i < hashBytes.length; i++) {
    checksumBinaryStr += hashBytes[i].toString(2).padStart(8, '0');
    if (checksumBinaryStr.length >= checksumBits) break;
  }
  binaryStr += checksumBinaryStr.slice(0, checksumBits);

  // 5. Slice into 11-bit chunks and map to BIP-39 wordlist
  const words: string[] = [];
  for (let i = 0; i < binaryStr.length; i += 11) {
    const chunk = binaryStr.slice(i, i + 11);
    const index = parseInt(chunk, 2);
    words.push(BIP39_WORDLIST[index]);
  }

  return words.join(' ');
}

/**
 * Validate a BIP-39 mnemonic:
 * - Ensures word count is 12, 18, or 24
 * - Ensures every word is in the canonical BIP-39 dictionary
 * - Verifies the SHA-256 checksum bits
 */
export async function validateBip39Mnemonic(mnemonic: string): Promise<{ valid: boolean; error?: string }> {
  const trimmed = mnemonic.trim().toLowerCase();
  if (!trimmed) return { valid: false, error: 'Mnemonic is empty.' };

  const words = trimmed.split(/\s+/);
  if (words.length !== 12 && words.length !== 18 && words.length !== 24) {
    return { valid: false, error: `Invalid word count (${words.length}). BIP-39 requires 12, 18, or 24 words.` };
  }

  // Wordlist lookup set for O(1) checking
  const wordMap = new Map<string, number>();
  for (let i = 0; i < BIP39_WORDLIST.length; i++) {
    wordMap.set(BIP39_WORDLIST[i], i);
  }

  let binaryStr = '';
  for (let i = 0; i < words.length; i++) {
    const index = wordMap.get(words[i]);
    if (index === undefined) {
      return { valid: false, error: `Word #${i + 1} "${words[i]}" is not a valid BIP-39 English word.` };
    }
    binaryStr += index.toString(2).padStart(11, '0');
  }

  const checksumBits = words.length / 3;
  const entropyBits = binaryStr.length - checksumBits;
  const entropyBinaryStr = binaryStr.slice(0, entropyBits);
  const expectedChecksumBits = binaryStr.slice(entropyBits);

  // Rebuild entropy bytes
  const entropyBytes = new Uint8Array(entropyBits / 8);
  for (let i = 0; i < entropyBytes.length; i++) {
    entropyBytes[i] = parseInt(entropyBinaryStr.slice(i * 8, (i + 1) * 8), 2);
  }

  // Calculate actual SHA-256 checksum
  const hashBuffer = await crypto.subtle.digest('SHA-256', entropyBytes);
  const hashBytes = new Uint8Array(hashBuffer);

  let actualChecksumBinaryStr = '';
  for (let i = 0; i < hashBytes.length; i++) {
    actualChecksumBinaryStr += hashBytes[i].toString(2).padStart(8, '0');
    if (actualChecksumBinaryStr.length >= checksumBits) break;
  }
  const actualChecksumBits = actualChecksumBinaryStr.slice(0, checksumBits);

  if (actualChecksumBits !== expectedChecksumBits) {
    return { valid: false, error: 'Mnemonic checksum validation failed. Check for mistyped or transposed words.' };
  }

  return { valid: true };
}

/**
 * Derives a 512-bit (64-byte) seed from a BIP-39 mnemonic + optional passphrase
 * using PBKDF2-HMAC-SHA512 with 2,048 iterations (BIP-39 standard).
 */
export async function mnemonicToSeed(mnemonic: string, passphrase = ''): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const normalizedMnemonic = mnemonic.trim().toLowerCase().normalize('NFKD');
  const normalizedSalt = ('mnemonic' + passphrase).normalize('NFKD');

  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(normalizedMnemonic),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(normalizedSalt),
      iterations: 2048,
      hash: 'SHA-512',
    },
    baseKey,
    512
  );

  return new Uint8Array(derivedBits);
}

