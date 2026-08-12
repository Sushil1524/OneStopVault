import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar.js';
import { AuthScreen } from './components/AuthScreen.js';
import { VaultView } from './components/VaultView.js';
import { ItemModal } from './components/ItemModal.js';
import { PasswordGeneratorModal } from './components/PasswordGeneratorModal.js';
import { BreachCheckModal } from './components/BreachCheckModal.js';

import { UserSession, VaultItem, SyncState, ItemType, DecryptedPayload } from './types/vault.js';
import { UnifiedStorage } from './storage/unifiedStorage.js';
import { WorkerClient } from './api/workerClient.js';
import { encryptVaultItem, decryptVaultItem } from './crypto/aesGcm.js';
import { calculateVaultChecksum } from './crypto/checksum.js';

export const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [syncState, setSyncState] = useState<SyncState>('IN_SYNC');

  // Modal Visibility States
  const [isItemModalOpen, setIsItemModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);

  const [isGeneratorOpen, setIsGeneratorOpen] = useState<boolean>(false);
  const [onGeneratorSelect, setOnGeneratorSelect] = useState<((pass: string) => void) | undefined>(undefined);

  const [isBreachAuditOpen, setIsBreachAuditOpen] = useState<boolean>(false);

  // Decrypt items in memory using session vaultKey
  const decryptAllItems = useCallback(
    async (encryptedItems: VaultItem[], key: CryptoKey): Promise<VaultItem[]> => {
      const result: VaultItem[] = [];
      for (const item of encryptedItems) {
        try {
          const decrypted = await decryptVaultItem(item.ciphertext, item.iv, key);
          result.push({ ...item, decrypted });
        } catch (err) {
          console.warn('Failed to decrypt item', item.id, err);
          result.push({
            ...item,
            decrypted: { name: 'Decryption Error (Bad Key)' },
          });
        }
      }
      return result;
    },
    []
  );

  // Synchronize local vault with Cloudflare D1 worker
  const performSync = useCallback(
    async (currentSession: UserSession, localItems: VaultItem[]) => {
      setSyncState('SYNCING');
      try {
        // 1. Calculate local checksum
        const localChecksum = await calculateVaultChecksum(localItems);

        // 2. Query Cloudflare Worker for server checksum status
        let serverStatus;
        try {
          serverStatus = await WorkerClient.getVaultStatus(currentSession.token);
        } catch (e) {
          console.warn('Worker server offline or unreachable', e);
          setSyncState('OFFLINE');
          return;
        }

        // 3. Compare local checksum vs server checksum
        if (localChecksum === serverStatus.checksum && localChecksum !== '') {
          setSyncState('IN_SYNC');
          return;
        }

        // 4. Mismatch detected -> Perform batch sync / reconciliation
        setSyncState('MISMATCH');
        const syncRes = await WorkerClient.batchSync(currentSession.token, localItems, localChecksum);

        if (syncRes.items) {
          // Worker returned server items -> decrypt & merge
          const serverItems: VaultItem[] = syncRes.items.map((i: any) => ({
            id: i.id,
            itemType: i.itemType || 'login',
            ciphertext: i.ciphertext,
            iv: i.iv,
            createdAt: i.createdAt,
            updatedAt: i.updatedAt,
          }));

          const decryptedServerItems = await decryptAllItems(serverItems, currentSession.vaultKey);
          setItems(decryptedServerItems);

          // Update local storage cache with reconciled items & checksum
          const newChecksum = await calculateVaultChecksum(decryptedServerItems);
          UnifiedStorage.saveLocalVault(decryptedServerItems, newChecksum, syncRes.metadata.version);
        }

        setSyncState('IN_SYNC');
      } catch (err) {
        console.error('Sync failed', err);
        setSyncState('ERROR');
      }
    },
    [decryptAllItems]
  );

  // Initialize vault on authentication
  const handleAuthenticated = async (newSession: UserSession) => {
    setSession(newSession);
    UnifiedStorage.saveSession(newSession.user, newSession.token);

    // 1. Load local cache
    const { items: cachedItems } = UnifiedStorage.getLocalVault();
    if (cachedItems.length > 0) {
      const decrypted = await decryptAllItems(cachedItems, newSession.vaultKey);
      setItems(decrypted);
    }

    // 2. Trigger sync with Cloudflare D1
    await performSync(newSession, cachedItems);
  };

  // Lock Master Vault and wipe keys from memory
  const handleLock = () => {
    setSession(null);
    setItems([]);
    UnifiedStorage.clearSession();
  };

  // Add or Edit Vault Item
  const handleSaveItem = async (data: { id?: string; itemType: ItemType; payload: DecryptedPayload }) => {
    if (!session) return;

    const itemId = data.id || crypto.randomUUID();
    const now = Date.now();

    // 1. Encrypt payload locally using AES-256-GCM
    const { ciphertext, iv } = await encryptVaultItem(data.payload, session.vaultKey);

    const newItem: VaultItem = {
      id: itemId,
      itemType: data.itemType,
      ciphertext,
      iv,
      createdAt: editingItem?.createdAt || now,
      updatedAt: now,
      decrypted: data.payload,
    };

    // 2. Update local React state immediately
    const updatedList = items.some(i => i.id === itemId)
      ? items.map(i => (i.id === itemId ? newItem : i))
      : [newItem, ...items];

    setItems(updatedList);

    // 3. Save to browser LocalStorage cache
    const localChecksum = await calculateVaultChecksum(updatedList);
    UnifiedStorage.saveLocalVault(updatedList, localChecksum, 1);

    // 4. Send encrypted payload to Cloudflare Worker API
    try {
      setSyncState('SYNCING');
      await WorkerClient.saveVaultItem(session.token, {
        id: newItem.id,
        ciphertext: newItem.ciphertext,
        iv: newItem.iv,
        itemType: newItem.itemType,
      });
      setSyncState('IN_SYNC');
    } catch (e) {
      console.warn('Saved locally, background cloud sync pending...', e);
      setSyncState('OFFLINE');
    }
  };

  // Delete Vault Item
  const handleDeleteItem = async (id: string) => {
    if (!session) return;

    const updatedList = items.filter(i => i.id !== id);
    setItems(updatedList);

    const localChecksum = await calculateVaultChecksum(updatedList);
    UnifiedStorage.saveLocalVault(updatedList, localChecksum, 1);

    try {
      setSyncState('SYNCING');
      await WorkerClient.deleteVaultItem(session.token, id);
      setSyncState('IN_SYNC');
    } catch (e) {
      console.warn('Deleted locally, background cloud sync pending...', e);
      setSyncState('OFFLINE');
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (item: VaultItem) => {
    if (!item.decrypted) return;
    const updatedPayload = { ...item.decrypted, favorite: !item.decrypted.favorite };
    await handleSaveItem({
      id: item.id,
      itemType: item.itemType,
      payload: updatedPayload,
    });
  };

  const openGeneratorModal = (onSelect?: (pass: string) => void) => {
    setOnGeneratorSelect(() => onSelect);
    setIsGeneratorOpen(true);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        userEmail={session?.user.email}
        syncState={syncState}
        onLock={handleLock}
        onOpenGenerator={() => openGeneratorModal()}
        onOpenBreachAudit={() => setIsBreachAuditOpen(true)}
        onManualSync={() => session && performSync(session, items)}
      />

      {!session ? (
        <AuthScreen onAuthenticated={handleAuthenticated} onOpenGenerator={() => openGeneratorModal()} />
      ) : (
        <VaultView
          items={items}
          onAddNew={() => {
            setEditingItem(null);
            setIsItemModalOpen(true);
          }}
          onEditItem={(item) => {
            setEditingItem(item);
            setIsItemModalOpen(true);
          }}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      {/* Modals */}
      <ItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
        initialItem={editingItem}
        onOpenGenerator={(onSelect) => openGeneratorModal(onSelect)}
      />

      <PasswordGeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        onSelectPassword={onGeneratorSelect}
      />

      <BreachCheckModal
        isOpen={isBreachAuditOpen}
        onClose={() => setIsBreachAuditOpen(false)}
        items={items}
      />
    </div>
  );
};

export default App;
