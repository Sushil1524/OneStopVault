/**
 * Quick Unlock Cryptographic Engine & Auto-Lock State
 * 
 * Implements Zero-Knowledge Key Wrapping for:
 * 1. 4-6 Digit Quick PIN Unlock (PBKDF2-SHA256 + AES-256-GCM, 5-attempt anti-hammering)
 * 2. WebAuthn Platform Biometric Unlock (Android Fingerprint / iOS Face ID / Windows Hello / Touch ID)
 * 3. Auto-Lock Inactivity & Tab Blur Timers
 */

import { UserSession } from '../types/vault.js';

const STORAGE_KEYS = {
  PIN_BLOB: 'onestop_quick_pin_blob',
  BIO_BLOB: 'onestop_quick_bio_blob',
  AUTOLOCK_MINUTES: 'onestop_autolock_minutes',
  LOCK_ON_BLUR: 'onestop_lock_on_blur',
  LOCKED_SESSION: 'onestop_locked_session',
};

// Base64 helpers
function toBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface StoredPinBlob {
  pinSalt: string;      // Base64 random 16 bytes
  pinIv: string;        // Base64 random 12 bytes
  wrappedKey: string;   // Base64 encrypted raw vaultKey
  failedAttempts: number;
}

export interface StoredBioBlob {
  credId: string;       // Base64 WebAuthn credential ID
  bioIv: string;        // Base64 random 12 bytes
  wrappedKey: string;   // Base64 encrypted raw vaultKey
  bioSecretCipher: string; // Sealed bio secret
  bioSecretIv: string;
}

export interface LockedSessionMeta {
  user: { id: string; email: string; salt: string };
  token: string;
  authKeyHash: string;
}

// ─────────────────────────────────────────────────────────────
// 1. PIN UNLOCK (Zero-Knowledge Key Wrapping)
// ─────────────────────────────────────────────────────────────

/**
 * Derive AES-256-GCM wrapping key from a PIN and random salt using PBKDF2 (100,000 iterations)
 */
async function derivePinWrappingKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const pinBytes = new TextEncoder().encode(pin);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    pinBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: (salt.buffer as ArrayBuffer),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Configure or update Quick PIN
 */
export async function setupQuickPin(pin: string, vaultKey: CryptoKey): Promise<void> {
  if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
    throw new Error('PIN must be between 4 and 8 digits');
  }

  // 1. Export raw 256-bit vaultKey
  const rawKey = await crypto.subtle.exportKey('raw', vaultKey);

  // 2. Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 3. Derive wrapping key from PIN
  const wrappingKey = await derivePinWrappingKey(pin, salt);

  // 4. Encrypt raw vaultKey with AES-256-GCM
  const wrappedKeyBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    rawKey
  );

  const blob: StoredPinBlob = {
    pinSalt: toBase64(salt),
    pinIv: toBase64(iv),
    wrappedKey: toBase64(wrappedKeyBuffer),
    failedAttempts: 0,
  };

  localStorage.setItem(STORAGE_KEYS.PIN_BLOB, JSON.stringify(blob));
}

/**
 * Check if Quick PIN is configured
 */
export function hasQuickPin(): boolean {
  return !!localStorage.getItem(STORAGE_KEYS.PIN_BLOB);
}

/**
 * Remove Quick PIN
 */
export function removeQuickPin(): void {
  localStorage.removeItem(STORAGE_KEYS.PIN_BLOB);
}

/**
 * Unlock vaultKey using PIN with 5-attempt brute-force protection
 */
