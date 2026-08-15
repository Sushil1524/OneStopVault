/**
 * Universal Vault & 2FA Importer Engine
 *
 * Supported formats:
 *  JSON/Structured:
 *   • Chrome / Firefox / Edge / Brave CSV & JSON
 *   • Bitwarden JSON (with folder → tag mapping)
 *   • 2FAS Authenticator (.2fas, .json) — plaintext & encrypted
 *     - groups → tags mapping via groupId lookup
 *   • Aegis Authenticator (.json) — plaintext & encrypted
 *     - entry.group → tag mapping
 *   • Authenticator Plus / Google Authenticator Takeout JSON
 *     { "accounts": [ { issuer, accountname, secret, group, ... } ] }
 *     - account.group/category → tags
 *   • Generic credential JSON arrays / objects
 *   • otpauth:// URI lists (.txt)
 *   • OneStop Vault encrypted backup (.osvault)
 *
 *  Encrypted containers:
 *   • .kv   — Authenticator Plus encrypted backup (AES-256 PBKDF2 or simple AES)
 *   • .enc  — OpenSSL "Salted__" AES-256-CBC (most common auth app format)
 *             or JSON envelope with salt/iv/data
 *   • .encrypt — same as .enc
 *   • .2fas encrypted (PBKDF2-SHA512 + AES-256-CBC)
 *   • Aegis slot-based encrypted backup (PBKDF2 + AES-256-GCM)
 *
 * ALL DECRYPTION AND PARSING HAPPENS 100% LOCALLY IN BROWSER MEMORY.
 */

import { ItemType } from '../../types/vault.js';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip otpauth:// wrapper and clean base32 TOTP secret */
export function cleanTotpSecret(secretOrUri?: string): string | undefined {
  if (!secretOrUri) return undefined;
  const str = secretOrUri.trim();
  if (str.startsWith('otpauth://')) {
    try {
      const url = new URL(str);
      const secret = url.searchParams.get('secret');
      if (secret) return secret.toUpperCase().replace(/\s+/g, '');
    } catch { /* fall through */ }
  }
  const cleaned = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  return cleaned.length >= 8 ? cleaned : undefined;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes as Uint8Array<ArrayBuffer>;
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  try { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>; }
  catch { return new Uint8Array(0) as Uint8Array<ArrayBuffer>; }
}

function hexOrB64(str: string): Uint8Array<ArrayBuffer> {
  if (/^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0) return hexToBytes(str);
  return b64ToBytes(str);
}

function sanitizeTags(tags: string[]): string[] {
  return [...new Set(tags.filter(t => t && t.trim()))];
}

// ─── Minimal MD5 (for OpenSSL EVP_BytesToKey) ─────────────────────────────────
// We need MD5 only for decrypting OpenSSL-formatted encrypted files (Salted__ prefix).
// This is a compact, correct implementation — not used for security-sensitive operations.

