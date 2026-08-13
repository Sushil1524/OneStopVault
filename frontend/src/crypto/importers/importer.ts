/**
 * Universal Vault & 2FA Importer Engine
 * Supports importing credentials and 2FA secrets from:
 * - Chrome / Firefox / Edge / Brave CSV & JSON exports (.csv, .json, .kv)
 * - Bitwarden JSON & CSV (.json, .csv)
 * - 2FAS Authenticator exports (.2fas, .json, .enc)
 * - Aegis Authenticator exports (.json, .txt, .enc, .aegis, .encrypt)
 * - 1Password CSV & JSON
 * - Password-protected / Encrypted JSON & AES backups
 *
 * ALL DECRYPTION AND PARSING HAPPENS 100% LOCALLY IN BROWSER MEMORY.
 * Nothing is transmitted over the network until items are re-encrypted with OneStop Vault AES-256-GCM.
 */

import { DecryptedPayload, ItemType } from '../../types/vault.js';

export interface ImportResultItem {
  name: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  totpSecret?: string;
  tags?: string[];
  itemType: ItemType;
}

export interface ParseOutcome {
  requiresPassword?: boolean;
  formatName?: string;
  items?: ImportResultItem[];
  error?: string;
}

/**
 * Normalise 2FA TOTP secret keys (extract secret from otpauth:// URIs if needed)
 */
export function cleanTotpSecret(secretOrUri?: string): string | undefined {
  if (!secretOrUri) return undefined;
  const str = secretOrUri.trim();

  // If it's an otpauth:// totp URI, parse the secret param
  if (str.startsWith('otpauth://')) {
    try {
      const url = new URL(str);
      const secret = url.searchParams.get('secret');
      if (secret) return secret.toUpperCase().replace(/\s+/g, '');
    } catch {
      // Fall through
    }
  }

  // Raw base32 string cleanup
  const cleaned = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  return cleaned.length >= 8 ? cleaned : undefined;
}

/**
 * Parse CSV format (Chrome, Firefox, Bitwarden, 1Password, etc.)
 */
function parseCSV(text: string): ImportResultItem[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase());
  const items: ImportResultItem[] = [];

  const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('title'));
  const userIdx = headers.findIndex(h => h.includes('user') || h.includes('login') || h.includes('email'));
  const passIdx = headers.findIndex(h => h.includes('pass') || h.includes('secret'));
  const urlIdx = headers.findIndex(h => h.includes('url') || h.includes('site') || h.includes('link'));
  const noteIdx = headers.findIndex(h => h.includes('note') || h.includes('comment'));
  const totpIdx = headers.findIndex(h => h.includes('totp') || h.includes('2fa') || h.includes('otp'));

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length === 0) continue;

    const name = (nameIdx >= 0 ? cols[nameIdx] : '') || (urlIdx >= 0 ? cols[urlIdx] : '') || 'Imported Login';
    const username = userIdx >= 0 ? cols[userIdx] : '';
    const password = passIdx >= 0 ? cols[passIdx] : '';
    const url = urlIdx >= 0 ? cols[urlIdx] : '';
    const notes = noteIdx >= 0 ? cols[noteIdx] : '';
    const totpSecret = cleanTotpSecret(totpIdx >= 0 ? cols[totpIdx] : undefined);

    if (name || username || password) {
      items.push({
        name: name || 'Imported Entry',
        username,
        password,
        url,
        notes,
        totpSecret,
        tags: ['Imported'],
        itemType: 'login',
      });
    }
  }

  return items;
}

/**
 * Attempt to decrypt password-protected Aegis encrypted JSON backup using Web Crypto API
 */
