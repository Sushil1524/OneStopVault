/**
 * OneStop Vault — Password & Credential Importer Engine
 *
 * Supported formats:
 *   • OneStop Vault (.osvault) — Encrypted & plaintext backups
 *   • CSV exports — Chrome, Firefox, Edge, Safari, Brave, Bitwarden
 *   • Bitwarden / Vaultwarden JSON (with folder → tag mapping)
 *   • Generic credential JSON arrays & objects
 *   • Authenticator / accounts[] JSON format
 *   • Plaintext TOTP URI lists (otpauth://) & Key:Value text
 *
 * ALL DECRYPTION AND PARSING HAPPENS 100% LOCALLY IN BROWSER MEMORY.
 * ZERO DATA IS TRANSMITTED UNTIL ENCRYPTED WITH USER'S MASTER KEY.
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
  secretValue?: string;
  environment?: string;
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

/**
 * Remove trailing commas before ] or } — some exports produce invalid JSON
 * like {"accounts":[{...},]} which fails JSON.parse.
 */
function sanitizeJSON(raw: string): string {
  return raw.replace(/,\s*([\]}])/g, '$1').trim();
}

function sanitizeTags(tags: string[]): string[] {
  return [...new Set(tags.filter(t => t && t.trim()))];
}

// ─── OneStop .osvault decryption ──────────────────────────────────────────────

async function decryptOsvault(jsonObj: any, password: string): Promise<any> {
  const { salt, iv, ciphertext } = jsonObj;
  if (!salt || !iv || !ciphertext) throw new Error('Invalid .osvault file');
  const saltBytes = hexToBytes(salt);
  const ivBytes = hexToBytes(iv);
  const cipher = b64ToBytes(ciphertext);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 300_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const decBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, aesKey, cipher);
  return JSON.parse(new TextDecoder().decode(decBuf));
}

// ─── CSV Parser (Chrome, Firefox, Edge, Safari, Brave, Bitwarden) ─────────────

function parseCSV(text: string): ImportResultItem[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        result.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
  const idx = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));

  const nameIdx = idx(['name', 'title', 'label']);
  const userIdx = idx(['user', 'login', 'email', 'account']);
  const passIdx = idx(['pass', 'password']);
  const urlIdx = idx(['url', 'site', 'link', 'website']);
  const noteIdx = idx(['note', 'comment', 'extra']);
  const totpIdx = idx(['totp', '2fa', 'otp', 'authenticator']);
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
      url: urlIdx >= 0 ? c[urlIdx] : '',
      notes: noteIdx >= 0 ? c[noteIdx] : '',
      totpSecret: cleanTotpSecret(totpIdx >= 0 ? c[totpIdx] : undefined),
      tags,
      itemType: 'login',
    });
  }
  return items;
}

// ─── Format Parsers ───────────────────────────────────────────────────────────

function parseBitwardenJSON(itemsArray: any[], folders?: any[]): ParseOutcome {
  const folderMap: Record<string, string> = {};
  if (Array.isArray(folders)) {
    for (const f of folders) {
      if (f.id && f.name) folderMap[f.id] = f.name;
    }
  }

  const items: ImportResultItem[] = itemsArray.map(item => {
    const login = item.login || {};
    const folderName = folderMap[item.folderId] || item.collectionName || '';
    const tags = sanitizeTags(['Imported', 'Bitwarden', ...(folderName ? [folderName] : [])]);
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
    secretValue: i.secretValue,
    environment: i.environment,
    tags: sanitizeTags([...(i.tags || []), 'Imported']),
    itemType: (i.itemType || (i.secretValue ? 'secret' : (i.password ? 'login' : 'note'))) as ItemType,
  }));
  return { formatName: 'OneStop Vault Backup', items };
}

function parseAccountsFormat(accounts: any[], groupsArr?: any[]): ImportResultItem[] {
  const groupMap: Record<string, string> = {};
  if (Array.isArray(groupsArr)) {
    for (const g of groupsArr) {
      if (g.id && g.name) groupMap[g.id] = g.name;
    }
  }

  return accounts.map(a => {
    const name = a.issuer || a.name || a.accountName || a.accountname || 'Imported 2FA';
    const user = a.accountName || a.accountname || a.email || a.account || '';
    const secret = cleanTotpSecret(a.secret);
    const rawGroup = Array.isArray(a.groups) ? a.groups[0] : (a.group || a.category || a.groupId || '');
    const groupName = groupMap[rawGroup] || rawGroup || '';
    const tags = sanitizeTags(['2FA', 'Imported', ...(groupName ? [groupName] : [])]);
    return {
      name,
      username: user !== name ? user : '',
      totpSecret: secret,
      notes: `Imported · Type: ${a.type || 'TOTP'}${a.period && a.period !== 30 ? ` · Period: ${a.period}s` : ''}`,
      tags,
      itemType: 'login' as ItemType,
    };
  });
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
      const u = new URL(uri);
      const label = decodeURIComponent(u.pathname.replace(/^\/\/totp\//, ''));
      const issuer = u.searchParams.get('issuer') || label.split(':')[0] || 'TOTP';
      const account = label.includes(':') ? label.split(':').slice(1).join(':') : label;
      const secret = cleanTotpSecret(u.searchParams.get('secret') || '');
      return { name: issuer, username: account, totpSecret: secret, tags: ['2FA', 'Imported'], itemType: 'login' as ItemType };
    } catch {
      return { name: 'TOTP Entry', totpSecret: cleanTotpSecret(uri), tags: ['2FA', 'Imported'], itemType: 'login' as ItemType };
    }
  });
  return { formatName: 'TOTP URI List', items };
}