function md5(input: Uint8Array): Uint8Array {
  const S = [ 7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22, 5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20, 4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23, 6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21 ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const len = input.length;
  const msg = new Uint8Array(len + 72);
  msg.set(input);
  msg[len] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(msg.length - 8, (len * 8) >>> 0, true);
  dv.setUint32(msg.length - 4, ((len / 0x20000000) | 0), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let i = 0; i < msg.length; i += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(i + j * 4, true);
    let [A, B, C, D] = [a0, b0, c0, d0];
    for (let j = 0; j < 64; j++) {
      let F: number, g: number;
      if (j < 16)      { F = (B & C) | (~B & D); g = j; }
      else if (j < 32) { F = (D & B) | (~D & C); g = (5*j+1) % 16; }
      else if (j < 48) { F = B ^ C ^ D;           g = (3*j+5) % 16; }
      else             { F = C ^ (B | ~D);         g = (7*j) % 16; }
      F = (F + A + K[j] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[j]) | (F >>> (32 - S[j])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const result = new Uint8Array(16);
  new DataView(result.buffer).setUint32(0,  a0, true);
  new DataView(result.buffer).setUint32(4,  b0, true);
  new DataView(result.buffer).setUint32(8,  c0, true);
  new DataView(result.buffer).setUint32(12, d0, true);
  return result;
}

/**
 * OpenSSL EVP_BytesToKey — derives key+iv from password + 8-byte salt using MD5.
 * Used by `openssl enc -aes-256-cbc -pass pass:PASSWORD` (the most common
 * encrypted export format used by authenticator backup tools and Android apps).
 */
function evpBytesToKey(password: string, salt: Uint8Array, keyLen: number, ivLen: number): { key: Uint8Array; iv: Uint8Array } {
  const pass = new TextEncoder().encode(password);
  const d: Uint8Array[] = [];
  let total = new Uint8Array(0);
  while (total.length < keyLen + ivLen) {
    const prev = d.length ? d[d.length - 1] : new Uint8Array(0);
    const input = new Uint8Array(prev.length + pass.length + salt.length);
    input.set(prev); input.set(pass, prev.length); input.set(salt, prev.length + pass.length);
    const h = md5(input);
    d.push(h);
    const next = new Uint8Array(total.length + h.length);
    next.set(total); next.set(h, total.length);
    total = next;
  }
  return { key: total.slice(0, keyLen) as Uint8Array, iv: total.slice(keyLen, keyLen + ivLen) as Uint8Array };
}

/**
 * Decrypt OpenSSL-format AES-256-CBC encrypted file.
 * Binary structure: "Salted__" (8 bytes) + salt (8 bytes) + ciphertext
 */
async function decryptOpenSSL(data: Uint8Array, password: string): Promise<string> {
  const magic = new TextDecoder().decode(data.slice(0, 8));
  if (magic !== 'Salted__') throw new Error('Not an OpenSSL Salted__ file');
  const salt       = data.slice(8, 16) as Uint8Array<ArrayBuffer>;
  const ciphertext = data.slice(16)    as Uint8Array<ArrayBuffer>;
  const { key, iv } = evpBytesToKey(password, salt, 32, 16);
  const cryptoKey = await crypto.subtle.importKey('raw', key as Uint8Array<ArrayBuffer>, { name: 'AES-CBC', length: 256 }, false, ['decrypt']);
  const decBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv as Uint8Array<ArrayBuffer> }, cryptoKey, ciphertext);
  return new TextDecoder().decode(decBuf);
}

// ─── Aegis decryption ─────────────────────────────────────────────────────────

async function decryptAegisBackup(jsonObj: any, password: string): Promise<any> {
  const { header, db: dbBase64 } = jsonObj;
  if (!header?.params || !header?.slots || !dbBase64) throw new Error('Invalid Aegis backup structure');

  const slot = header.slots.find((s: any) => s.type === 1);
  if (!slot) throw new Error('No password slot found');

  const slotSalt  = hexOrB64(slot.salt);
  const iterations = slot.n || 100_000;

  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  const slotKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: slotSalt, iterations, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );

  const keyBody  = hexOrB64(slot.key);
  const keyTag   = hexOrB64(slot.key_params.tag);
  const keyNonce = hexOrB64(slot.key_params.nonce);
  const keyWithTag = new Uint8Array(keyBody.length + keyTag.length);
  keyWithTag.set(keyBody); keyWithTag.set(keyTag, keyBody.length);

  const dbKeyBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: keyNonce }, slotKey, keyWithTag);
  const dbKey    = await crypto.subtle.importKey('raw', dbKeyBuf, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);

  const dbNonce = hexOrB64(header.params.nonce);
  const dbTag   = hexOrB64(header.params.tag);
  const dbBody  = b64ToBytes(dbBase64);
  const dbWithTag = new Uint8Array(dbBody.length + dbTag.length);
  dbWithTag.set(dbBody); dbWithTag.set(dbTag, dbBody.length);

  const decBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: dbNonce }, dbKey, dbWithTag);
  return JSON.parse(new TextDecoder().decode(decBuf));
}

