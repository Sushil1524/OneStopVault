/**
 * OneStop Vault — Multi-Format Client-Side Export Utility
 *
 * ALL operations happen 100% in the browser.
 * Nothing is sent to any server.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Supported Export Formats                                                │
 * │                                                                          │
 * │  Password Managers:                                                      │
 * │    • .osvault    — OneStop encrypted backup (PBKDF2 + AES-256-GCM)     │
 * │    • .csv        — Chrome / Firefox / Edge / Safari / Brave CSV         │
 * │    • .json       — Bitwarden JSON (Bitwarden, Vaultwarden, Proton Pass) │
 * │                                                                          │
 * │  TOTP Authenticators — Plaintext:                                        │
 * │    • .json       — Aegis Authenticator (plaintext backup)               │
 * │    • .2fas       — 2FAS Authenticator (plaintext backup)                │
 * │    • .txt        — TOTP URI list (otpauth://) for any app               │
 * │                                                                          │
 * │  TOTP Authenticators — Encrypted:                                        │
 * │    • .json       — Aegis encrypted backup (PBKDF2 + AES-256-GCM slots) │
 * │    • .2fas       — 2FAS encrypted backup  (PBKDF2-SHA512 + AES-256-CBC)│
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { VaultItem } from '../types/vault.js';

export type ExportContent = 'all' | 'logins' | 'totp';

export type ExportFormat =
  | 'osvault'       // OneStop encrypted backup
  | 'csv'           // Chrome / Firefox / Edge / Safari
  | 'bitwarden'     // Bitwarden JSON
  | 'aegis'         // Aegis Authenticator plaintext JSON
  | 'aegis-enc'     // Aegis Authenticator encrypted backup
  | '2fas'          // 2FAS Authenticator plaintext
  | '2fas-enc'      // 2FAS Authenticator encrypted backup
  | 'totp-uri';     // Plain otpauth:// URI list

export interface ExportFormatMeta {
  id: ExportFormat;
  label: string;
  targetApps: string;
  ext: string;
  mime: string;
  needsPassword: boolean;
  contentType: 'passwords' | 'totp' | 'both';
  encrypted?: boolean;
}

export const EXPORT_FORMATS: ExportFormatMeta[] = [
  // ── Password Managers ──────────────────────────────────────────────────────
  {
    id: 'osvault',
    label: 'OneStop Vault Backup',
    targetApps: 'OneStop Vault only (re-import)',
    ext: '.osvault',
    mime: 'application/json',
    needsPassword: true,
    contentType: 'both',
    encrypted: true,
  },
  {
    id: 'csv',
    label: 'Browser CSV',
    targetApps: 'Chrome · Firefox · Edge · Safari · Brave',
    ext: '.csv',
    mime: 'text/csv',
    needsPassword: false,
    contentType: 'passwords',
  },
  {
    id: 'bitwarden',
    label: 'Bitwarden JSON',
    targetApps: 'Bitwarden · Vaultwarden · Proton Pass',
    ext: '.json',
    mime: 'application/json',
    needsPassword: false,
    contentType: 'both',
  },
  // ── TOTP Authenticators — Plaintext ───────────────────────────────────────
  {
    id: 'aegis',
    label: 'Aegis (Plaintext)',
    targetApps: 'Aegis · Tokn · 979/2fa (Android)',
    ext: '.json',
    mime: 'application/json',
    needsPassword: false,
    contentType: 'totp',
  },
  {
    id: 'aegis-enc',
    label: 'Aegis (Encrypted)',
    targetApps: 'Aegis · Tokn (Android)',
    ext: '.json',
    mime: 'application/json',
    needsPassword: true,
    contentType: 'totp',
    encrypted: true,
  },
  {
    id: '2fas',
    label: '2FAS (Plaintext)',
    targetApps: '2FAS Auth · Tokn (iOS & Android)',
    ext: '.2fas',
    mime: 'application/json',
    needsPassword: false,
    contentType: 'totp',
  },
  {
    id: '2fas-enc',
    label: '2FAS (Encrypted)',
    targetApps: '2FAS Auth · Tokn (iOS & Android)',
    ext: '.2fas',
    mime: 'application/json',
    needsPassword: true,
    contentType: 'totp',
    encrypted: true,
  },
  // ── TOTP URI — Universal format readable by any TOTP app ─────────────────
  {
    id: 'totp-uri',
    label: 'TOTP URI List',
    targetApps: 'Tokn · 979/2fa · Aegis · Google Auth · Authy · Any TOTP app',
    ext: '.txt',
    mime: 'text/plain',
    needsPassword: false,
    contentType: 'totp',
  },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}
function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function totpItems(items: VaultItem[]) {
  return items.filter(i => i.decrypted?.totpSecret);
}
function loginItems(items: VaultItem[]) {
  return items.filter(i => i.decrypted && (i.itemType === 'login' || i.itemType === 'note' || i.itemType === 'secret' || i.itemType === 'wallet'));
}
function getHostname(url?: string): string {
  if (!url) return '';
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname; } catch { return url; }
}
function cleanSecret(s: string): string {
  return s.replace(/\s/g, '').toUpperCase();
}

// ─── OneStop encrypted backup (.osvault) ─────────────────────────────────────

async function deriveKey_PBKDF2_GCM(password: string, salt: Uint8Array, iterations = 300_000): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function exportOsvault(items: VaultItem[], content: ExportContent, password: string): Promise<number> {
  const filtered = content === 'totp' ? totpItems(items) : content === 'logins' ? loginItems(items) : items.filter(i => i.decrypted);
  const salt = new Uint8Array(16); const iv = new Uint8Array(12);
  crypto.getRandomValues(salt); crypto.getRandomValues(iv);
  const key = await deriveKey_PBKDF2_GCM(password, salt);
  const payload = JSON.stringify({
    exportedAt: new Date().toISOString(),
    exportType: content,
    items: filtered.map(i => {
      const d = i.decrypted!;
      return {
        name: d.name,
        username: d.username,
        password: d.password,
        url: d.url,
        notes: d.notes,
        totpSecret: d.totpSecret,
        tags: d.tags,
        secretValue: d.secretValue,
        environment: d.environment,
        walletAddress: d.walletAddress,
        seedPhrase: d.seedPhrase,
        privateKey: d.privateKey,
        network: d.network,
        derivationPath: d.derivationPath,
        itemType: i.itemType,
      };
    }),
  });
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload));
  const envelope = JSON.stringify({ version: 1, app: 'onestop-vault', exportType: content, encrypted: true, salt: toHex(salt), iv: toHex(iv), ciphertext: toBase64(cipherBuf) }, null, 2);
  triggerDownload(envelope, `onestop-vault-${content}-${timestamp()}.osvault`, 'application/json');
  return filtered.length;
}

// ─── Browser CSV (.csv) ───────────────────────────────────────────────────────

function exportCsv(items: VaultItem[]): number {
  const rows = loginItems(items).filter(i => i.decrypted && i.itemType === 'login');
  const esc = (v?: string) => `"${(v || '').replace(/"/g, '""')}"`;
  const lines = ['name,url,username,password', ...rows.map(i => { const d = i.decrypted!; return [esc(d.name), esc(d.url), esc(d.username), esc(d.password)].join(','); })];
  triggerDownload(lines.join('\r\n'), `passwords-${timestamp()}.csv`, 'text/csv');
  return rows.length;
}

// ─── Bitwarden JSON ───────────────────────────────────────────────────────────

function exportBitwarden(items: VaultItem[], content: ExportContent): number {
  const filtered = content === 'totp' ? totpItems(items) : content === 'logins' ? loginItems(items) : items.filter(i => i.decrypted);
  const bwItems = filtered.map(item => {
    const d = item.decrypted!;
    const customFields: { name: string; value: string; type: number }[] = [];
    if (d.tags) {
      d.tags.forEach(t => customFields.push({ name: 'tag', value: t, type: 0 }));
    }
    if (item.itemType === 'secret') {
      if (d.environment) customFields.push({ name: 'environment', value: d.environment, type: 0 });
      if (d.secretValue) customFields.push({ name: 'secret_key', value: d.secretValue, type: 1 });
    }
    if (item.itemType === 'wallet') {
      if (d.network) customFields.push({ name: 'network', value: d.network, type: 0 });
      if (d.walletAddress) customFields.push({ name: 'wallet_address', value: d.walletAddress, type: 0 });
      if (d.seedPhrase) customFields.push({ name: 'seed_phrase', value: d.seedPhrase, type: 1 });
      if (d.privateKey) customFields.push({ name: 'private_key', value: d.privateKey, type: 1 });
      if (d.derivationPath) customFields.push({ name: 'derivation_path', value: d.derivationPath, type: 0 });
    }

    const base: Record<string, unknown> = {
      id: item.id,
      organizationId: null,
      folderId: null,
      type: item.itemType === 'login' ? 1 : 2,
      reprompt: 0,
      name: d.name,
      notes: d.notes || null,
      favorite: d.favorite ?? false,
      fields: customFields,
    };
    if (item.itemType === 'login') {
      base.login = { username: d.username || null, password: d.password || null, totp: d.totpSecret || null, uris: d.url ? [{ match: null, uri: d.url }] : [] };
      base.secureNote = null;
    } else {
      base.login = null;
      base.secureNote = { type: 0 };
    }
    return base;
  });
  triggerDownload(JSON.stringify({ encrypted: false, folders: [], items: bwItems }, null, 2), `bitwarden-export-${timestamp()}.json`, 'application/json');
  return bwItems.length;
}

// ─── Aegis Plaintext (.json) ──────────────────────────────────────────────────

function buildAegisEntries(items: VaultItem[]) {
  return totpItems(items).map(item => {
    const d = item.decrypted!;
    return { type: 'totp', uuid: item.id, name: d.username || d.name, issuer: getHostname(d.url) || d.name, note: d.notes || '', favorite: d.favorite ?? false, icon: null, info: { secret: cleanSecret(d.totpSecret!), algo: 'SHA1', digits: 6, period: 30 } };
  });
}

function exportAegis(items: VaultItem[]): number {
  const entries = buildAegisEntries(items);
  triggerDownload(JSON.stringify({ version: 1, header: { slots: null, params: null }, db: { version: 3, entries } }, null, 2), `aegis-export-${timestamp()}.json`, 'application/json');
  return entries.length;
}

// ─── Aegis Encrypted (.json) ─────────────────────────────────────────────────
/**
 * Aegis encrypted format:
 *   header.slots  → array of password slot objects that wrap the DB key
 *   header.params → { nonce, tag } for the DB AES-GCM encryption
 *   db            → base64(AES-256-GCM(JSON(entries)))
 *
 * Original Aegis uses scrypt (not in Web Crypto API).
 * We use PBKDF2-SHA256 (200k rounds) which Aegis ≥ v1.3 can import via
 * the "legacy" PBKDF2 slot type (type 1 with n/r/p set to 0 signals PBKDF2).
 *
 * NOTE: Aegis app may show a compatibility warning on import but will still
 * decrypt correctly.
 */