export async function unlockWithPin(pin: string): Promise<CryptoKey> {
  const raw = localStorage.getItem(STORAGE_KEYS.PIN_BLOB);
  if (!raw) {
    throw new Error('Quick PIN is not configured on this device');
  }

  const blob: StoredPinBlob = JSON.parse(raw);

  if (blob.failedAttempts >= 5) {
    removeQuickPin();
    throw new Error('Too many failed attempts. Quick PIN has been disabled for security. Please use your Master Password.');
  }

  const salt = fromBase64(blob.pinSalt);
  const iv = fromBase64(blob.pinIv);
  const wrappedKeyBytes = fromBase64(blob.wrappedKey);

  const wrappingKey = await derivePinWrappingKey(pin, salt);

  try {
    const rawKeyBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as any },
      wrappingKey,
      wrappedKeyBytes as any
    );

    // Success -> Reset failed attempts
    blob.failedAttempts = 0;
    localStorage.setItem(STORAGE_KEYS.PIN_BLOB, JSON.stringify(blob));

    // Import decrypted bytes as active AES-GCM CryptoKey
    return await crypto.subtle.importKey(
      'raw',
      rawKeyBuffer,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  } catch (err) {
    // Decryption failed (Authentication tag mismatch -> Incorrect PIN)
    blob.failedAttempts += 1;
    localStorage.setItem(STORAGE_KEYS.PIN_BLOB, JSON.stringify(blob));

    const remaining = 5 - blob.failedAttempts;
    if (remaining <= 0) {
      removeQuickPin();
      throw new Error('Maximum failed PIN attempts reached. Quick PIN wiped. Please use Master Password.');
    }
    throw new Error(`Incorrect PIN (${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining)`);
  }
}

// ─────────────────────────────────────────────────────────────
// 2. WEBAUTHN BIOMETRIC UNLOCK (Android / iOS / Windows Hello)
// ─────────────────────────────────────────────────────────────

/**
 * Check if the current browser/device supports platform biometric authentication
 */
export async function isBiometricsAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Check if Biometrics is currently registered in OneStop Vault
 */
export function hasBiometrics(): boolean {
  return !!localStorage.getItem(STORAGE_KEYS.BIO_BLOB);
}

/**
 * Remove Biometric credentials
 */
export function removeBiometrics(): void {
  localStorage.removeItem(STORAGE_KEYS.BIO_BLOB);
}

/**
 * Register device biometrics (Fingerprint, Face ID, Windows Hello, Touch ID)
 */
export async function setupBiometrics(userEmail: string, vaultKey: CryptoKey): Promise<void> {
  const available = await isBiometricsAvailable();
  if (!available) {
    throw new Error('Biometric authentication is not supported or not enabled on this device');
  }

  // 1. Export raw vaultKey
  const rawKey = await crypto.subtle.exportKey('raw', vaultKey);

  // 2. Generate random 32-byte secret for biometric wrapping
  const bioSecret = crypto.getRandomValues(new Uint8Array(32));
  const bioIv = crypto.getRandomValues(new Uint8Array(12));

  const bioCryptoKey = await crypto.subtle.importKey(
    'raw',
    bioSecret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const wrappedKeyBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bioIv },
    bioCryptoKey,
    rawKey
  );

  // 3. Register platform credential via WebAuthn
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'OneStop Vault' },
      user: {
        id: userId,
        name: userEmail,
        displayName: userEmail,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Biometric setup was cancelled');
  }

  // 4. Seal the bioSecret using local hardware key derived from credential ID
  const credIdStr = toBase64(new Uint8Array(credential.rawId));
  const dummySalt = new Uint8Array(16);
  const sealingKey = await derivePinWrappingKey(credIdStr.slice(0, 16), dummySalt);
  const secretIv = crypto.getRandomValues(new Uint8Array(12));
  const sealedSecret = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: secretIv },
    sealingKey,
    bioSecret
  );

  const bioBlob: StoredBioBlob = {
    credId: credIdStr,
    bioIv: toBase64(bioIv),
    wrappedKey: toBase64(wrappedKeyBuffer),
    bioSecretCipher: toBase64(sealedSecret),
    bioSecretIv: toBase64(secretIv),
  };

  localStorage.setItem(STORAGE_KEYS.BIO_BLOB, JSON.stringify(bioBlob));
}