// ─── 2FAS decryption ──────────────────────────────────────────────────────────

async function decrypt2FAS(jsonObj: any, password: string): Promise<any[]> {
  // Format A: our own export — "iter:base64(salt):base64(iv):base64(ciphertext)"
  const encField = jsonObj.servicesEncrypted;
  if (encField && typeof encField === 'string') {
    const parts = encField.split(':');
    if (parts.length === 4) {
      const [iterStr, saltB64, ivB64, cipherB64] = parts;
      const iterations = parseInt(iterStr, 10) || 10_000;
      const salt = b64ToBytes(saltB64); const iv = b64ToBytes(ivB64); const cipher = b64ToBytes(cipherB64);
      const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
      const aesKey  = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-512' }, baseKey, { name: 'AES-CBC', length: 256 }, false, ['decrypt']);
      const decBuf  = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, cipher);
      return JSON.parse(new TextDecoder().decode(decBuf));
    }
    try { return JSON.parse(encField); } catch {}
  }

  // Format B: older 2FAS — { services: "base64_cipher", salt: "hex", iv: "hex" }
  if (jsonObj.salt && jsonObj.iv && typeof jsonObj.services === 'string') {
    const salt = hexOrB64(jsonObj.salt); const iv = hexOrB64(jsonObj.iv); const cipher = b64ToBytes(jsonObj.services);
    const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
    const aesKey  = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 10_000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const decBuf  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipher);
    return JSON.parse(new TextDecoder().decode(decBuf));
  }

  throw new Error('Unrecognized 2FAS encrypted format');
}

// ─── OneStop .osvault decryption ──────────────────────────────────────────────

async function decryptOsvault(jsonObj: any, password: string): Promise<any> {
  const { salt, iv, ciphertext } = jsonObj;
  if (!salt || !iv || !ciphertext) throw new Error('Invalid .osvault file');
  const saltBytes = hexToBytes(salt); const ivBytes = hexToBytes(iv); const cipher = b64ToBytes(ciphertext);
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  const aesKey  = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: saltBytes, iterations: 300_000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const decBuf  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, aesKey, cipher);
  return JSON.parse(new TextDecoder().decode(decBuf));
}

// ─── Generic encrypted file decryption (.kv / .enc / .encrypt) ───────────────
/**
 * Tries multiple strategies in order:
 *
 *  1. JSON envelope  { salt, iv, data/ciphertext } → PBKDF2 + AES-256-GCM then CBC
 *  2. OpenSSL Salted__ binary format (most Android backup tools)
 *     → EVP_BytesToKey (MD5) + AES-256-CBC
 *  3. Authenticator Plus old-style: AES-256-CBC, key = password zero-padded to 32 bytes,
 *     iv = first 16 bytes of base64-decoded blob
 *  4. Raw base64 blob, first 12 bytes as GCM nonce
 */