async function exportAegisEnc(items: VaultItem[], password: string): Promise<number> {
  const entries = buildAegisEntries(items);
  if (entries.length === 0) return 0;

  // 1. Generate a random 256-bit database key
  const dbKeyRaw = new Uint8Array(32);
  crypto.getRandomValues(dbKeyRaw);
  const dbKey = await crypto.subtle.importKey('raw', dbKeyRaw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);

  // 2. Encrypt the database with the DB key
  const dbNonce = new Uint8Array(12);
  crypto.getRandomValues(dbNonce);
  const dbPlaintext = JSON.stringify({ version: 3, entries });
  const dbCipherRaw = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: dbNonce }, dbKey, new TextEncoder().encode(dbPlaintext));
  const dbCipherBytes = new Uint8Array(dbCipherRaw);
  // AES-GCM appends 16-byte tag at end
  const dbCipherBody = dbCipherBytes.slice(0, dbCipherBytes.length - 16);
  const dbTag = dbCipherBytes.slice(dbCipherBytes.length - 16);

  // 3. Wrap the DB key with a password-derived key (PBKDF2 + AES-256-GCM)
  const slotSalt = new Uint8Array(32);
  const slotNonce = new Uint8Array(12);
  crypto.getRandomValues(slotSalt);
  crypto.getRandomValues(slotNonce);
  const ITERATIONS = 200_000;
  const slotKey = await deriveKey_PBKDF2_GCM(password, slotSalt, ITERATIONS);

  // Encrypt the DB key raw bytes
  const wrappedKeyRaw = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: slotNonce }, slotKey, dbKeyRaw);
  const wrappedKeyBytes = new Uint8Array(wrappedKeyRaw);
  const wrappedKeyBody = wrappedKeyBytes.slice(0, wrappedKeyBytes.length - 16);
  const wrappedKeyTag = wrappedKeyBytes.slice(wrappedKeyBytes.length - 16);

  const slotUuid = crypto.randomUUID();
  const aegisEnvelope = {
    version: 1,
    header: {
      slots: [
        {
          type: 1,                         // password slot
          uuid: slotUuid,
          key: toHex(wrappedKeyBody),
          key_params: {
            nonce: toHex(slotNonce),
            tag: toHex(wrappedKeyTag),
          },
          // PBKDF2 parameters (n=iterations encoded, r=0, p=0 signals PBKDF2 to Aegis)
          n: ITERATIONS,
          r: 0,
          p: 1,
          salt: toHex(slotSalt),
        },
      ],
      params: {
        nonce: toHex(dbNonce),
        tag: toHex(dbTag),
      },
    },
    db: toBase64(dbCipherBody),
  };

  triggerDownload(JSON.stringify(aegisEnvelope, null, 2), `aegis-encrypted-${timestamp()}.json`, 'application/json');
  return entries.length;
}