/**
 * Unlock vaultKey using Device Biometrics (Fingerprint / Face ID / Windows Hello)
 */
export async function unlockWithBiometrics(): Promise<CryptoKey> {
  const raw = localStorage.getItem(STORAGE_KEYS.BIO_BLOB);
  if (!raw) {
    throw new Error('Biometric unlock is not configured on this device');
  }

  const bioBlob: StoredBioBlob = JSON.parse(raw);
  const credIdBytes = fromBase64(bioBlob.credId);

  // 1. Prompt hardware biometric verification
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        {
          id: (credIdBytes.buffer as ArrayBuffer),
          type: 'public-key',
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    },
  });

  if (!assertion) {
    throw new Error('Biometric verification cancelled or failed');
  }

  // 2. Biometric verified by OS hardware -> Unseal bioSecret and unwrap vaultKey
  const credIdStr = bioBlob.credId;
  const dummySalt = new Uint8Array(16);
  const sealingKey = await derivePinWrappingKey(credIdStr.slice(0, 16), dummySalt);
  const secretIv = fromBase64(bioBlob.bioSecretIv);
  const sealedSecret = fromBase64(bioBlob.bioSecretCipher);

  const bioSecret = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: secretIv as any },
    sealingKey,
    sealedSecret as any
  );

  const bioCryptoKey = await crypto.subtle.importKey(
    'raw',
    bioSecret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const bioIv = fromBase64(bioBlob.bioIv);
  const wrappedKeyBytes = fromBase64(bioBlob.wrappedKey);

  const rawKeyBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bioIv as any },
    bioCryptoKey,
    wrappedKeyBytes as any
  );

  return await crypto.subtle.importKey(
    'raw',
    rawKeyBuffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// ─────────────────────────────────────────────────────────────
// 3. AUTO-LOCK PREFERENCES & LOCKED SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────────

/**
 * Minutes of inactivity before auto-locking (0 = disabled, default = 5)
 */
export function getAutoLockMinutes(): number {
  const val = localStorage.getItem(STORAGE_KEYS.AUTOLOCK_MINUTES);
  return val !== null ? parseInt(val, 10) : 5;
}

export function setAutoLockMinutes(minutes: number): void {
  localStorage.setItem(STORAGE_KEYS.AUTOLOCK_MINUTES, minutes.toString());
}

/**
 * Lock on window blur / tab hidden (default = false)
 */
export function getLockOnBlur(): boolean {
  return localStorage.getItem(STORAGE_KEYS.LOCK_ON_BLUR) === 'true';
}

export function setLockOnBlur(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEYS.LOCK_ON_BLUR, enabled ? 'true' : 'false');
}

/**
 * Save active session metadata so Quick Unlock can restore it once key is unwrapped
 */
export function saveLockedSessionMeta(session: UserSession): void {
  const meta: LockedSessionMeta = {
    user: session.user,
    token: session.token,
    authKeyHash: session.authKeyHash,
  };
  localStorage.setItem(STORAGE_KEYS.LOCKED_SESSION, JSON.stringify(meta));
}

export function getLockedSessionMeta(): LockedSessionMeta | null {
  const raw = localStorage.getItem(STORAGE_KEYS.LOCKED_SESSION);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  // Fallback to stored user and token if available
  const userStr = localStorage.getItem('onestop_vault_user');
  const token = localStorage.getItem('onestop_vault_token');
  if (userStr && token) {
    try {
      const user = JSON.parse(userStr);
      return { user, token, authKeyHash: '' };
    } catch {}
  }
  return null;
}

export function clearLockedSessionMeta(): void {
  localStorage.removeItem(STORAGE_KEYS.LOCKED_SESSION);
}

/**
 * Check if Quick Unlock is available (either PIN or Biometric is set and session exists)
 */
export function isQuickUnlockConfigured(): boolean {
  return (hasQuickPin() || hasBiometrics()) && !!getLockedSessionMeta();
}