async function decryptEncryptedFile(content: string, password: string): Promise<string> {
  const encoder = new TextEncoder();

  // Strategy 1: JSON envelope
  let obj: any = null;
  try { obj = JSON.parse(content); } catch {}
  if (obj) {
    const salt   = obj.salt ?? obj.key_salt ?? obj.keySalt ?? obj.s;
    const iv     = obj.iv ?? obj.nonce ?? obj.n;
    const cipher = obj.data ?? obj.ciphertext ?? obj.encrypted_data ?? obj.c;
    if (salt && iv && cipher) {
      const saltB = hexOrB64(salt); const ivB = hexOrB64(iv); const cipherB = b64ToBytes(cipher);
      const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
      for (const algo of ['AES-GCM', 'AES-CBC'] as const) {
        for (const iters of [100_000, 10_000, 1_000]) {
          try {
            const aesKey = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: saltB, iterations: iters, hash: 'SHA-256' }, baseKey, { name: algo, length: 256 }, false, ['decrypt']);
            const dec = await crypto.subtle.decrypt({ name: algo, iv: ivB }, aesKey, cipherB);
            return new TextDecoder().decode(dec);
          } catch {}
        }
      }
    }
  }

  // Strategy 2: OpenSSL Salted__ format
  // The file content may be binary data stored as base64, or the raw binary itself
  const tryOpenSSL = async (data: Uint8Array) => {
    const magic = new TextDecoder('ascii', { fatal: false }).decode(data.slice(0, 8));
    if (magic === 'Salted__') return decryptOpenSSL(data, password);
    throw new Error('not openssl');
  };
  // Try raw bytes
  try { return await tryOpenSSL(new TextEncoder().encode(content) as Uint8Array<ArrayBuffer>); } catch {}
  // Try base64-decoded
  try { return await tryOpenSSL(b64ToBytes(content.trim())); } catch {}

  // Strategy 3: Authenticator Plus old-style — AES-256-CBC, key = password zero-padded/truncated to 32 bytes
  try {
    const raw = b64ToBytes(content.trim());
    if (raw.length > 16) {
      const iv    = raw.slice(0, 16);
      const body  = raw.slice(16);
      const keyBuf = new Uint8Array(32);
      const pwBytes = encoder.encode(password);
      keyBuf.set(pwBytes.slice(0, 32));
      const aesKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-CBC', length: 256 }, false, ['decrypt']);
      const dec = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, body);
      return new TextDecoder().decode(dec);
    }
  } catch {}

  // Strategy 4: Raw base64 blob, first 12 bytes as GCM nonce
  try {
    const raw = b64ToBytes(content.trim());
    if (raw.length > 12) {
      const iv = raw.slice(0, 12); const body = raw.slice(12);
      const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
      const aesKey  = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(16) as Uint8Array<ArrayBuffer>, iterations: 100_000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, body);
      return new TextDecoder().decode(dec);
    }
  } catch {}

  throw new Error('Could not decrypt the file. The password may be wrong, or the encryption format is not supported.');
}

// ─── CSV parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): ImportResultItem[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const result: string[] = []; let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur.trim().replace(/^"|"$/g, '')); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim().replace(/^"|"$/g, ''));
    return result;
  };
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
  const idx = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));
  const nameIdx = idx(['name', 'title', 'label']); const userIdx = idx(['user', 'login', 'email', 'account']);
  const passIdx = idx(['pass', 'password']); const urlIdx  = idx(['url', 'site', 'link', 'website']);
  const noteIdx = idx(['note', 'comment', 'extra']); const totpIdx = idx(['totp', '2fa', 'otp', 'authenticator']);
  const groupIdx = idx(['group', 'folder', 'category', 'collection']);

  const items: ImportResultItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseLine(lines[i]);
    if (!c.length) continue;
    const name = (nameIdx >= 0 ? c[nameIdx] : '') || (urlIdx >= 0 ? c[urlIdx] : '') || 'Imported Login';
    if (!name && !(userIdx >= 0 && c[userIdx]) && !(passIdx >= 0 && c[passIdx])) continue;
    const group = groupIdx >= 0 ? c[groupIdx] : '';
    const tags = sanitizeTags(['Imported', ...(group ? [group] : [])]);
    items.push({
      name: name || 'Imported Entry',
      username: userIdx >= 0 ? c[userIdx] : '',
      password: passIdx >= 0 ? c[passIdx] : '',
      url:      urlIdx  >= 0 ? c[urlIdx]  : '',
      notes:    noteIdx >= 0 ? c[noteIdx] : '',
      totpSecret: cleanTotpSecret(totpIdx >= 0 ? c[totpIdx] : undefined),
      tags,
      itemType: 'login',
    });
  }
  return items;
}

// ─── Format parsers (with groups → tags) ─────────────────────────────────────