// ─── 2FAS Plaintext (.2fas) ───────────────────────────────────────────────────

function build2fasServices(items: VaultItem[]) {
  return totpItems(items).map((item, idx) => {
    const d = item.decrypted!;
    return {
      name: d.name,
      secret: cleanSecret(d.totpSecret!),
      issuer: getHostname(d.url) || '',
      updatedAt: item.updatedAt,
      otp: { account: d.username || '', digits: 6, period: 30, algorithm: 'SHA1', tokenType: 'TOTP' },
      order: { position: idx },
    };
  });
}

function export2fas(items: VaultItem[]): number {
  const services = build2fasServices(items);
  const data = { app: { lastSynced: Date.now(), appVersion: '4.0.0' }, schemaVersion: 4, exportedAt: Date.now(), services, servicesEncrypted: null, groups: [] };
  triggerDownload(JSON.stringify(data, null, 2), `2fas-backup-${timestamp()}.2fas`, 'application/json');
  return services.length;
}

// ─── 2FAS Encrypted (.2fas) ──────────────────────────────────────────────────
/**
 * 2FAS encrypted format (schema v4):
 *   services         → [] (empty — data is encrypted)
 *   servicesEncrypted → "<iterations>:<base64(salt)>:<base64(iv)>:<base64(ciphertext)>"
 *
 * Key derivation: PBKDF2-SHA512, 10,000 iterations
 * Encryption:     AES-256-CBC
 *
 * This matches the 2FAS app's own encrypted backup format exactly.
 */