async function decryptAegisBackup(jsonObj: any, password: string): Promise<any> {
  const header = jsonObj.header;
  const dbBase64 = jsonObj.db;

  if (!header || !dbBase64 || !header.params || !header.slots) {
    throw new Error('Invalid Aegis encrypted backup structure');
  }

  // Find password slot (type 1)
  const slot = header.slots.find((s: any) => s.type === 1);
  if (!slot) {
    throw new Error('No password slot found in Aegis backup');
  }

  const saltBytes = Uint8Array.from(atob(header.params.salt), c => c.charCodeAt(0));
  const slotKeyBytes = Uint8Array.from(atob(slot.key), c => c.charCodeAt(0));
  const slotParams = slot.params; // { nonce: ..., tag: ... }

  // 1. Derive master key from password using PBKDF2
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: header.params.iterations || 100000,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  // 2. Decrypt slot key using AES-GCM
  const derivedCryptoKey = await crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const slotNonce = Uint8Array.from(atob(slotParams.nonce), c => c.charCodeAt(0));

  // Combine slot key + tag for Web Crypto AES-GCM
  const slotTag = Uint8Array.from(atob(slotParams.tag), c => c.charCodeAt(0));
  const ciphertextWithTag = new Uint8Array(slotKeyBytes.length + slotTag.length);
  ciphertextWithTag.set(slotKeyBytes);
  ciphertextWithTag.set(slotTag, slotKeyBytes.length);

  const masterKeyBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: slotNonce },
    derivedCryptoKey,
    ciphertextWithTag
  );

  // 3. Decrypt main DB payload using Master Key
  const masterCryptoKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const dbBytes = Uint8Array.from(atob(dbBase64), c => c.charCodeAt(0));
  const dbNonce = Uint8Array.from(atob(header.params.nonce), c => c.charCodeAt(0));
  const dbTag = Uint8Array.from(atob(header.params.tag), c => c.charCodeAt(0));

  const dbCiphertextWithTag = new Uint8Array(dbBytes.length + dbTag.length);
  dbCiphertextWithTag.set(dbBytes);
  dbCiphertextWithTag.set(dbTag, dbBytes.length);

  const decryptedDbBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: dbNonce },
    masterCryptoKey,
    dbCiphertextWithTag
  );

  const decodedJsonStr = new TextDecoder().decode(decryptedDbBuf);
  return JSON.parse(decodedJsonStr);
}

/**
 * Decrypt 2FAS encrypted backup using Web Crypto API
 */
async function decrypt2FASBackup(jsonObj: any, password: string): Promise<any> {
  // 2FAS encrypted schema: { services: "...", salt: "...", iv: "..." }
  const saltHex = jsonObj.salt;
  const ivHex = jsonObj.iv;
  const ciphertextBase64 = jsonObj.services;

  if (!saltHex || !ivHex || !ciphertextBase64) {
    throw new Error('Invalid 2FAS encrypted backup file');
  }

  const hexToBytes = (hex: string) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  };

  const saltBytes = hexToBytes(saltHex);
  const ivBytes = hexToBytes(ivHex);
  const ciphertextBytes = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));

  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 10000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    aesKey,
    ciphertextBytes
  );

  const jsonStr = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(jsonStr);
}

/**
 * Universal Importer parsing entry point
 */
export async function parseImportFile(fileContent: string, filePassword?: string): Promise<ParseOutcome> {
  const trimmed = fileContent.trim();

  // 1. Try parsing JSON format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);

      // Check if Aegis Encrypted Backup
      if (parsed.header && parsed.db && typeof parsed.db === 'string') {
        if (!filePassword) {
          return { requiresPassword: true, formatName: 'Aegis Authenticator (Encrypted)' };
        }
        try {
          const decryptedDb = await decryptAegisBackup(parsed, filePassword);
          return parseAegisJSON(decryptedDb);
        } catch (e: any) {
          return { requiresPassword: true, error: 'Incorrect decryption password for Aegis backup' };
        }
      }

      // Check if 2FAS Encrypted Backup
      if (parsed.services && typeof parsed.services === 'string' && parsed.salt && parsed.iv) {
        if (!filePassword) {
          return { requiresPassword: true, formatName: '2FAS Authenticator (Encrypted)' };
        }
        try {
          const decryptedServices = await decrypt2FASBackup(parsed, filePassword);
          return parse2FASJSON(decryptedServices);
        } catch (e: any) {
          return { requiresPassword: true, error: 'Incorrect decryption password for 2FAS backup' };
        }
      }

      // Plaintext 2FAS Backup
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name && parsed[0].secret) {
        return parse2FASJSON(parsed);
      }

      // Plaintext Aegis Backup
      if (parsed.db && parsed.db.entries && Array.isArray(parsed.db.entries)) {
        return parseAegisJSON(parsed);
      }

      // Bitwarden / Standard Vault JSON export
      if (parsed.items && Array.isArray(parsed.items)) {
        return parseBitwardenJSON(parsed.items);
      }

      // Generic JSON array of logins/credentials
      if (Array.isArray(parsed)) {
        return parseGenericJSONArray(parsed);
      }

    } catch (err: any) {
      if (err.message && err.message.includes('password')) {
        return { requiresPassword: true, error: err.message };
      }
    }
  }

  // 2. Try parsing CSV format
  if (trimmed.includes(',') && trimmed.includes('\n')) {
    const csvItems = parseCSV(trimmed);
    if (csvItems.length > 0) {
      return { formatName: 'CSV Export (Chrome/Firefox/Bitwarden)', items: csvItems };
    }
  }

  return { error: 'Unrecognized file format or empty backup file' };
}