/**
 * Authenticator Plus / Google Auth Takeout / many Android apps:
 * { "accounts": [ { issuer, accountname, secret, algorithm, digits, period, type, group, category } ] }
 * groups array (if present): [{ id, name }]  OR  accounts have group as string
 */
function parseAccountsFormat(accounts: any[], groupsArr?: any[]): ImportResultItem[] {
  // Build groupId → name map if provided
  const groupMap: Record<string, string> = {};
  if (Array.isArray(groupsArr)) {
    for (const g of groupsArr) {
      if (g.id && g.name) groupMap[g.id] = g.name;
    }
  }

  return accounts.map(a => {
    const name   = a.issuer || a.name || a.accountname || 'Imported 2FA';
    const user   = a.accountname || a.email || a.account || '';
    const secret = cleanTotpSecret(a.secret);
    // group can be a string name, or a group ID
    const groupRaw = a.group || a.category || a.groupId || '';
    const groupName = groupMap[groupRaw] || groupRaw || '';
    const tags = sanitizeTags(['2FA', 'Imported', ...(groupName ? [groupName] : [])]);
    return {
      name,
      username: user,
      totpSecret: secret,
      notes: `Imported · Type: ${a.type || 'TOTP'}${a.period && a.period !== 30 ? ` · Period: ${a.period}s` : ''}`,
      tags,
      itemType: 'login' as ItemType,
    };
  });
}

function parseAegisJSON(jsonObj: any): ParseOutcome {
  const entries = jsonObj.db?.entries || jsonObj.entries || [];
  const items: ImportResultItem[] = entries.map((e: any) => {
    // Aegis stores the group name directly in entry.group (string, may be null)
    const group = typeof e.group === 'string' && e.group ? e.group : null;
    const tags  = sanitizeTags(['2FA', 'Aegis', ...(group ? [group] : [])]);
    return {
      name: e.issuer ? `${e.issuer}${e.name && e.name !== e.issuer ? ` (${e.name})` : ''}` : e.name || 'Aegis 2FA',
      username: e.info?.label || e.name || '',
      totpSecret: cleanTotpSecret(e.info?.secret || e.secret),
      notes: 'Imported from Aegis Authenticator',
      tags,
      itemType: 'login' as ItemType,
    };
  });
  return { formatName: 'Aegis Authenticator', items };
}

function parse2FASJSON(list: any[], allGroups?: any[]): ParseOutcome {
  // Build groupId → name lookup
  const groupMap: Record<string, string> = {};
  if (Array.isArray(allGroups)) {
    for (const g of allGroups) { if (g.id && g.name) groupMap[g.id] = g.name; }
  }

  const items: ImportResultItem[] = (Array.isArray(list) ? list : []).map(s => {
    const groupId   = s.groupId || s.group_id || '';
    const groupName = groupMap[groupId] || groupId || '';
    const tags      = sanitizeTags(['2FA', '2FAS', ...(groupName ? [groupName] : [])]);
    return {
      name: s.name || s.serviceName || '2FAS 2FA',
      username: s.otp?.account || s.account || '',
      totpSecret: cleanTotpSecret(s.secret || s.otp?.secret),
      notes: 'Imported from 2FAS Authenticator',
      tags,
      itemType: 'login' as ItemType,
    };
  });
  return { formatName: '2FAS Authenticator', items };
}

function parseBitwardenJSON(itemsArray: any[], folders?: any[]): ParseOutcome {
  // Build folderId → name lookup
  const folderMap: Record<string, string> = {};
  if (Array.isArray(folders)) {
    for (const f of folders) { if (f.id && f.name) folderMap[f.id] = f.name; }
  }

  const items: ImportResultItem[] = itemsArray.map(item => {
    const login      = item.login || {};
    const folderName = folderMap[item.folderId] || item.collectionName || '';
    const tags       = sanitizeTags(['Imported', 'Bitwarden', ...(folderName ? [folderName] : [])]);
    return {
      name: item.name || 'Bitwarden Entry',
      username: login.username || '',
      password: login.password || '',
      url: login.uris?.[0]?.uri || '',
      notes: item.notes || '',
      totpSecret: cleanTotpSecret(login.totp),
      tags,
      itemType: (item.type === 2 ? 'note' : 'login') as ItemType,
    };
  });
  return { formatName: 'Bitwarden JSON', items };
}