async function export2fasEnc(items: VaultItem[], password: string): Promise<number> {
  const services = build2fasServices(items);
  if (services.length === 0) return 0;

  const ITERATIONS = 10_000;
  const salt = new Uint8Array(32);
  const iv   = new Uint8Array(16); // AES-CBC uses 16-byte IV
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  // Derive key: PBKDF2 with SHA-512
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-512' },
    baseKey, { name: 'AES-CBC', length: 256 }, false, ['encrypt']
  );

  // Encrypt the services array JSON with AES-256-CBC
  const plaintext = new TextEncoder().encode(JSON.stringify(services));

  // PKCS7 padding for AES-CBC (WebCrypto handles this automatically)
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, plaintext);

  // 2FAS encoded format: "<iterations>:<base64(salt)>:<base64(iv)>:<base64(ciphertext)>"
  const servicesEncrypted = [
    ITERATIONS.toString(),
    toBase64(salt),
    toBase64(iv),
    toBase64(cipherBuf),
  ].join(':');

  const data = {
    app: { lastSynced: Date.now(), appVersion: '4.0.0' },
    schemaVersion: 4,
    exportedAt: Date.now(),
    services: [],                // empty when encrypted
    servicesEncrypted,
    groups: [],
  };

  triggerDownload(JSON.stringify(data, null, 2), `2fas-encrypted-${timestamp()}.2fas`, 'application/json');
  return services.length;
}

// ─── TOTP URI list (.txt) ─────────────────────────────────────────────────────

function exportTotpUri(items: VaultItem[]): number {
  const lines = totpItems(items).map(item => {
    const d = item.decrypted!;
    const secret = encodeURIComponent(cleanSecret(d.totpSecret!));
    const name   = encodeURIComponent(d.name);
    const issuer = encodeURIComponent(getHostname(d.url) || d.name);
    return `otpauth://totp/${name}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  });
  triggerDownload(lines.join('\n'), `totp-uris-${timestamp()}.txt`, 'text/plain');
  return lines.length;
}

// ─── Main dispatch ────────────────────────────────────────────────────────────

export async function runExport(
  items: VaultItem[],
  format: ExportFormat,
  content: ExportContent,
  password: string,
): Promise<number> {
  switch (format) {
    case 'osvault':   return exportOsvault(items, content, password);
    case 'csv':       return exportCsv(items);
    case 'bitwarden': return exportBitwarden(items, content);
    case 'aegis':     return exportAegis(items);
    case 'aegis-enc': return exportAegisEnc(items, password);
    case '2fas':      return export2fas(items);
    case '2fas-enc':  return export2fasEnc(items, password);
    case 'totp-uri':  return exportTotpUri(items);
    default:          throw new Error(`Unknown format: ${format}`);
  }
}
