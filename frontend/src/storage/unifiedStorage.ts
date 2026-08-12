/**
 * Unified Storage Wrapper (IndexedDB + LocalStorage Fallback)
 * Manages encrypted vault cache and checksum persistence locally in the browser.
 */

import { VaultItem } from '../types/vault.js';

const STORAGE_KEYS = {
  SESSION_USER: 'onestop_vault_user',
  SESSION_TOKEN: 'onestop_vault_token',
  LOCAL_ITEMS: 'onestop_vault_items',
  LOCAL_CHECKSUM: 'onestop_vault_checksum',
  LOCAL_VERSION: 'onestop_vault_version',
};

export class UnifiedStorage {
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
    } catch (e) {
      return null;
    }
  }

  static clearSession(): void {
    localStorage.removeItem(STORAGE_KEYS.SESSION_USER);
    localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_ITEMS);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_CHECKSUM);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_VERSION);
  }

  static saveLocalVault(items: VaultItem[], checksum: string, version: number): void {
    try {
      // Store encrypted items (excluding in-memory decrypted payloads)
      const sanitized = items.map(i => ({
        id: i.id,
        itemType: i.itemType,
        ciphertext: i.ciphertext,
        iv: i.iv,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      }));

      localStorage.setItem(STORAGE_KEYS.LOCAL_ITEMS, JSON.stringify(sanitized));
      localStorage.setItem(STORAGE_KEYS.LOCAL_CHECKSUM, checksum);
      localStorage.setItem(STORAGE_KEYS.LOCAL_VERSION, version.toString());
    } catch (e) {
      console.warn('LocalStorage quota exceeded or unavailable', e);
    }
  }

  static getLocalVault(): { items: VaultItem[]; checksum: string; version: number } {
    try {
      const itemsStr = localStorage.getItem(STORAGE_KEYS.LOCAL_ITEMS);
      const checksum = localStorage.getItem(STORAGE_KEYS.LOCAL_CHECKSUM) || '';
      const versionStr = localStorage.getItem(STORAGE_KEYS.LOCAL_VERSION) || '0';

      const items: VaultItem[] = itemsStr ? JSON.parse(itemsStr) : [];
      return { items, checksum, version: parseInt(versionStr, 10) };
    } catch (e) {
      return { items: [], checksum: '', version: 0 };
    }
  }
}