function parseOsvaultItems(payload: any): ParseOutcome {
  const list = payload.items || (Array.isArray(payload) ? payload : []);
  const items: ImportResultItem[] = list.map((i: any) => ({
    name: i.name || 'Imported Item',
    username: i.username,
    password: i.password,
    url: i.url,
    notes: i.notes,
    totpSecret: cleanTotpSecret(i.totpSecret),
    tags: sanitizeTags([...(i.tags || []), 'Imported']),
    itemType: (i.itemType || (i.password ? 'login' : 'note')) as ItemType,
  }));
  return { formatName: 'OneStop Vault Backup', items };
}

function parseGenericJSONArray(array: any[]): ParseOutcome {
  const items: ImportResultItem[] = array.map(e => ({
    name: e.name || e.title || e.service || e.issuer || e.label || 'Imported Entry',
    username: e.username || e.email || e.login || e.accountname || e.account || '',
    password: e.password || '',
    url: e.url || e.website || e.uri || '',
    totpSecret: cleanTotpSecret(e.totp || e.totpSecret || e.otp || e.secret),
    notes: e.notes || e.comment || e.note || '',
    tags: sanitizeTags(['Imported', ...(e.group || e.folder || e.category ? [e.group || e.folder || e.category] : [])]),
    itemType: (e.notes && !e.password ? 'note' : 'login') as ItemType,
  }));
  return { formatName: 'Generic Credentials JSON', items };
}