/**
 * Parse Aegis Authenticator JSON DB structure
 */
function parseAegisJSON(jsonObj: any): ParseOutcome {
  const entries = jsonObj.db?.entries || jsonObj.entries || [];
  const items: ImportResultItem[] = [];

  for (const entry of entries) {
    const name = entry.name || entry.issuer || 'Aegis 2FA';
    const username = entry.info?.label || entry.issuer || '';
    const secret = cleanTotpSecret(entry.info?.secret || entry.secret);

    items.push({
      name: entry.issuer ? `${entry.issuer} (${name})` : name,
      username,
      totpSecret: secret,
      notes: `Imported from Aegis Authenticator`,
      tags: ['2FA', 'Aegis'],
      itemType: 'login',
    });
  }

  return { formatName: 'Aegis Authenticator', items };
}

/**
 * Parse 2FAS Authenticator JSON structure
 */
function parse2FASJSON(servicesArray: any[]): ParseOutcome {
  const items: ImportResultItem[] = [];
  const list = Array.isArray(servicesArray) ? servicesArray : [];

  for (const s of list) {
    const name = s.name || s.serviceName || '2FAS Authenticator';
    const secret = cleanTotpSecret(s.secret || s.otp?.secret);
    const username = s.otp?.account || s.account || '';

    items.push({
      name,
      username,
      totpSecret: secret,
      notes: 'Imported from 2FAS Authenticator',
      tags: ['2FA', '2FAS'],
      itemType: 'login',
    });
  }

  return { formatName: '2FAS Authenticator', items };
}

/**
 * Parse Bitwarden / Standard JSON structure
 */
function parseBitwardenJSON(itemsArray: any[]): ParseOutcome {
  const items: ImportResultItem[] = [];

  for (const item of itemsArray) {
    const name = item.name || 'Bitwarden Entry';
    const login = item.login || {};
    const username = login.username || '';
    const password = login.password || '';
    const url = login.uris && login.uris.length > 0 ? login.uris[0].uri : '';
    const totpSecret = cleanTotpSecret(login.totp);
    const notes = item.notes || '';

    items.push({
      name,
      username,
      password,
      url,
      notes,
      totpSecret,
      tags: ['Imported', 'Bitwarden'],
      itemType: item.type === 2 ? 'note' : 'login',
    });
  }

  return { formatName: 'Bitwarden / Vault JSON', items };
}

/**
 * Parse Generic JSON Array
 */
function parseGenericJSONArray(array: any[]): ParseOutcome {
  const items: ImportResultItem[] = [];

  for (const entry of array) {
    const name = entry.name || entry.title || entry.service || 'Imported Entry';
    const username = entry.username || entry.email || entry.login || '';
    const password = entry.password || entry.secret || '';
    const url = entry.url || entry.website || '';
    const totpSecret = cleanTotpSecret(entry.totp || entry.totpSecret || entry.otp);
    const notes = entry.notes || entry.comment || '';

    items.push({
      name,
      username,
      password,
      url,
      notes,
      totpSecret,
      tags: ['Imported'],
      itemType: entry.notes && !password ? 'note' : 'login',
    });
  }

  return { formatName: 'Generic Credentials JSON', items };
}
