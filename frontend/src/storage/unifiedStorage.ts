/**
 * Unified Storage Wrapper (IndexedDB Primary + LocalStorage Fallback)
 * Manages encrypted vault cache, checksum persistence, and offline pending sync queue.
 */

import { VaultItem, ItemType } from '../types/vault.js';

const STORAGE_KEYS = {
  SESSION_USER: 'onestop_vault_user',
  SESSION_TOKEN: 'onestop_vault_token',
  LOCAL_ITEMS: 'onestop_vault_items',
  LOCAL_CHECKSUM: 'onestop_vault_checksum',
  LOCAL_VERSION: 'onestop_vault_version',
  PENDING_OPS: 'onestop_vault_pending_ops',
};

const IDB_NAME = 'onestop-vault-db';
const IDB_VERSION = 1;
const IDB_STORE = 'vault_kv';

export type PendingSyncOp =
  | {
      type: 'upsert';
      id: string;
      item: {
        id: string;
        ciphertext: string;
        iv: string;
        itemType: ItemType;
      };
      timestamp: number;
    }
  | {
      type: 'delete';
      id: string;
      timestamp: number;
    };

interface LocalVaultCache {
  items: VaultItem[];
  checksum: string;
  version: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
let initPromise: Promise<void> | null = null;
let memoryVault: LocalVaultCache | null = null;
let memoryPendingOps: PendingSyncOp[] | null = null;

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIdb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function idbSet(key: string, value: unknown): Promise<boolean> {
  const db = await openIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function idbDeleteKeys(keys: string[]): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      for (const k of keys) store.delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function readLegacyVaultFromLocalStorage(): LocalVaultCache {
  try {
    const itemsStr = localStorage.getItem(STORAGE_KEYS.LOCAL_ITEMS);
    const checksum = localStorage.getItem(STORAGE_KEYS.LOCAL_CHECKSUM) || '';
    const versionStr = localStorage.getItem(STORAGE_KEYS.LOCAL_VERSION) || '0';
    const items: VaultItem[] = itemsStr ? JSON.parse(itemsStr) : [];
    return { items, checksum, version: parseInt(versionStr, 10) || 0 };
  } catch {
    return { items: [], checksum: '', version: 0 };
  }
}

function readLegacyPendingOpsFromLocalStorage(): PendingSyncOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PENDING_OPS);
    return raw ? (JSON.parse(raw) as PendingSyncOp[]) : [];
  } catch {
    return [];
  }
}

export class UnifiedStorage {
  /**
   * Opens IndexedDB, warms in-memory cache, and migrates any legacy localStorage vault data.
   */
  static async init(): Promise<void> {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const storedVault = await idbGet<LocalVaultCache>('vault_cache');
      if (storedVault && Array.isArray(storedVault.items)) {
        memoryVault = storedVault;
      } else {
        const legacy = readLegacyVaultFromLocalStorage();
        memoryVault = legacy;
        if (legacy.items.length > 0 || legacy.checksum) {
          const ok = await idbSet('vault_cache', legacy);
          if (ok) {
            try {
              localStorage.removeItem(STORAGE_KEYS.LOCAL_ITEMS);
            } catch {
              // ignore
            }
          }
        }
      }

      const storedOps = await idbGet<PendingSyncOp[]>('pending_ops');
      if (Array.isArray(storedOps)) {
        memoryPendingOps = storedOps;
      } else {
        const legacyOps = readLegacyPendingOpsFromLocalStorage();
        memoryPendingOps = legacyOps;
        if (legacyOps.length > 0) {
          await idbSet('pending_ops', legacyOps);
        }
      }
    })();

    return initPromise;
  }

  static saveSession(user: { id: string; email: string; salt: string }, token: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SESSION_USER, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, token);
    } catch (e) {
      console.error('Failed to save session to localStorage', e);
    }
  }

  static getSession(): { user: { id: string; email: string; salt: string }; token: string } | null {
    try {
      const userStr = localStorage.getItem(STORAGE_KEYS.SESSION_USER);
      const token = localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
      if (!userStr || !token) return null;
      return { user: JSON.parse(userStr), token };
    } catch {
      return null;
    }
  }

  static clearSession(): void {
    memoryVault = { items: [], checksum: '', version: 0 };
    memoryPendingOps = [];
    localStorage.removeItem(STORAGE_KEYS.SESSION_USER);
    localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_ITEMS);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_CHECKSUM);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_VERSION);
    localStorage.removeItem(STORAGE_KEYS.PENDING_OPS);
    void idbDeleteKeys(['vault_cache', 'pending_ops']);
  }

  static saveLocalVault(items: VaultItem[], checksum: string, version: number): void {
    const sanitized: VaultItem[] = items.map((i) => ({
      id: i.id,
      itemType: i.itemType,
      ciphertext: i.ciphertext,
      iv: i.iv,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    const payload: LocalVaultCache = { items: sanitized, checksum, version };
    memoryVault = payload;

    void idbSet('vault_cache', payload).then((ok) => {
      if (ok) {
        try {
          localStorage.removeItem(STORAGE_KEYS.LOCAL_ITEMS);
        } catch {
          // ignore
        }
        return;
      }
      // Fallback to localStorage if IndexedDB is unavailable
      try {
        localStorage.setItem(STORAGE_KEYS.LOCAL_ITEMS, JSON.stringify(sanitized));
        localStorage.setItem(STORAGE_KEYS.LOCAL_CHECKSUM, checksum);
        localStorage.setItem(STORAGE_KEYS.LOCAL_VERSION, version.toString());
      } catch (e) {
        console.warn('LocalStorage quota exceeded or unavailable', e);
      }
    });
  }

  static getLocalVault(): LocalVaultCache {
    if (memoryVault) return memoryVault;
    return readLegacyVaultFromLocalStorage();
  }

  static getPendingOps(): PendingSyncOp[] {
    if (memoryPendingOps) return memoryPendingOps;
    return readLegacyPendingOpsFromLocalStorage();
  }

  static enqueuePendingOp(op: PendingSyncOp): void {
    const current = [...this.getPendingOps()];
    // Collapse multiple pending changes for the same item ID into the latest op
    const filtered = current.filter((existing) => existing.id !== op.id);
    filtered.push(op);
    this.persistPendingOps(filtered);
  }

  static removePendingOps(ids: string[]): void {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const remaining = this.getPendingOps().filter((op) => !idSet.has(op.id));
    this.persistPendingOps(remaining);
  }

  private static persistPendingOps(ops: PendingSyncOp[]): void {
    memoryPendingOps = ops;
    void idbSet('pending_ops', ops).then((ok) => {
      if (ok) {
        try {
          localStorage.removeItem(STORAGE_KEYS.PENDING_OPS);
        } catch {
          // ignore
        }
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEYS.PENDING_OPS, JSON.stringify(ops));
      } catch {
        // ignore
      }
    });
  }
}