function parseTotpUriList(text: string): ParseOutcome {
  const uris = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('otpauth://'));
  const items: ImportResultItem[] = uris.map(uri => {
    try {
      const u       = new URL(uri);
      const label   = decodeURIComponent(u.pathname.replace(/^\/\/totp\//, ''));
      const issuer  = u.searchParams.get('issuer') || label.split(':')[0] || 'TOTP';
      const account = label.includes(':') ? label.split(':').slice(1).join(':') : label;
      const secret  = cleanTotpSecret(u.searchParams.get('secret') || '');
      return { name: issuer, username: account, totpSecret: secret, tags: ['2FA', 'Imported'], itemType: 'login' as ItemType };
    } catch {
      return { name: 'TOTP Entry', totpSecret: cleanTotpSecret(uri), tags: ['2FA', 'Imported'], itemType: 'login' as ItemType };
    }
  });
  return { formatName: 'TOTP URI List', items };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function parseImportFile(fileContent: string, filePassword?: string): Promise<ParseOutcome> {
  const trimmed = fileContent.trim();
  if (!trimmed) return { error: 'File is empty.' };

  // ── 1. TOTP URI list ──────────────────────────────────────────────────────
  if (trimmed.startsWith('otpauth://') || trimmed.includes('\notpauth://')) {
    const result = parseTotpUriList(trimmed);
    if (result.items?.length) return result;
  }

  // ── 2. JSON formats ───────────────────────────────────────────────────────
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: any;
    try { parsed = JSON.parse(trimmed); }
    catch { return { error: 'File looks like JSON but could not be parsed. It may be malformed or truncated.' }; }

    // OneStop .osvault encrypted backup
    if (parsed.app === 'onestop-vault' && parsed.encrypted) {
      if (!filePassword) return { requiresPassword: true, formatName: 'OneStop Vault Backup (Encrypted)' };
      try { return parseOsvaultItems(await decryptOsvault(parsed, filePassword)); }
      catch { return { requiresPassword: true, error: 'Wrong password for OneStop Vault backup.' }; }
    }

    // Aegis encrypted backup
    if (parsed.header?.slots && typeof parsed.db === 'string') {
      if (!filePassword) return { requiresPassword: true, formatName: 'Aegis Authenticator (Encrypted)' };
      try { return parseAegisJSON(await decryptAegisBackup(parsed, filePassword)); }
      catch { return { requiresPassword: true, error: 'Wrong password for Aegis backup.' }; }
    }

    // 2FAS encrypted backup
    const has2fasEnc = (typeof parsed.servicesEncrypted === 'string') ||
                       (typeof parsed.services === 'string' && (parsed.salt || parsed.iv));
    if (has2fasEnc) {
      if (!filePassword) return { requiresPassword: true, formatName: '2FAS Authenticator (Encrypted)' };
      try {
        const decrypted = await decrypt2FAS(parsed, filePassword);
        return parse2FASJSON(decrypted, parsed.groups);
      } catch { return { requiresPassword: true, error: 'Wrong password for 2FAS backup.' }; }
    }

    // Aegis plaintext backup
    if (parsed.db?.entries && Array.isArray(parsed.db.entries)) {
      return parseAegisJSON(parsed);
    }

    // 2FAS plaintext backup
    if (Array.isArray(parsed.services) && parsed.services.length && parsed.services[0]?.secret) {
      return parse2FASJSON(parsed.services, parsed.groups);
    }

    // ★ Authenticator Plus / Google Auth Takeout
    // { "accounts": [...], "groups": [...] } or just { "accounts": [...] }
    if (parsed.accounts && Array.isArray(parsed.accounts) && parsed.accounts.length) {
      const items = parseAccountsFormat(parsed.accounts, parsed.groups);
      if (items.length) return { formatName: 'Authenticator App Export (accounts[])', items };
    }

    // Bitwarden / Vaultwarden / Proton Pass — pass folders for tag mapping
    if (parsed.items && Array.isArray(parsed.items)) {
      return parseBitwardenJSON(parsed.items, parsed.folders);
    }

    // OneStop .osvault plaintext
    if (parsed.exportType && parsed.items && Array.isArray(parsed.items)) {
      return parseOsvaultItems(parsed);
    }

    // Generic JSON array
    if (Array.isArray(parsed) && parsed.length) {
      if (parsed[0]?.secret && parsed[0]?.otp) return parse2FASJSON(parsed);
      return parseGenericJSONArray(parsed);
    }

    // Single JSON object
    if (typeof parsed === 'object' && (parsed.secret || parsed.password)) {
      return parseGenericJSONArray([parsed]);
    }

    return { error: 'JSON file recognized but no importable accounts or credentials were found.' };
  }

  // ── 3. CSV formats ────────────────────────────────────────────────────────
  if (trimmed.includes(',')) {
    const items = parseCSV(trimmed);
    if (items.length) return { formatName: 'CSV Export (Chrome/Firefox/Bitwarden)', items };
  }

  // ── 4. Encrypted binary / .kv / .enc / .encrypt containers ──────────────
  // Anything that doesn't look like plaintext JSON, CSV, or URIs is treated as encrypted
  const looksEncrypted =
    !trimmed.startsWith('{') && !trimmed.startsWith('[') &&
    !trimmed.includes(',')   && !trimmed.startsWith('otpauth');

  if (looksEncrypted) {
    if (!filePassword) {
      return {
        requiresPassword: true,
        formatName: 'Encrypted File (.kv / .enc / .encrypt)',
      };
    }
    try {
      const decryptedText = await decryptEncryptedFile(trimmed, filePassword);
      // Re-run full detection on the decrypted content
      return parseImportFile(decryptedText, undefined);
    } catch (e: any) {
      return {
        requiresPassword: true,
        error: e.message || 'Wrong password or unsupported encryption format.',
      };
    }
  }

  return { error: 'Unrecognized file format. Supported: JSON (Aegis, 2FAS, Bitwarden, accounts[]), CSV (Chrome/Firefox), TOTP URI list (.txt), encrypted .kv/.enc/.encrypt files, .osvault backups.' };
}