function parseTxtKeyValue(text: string): ParseOutcome {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(b => b.length > 0);
  const items: ImportResultItem[] = [];

  for (const block of blocks) {
    const kv: Record<string, string> = {};
    for (const line of block.split(/\r?\n/)) {
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (m) kv[m[1].trim().toLowerCase()] = m[2].trim();
    }
    const secret = cleanTotpSecret(kv['secret'] || kv['key']);
    const issuer = kv['issuer'] || kv['service'] || kv['account'] || kv['name'];
    const name = kv['name'] || kv['accountname'] || kv['account'] || issuer;
    if (!secret && !kv['password'] && !kv['url']) continue;

    if (secret) {
      const period = kv['period'] || kv['time'] || '30';
      items.push({
        name: issuer || name || 'TOTP Import',
        username: kv['account'] !== issuer ? (kv['account'] || kv['accountname'] || '') : '',
        totpSecret: secret,
        notes: `Imported · Type: ${kv['type'] || 'TOTP'}${period !== '30' ? ` · Period: ${period}s` : ''}`,
        tags: sanitizeTags(['2FA', 'Imported', ...(kv['group'] || kv['category'] ? [kv['group'] || kv['category']] : [])]),
        itemType: 'login',
      });
    } else {
      items.push({
        name: name || kv['title'] || 'Imported Login',
        username: kv['username'] || kv['email'] || kv['login'] || '',
        password: kv['password'] || '',
        url: kv['url'] || kv['site'] || kv['website'] || '',
        notes: kv['notes'] || kv['comment'] || '',
        tags: ['Imported'],
        itemType: 'login',
      });
    }
  }
  if (!items.length) return { error: 'No parseable entries found in key:value text file.' };
  return { formatName: 'Key:Value Text Export', items };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function parseImportFile(fileContent: string, filePassword?: string): Promise<ParseOutcome> {
  const trimmed = fileContent.trim();
  if (!trimmed) return { error: 'File is empty.' };

  // ── 1. TOTP URI list ──────────────────────────────────────────────────────
  if (trimmed.startsWith('otpauth://') || trimmed.includes('\notpauth://')) {
    const result = parseTotpUriList(trimmed);
    if (result.items?.length) return result;
  }

  // ── 1b. Key:Value text format (Issuer: / Name: / Secret: blocks) ──────────
  if (trimmed.includes('\n') && /^(issuer|secret|name|type|algorithm)\s*:/im.test(trimmed)) {
    const result = parseTxtKeyValue(trimmed);
    if (result.items?.length) return result;
  }

  // ── 2. JSON formats ───────────────────────────────────────────────────────
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: any;
    const sanitized = sanitizeJSON(trimmed);
    try { parsed = JSON.parse(sanitized); }
    catch { return { error: 'File looks like JSON but could not be parsed. It may be malformed or truncated.' }; }

    // OneStop .osvault encrypted backup
    if (parsed.app === 'onestop-vault' && parsed.encrypted) {
      if (!filePassword) return { requiresPassword: true, formatName: 'OneStop Vault Backup (Encrypted)' };
      try { return parseOsvaultItems(await decryptOsvault(parsed, filePassword)); }
      catch { return { requiresPassword: true, error: 'Wrong password for OneStop Vault backup.' }; }
    }

    // OneStop .osvault plaintext
    if (parsed.exportType && parsed.items && Array.isArray(parsed.items)) {
      return parseOsvaultItems(parsed);
    }

    // Bitwarden / Vaultwarden / Proton Pass JSON
    if (parsed.items && Array.isArray(parsed.items)) {
      return parseBitwardenJSON(parsed.items, parsed.folders);
    }

    // Authenticator / Google Auth accounts[] format
    if (parsed.accounts && Array.isArray(parsed.accounts) && parsed.accounts.length) {
      const items = parseAccountsFormat(parsed.accounts, parsed.groups);
      if (items.length) return { formatName: 'Authenticator Accounts JSON', items };
    }

    // Generic JSON array
    if (Array.isArray(parsed) && parsed.length) {
      return parseGenericJSONArray(parsed);
    }

    // Single JSON object
    if (typeof parsed === 'object' && (parsed.secret || parsed.password || parsed.name)) {
      return parseGenericJSONArray([parsed]);
    }

    return { error: 'JSON file recognized but no importable credentials or accounts were found.' };
  }

  // ── 3. CSV formats ────────────────────────────────────────────────────────
  if (trimmed.includes(',')) {
    const items = parseCSV(trimmed);
    if (items.length) return { formatName: 'CSV Export (Browser / Bitwarden)', items };
  }

  return {
    error: 'Unrecognized file format. Supported formats: Chrome/Firefox/Edge/Safari CSV, Bitwarden JSON, and OneStop Vault (.osvault) backups.',
  };
}
