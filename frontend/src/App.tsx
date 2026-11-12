import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar.js';
import { AuthScreen } from './components/AuthScreen.js';
import { VaultView } from './components/VaultView.js';
import { ItemModal } from './components/ItemModal.js';
import { PasswordGeneratorModal, GeneratorTab } from './components/PasswordGeneratorModal.js';
import { BreachCheckModal } from './components/BreachCheckModal.js';
import { ImportModal } from './components/ImportModal.js';
import { ExportModal } from './components/ExportModal.js';
import { QuickUnlockScreen } from './components/QuickUnlockScreen.js';
import { SecuritySettingsModal } from './components/SecuritySettingsModal.js';
import { PwaBanner } from './components/PwaBanner.js';

import { UserSession, VaultItem, SyncState, ItemType, DecryptedPayload } from './types/vault.js';
import { UnifiedStorage } from './storage/unifiedStorage.js';
import { WorkerClient, AuthRevokedError } from './api/workerClient.js';
import { encryptVaultItem, decryptVaultItem } from './crypto/aesGcm.js';
import { calculateVaultChecksum } from './crypto/checksum.js';
import { deriveMasterKeys } from './crypto/keyDerivation.js';
import { ImportResultItem } from './crypto/importers/importer.js';
import { ColdWalletResult } from './crypto/coldWalletGenerator.js';
import {
  isQuickUnlockConfigured,
  hasQuickPin,
  hasBiometrics,
  removeQuickPin,
  removeBiometrics,
  saveLockedSessionMeta,
  getLockedSessionMeta,
  clearLockedSessionMeta,
  getAutoLockMinutes,
  getLockOnBlur,
} from './crypto/quickUnlock.js';

export const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [syncState, setSyncState] = useState<SyncState>('IN_SYNC');
  const [isLocked, setIsLocked] = useState<boolean>(() => isQuickUnlockConfigured());
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Modal Visibility States
  const [isItemModalOpen, setIsItemModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);

  const [isGeneratorOpen, setIsGeneratorOpen] = useState<boolean>(false);
  const [generatorInitialMode, setGeneratorInitialMode] = useState<GeneratorTab>('password');
  const [onGeneratorSelect, setOnGeneratorSelect] = useState<((pass: string) => void) | undefined>(undefined);

  const [isBreachAuditOpen, setIsBreachAuditOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);

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

  // Full logout (switches to master password login and clears locked session)
  const handleFullLogout = useCallback((notice?: string) => {
    setSession(null);
    setItems([]);
    UnifiedStorage.clearSession();
    clearLockedSessionMeta();
    setIsLocked(false);
    setSessionNotice(notice ?? null);
  }, []);

  // Initialize IndexedDB storage on startup
  useEffect(() => {
    void UnifiedStorage.init();
  }, []);

  // Synchronize local vault with Cloudflare D1 worker
  const performSync = useCallback(
    async (currentSession: UserSession, localItems: VaultItem[]) => {
      setSyncState('SYNCING');
      try {
        await UnifiedStorage.init();

        // 0. Replay any queued offline saves/deletes first
        const pendingOps = [...UnifiedStorage.getPendingOps()].sort((a, b) => a.timestamp - b.timestamp);
        for (const op of pendingOps) {
          try {
            if (op.type === 'upsert') {
              await WorkerClient.saveVaultItem(currentSession.token, op.item);
            } else {
              await WorkerClient.deleteVaultItem(currentSession.token, op.id);
            }
            UnifiedStorage.removePendingOps([op.id]);
          } catch (opErr) {
            if (opErr instanceof AuthRevokedError) {
              removeQuickPin();
              removeBiometrics();
              handleFullLogout(opErr.message);
              return;
            }
            console.warn('Offline queue replay paused (still offline)', opErr);
            setSyncState('OFFLINE');
            return;
          }
        }

        // 1. Calculate local checksum
        const localChecksum = await calculateVaultChecksum(localItems);

        // 2. Query Cloudflare Worker for server checksum status
        let serverStatus;
        try {
          serverStatus = await WorkerClient.getVaultStatus(currentSession.token);
        } catch (e) {
          if (e instanceof AuthRevokedError) {
            removeQuickPin();
            removeBiometrics();
            handleFullLogout(e.message);
            return;
          }
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
        if (err instanceof AuthRevokedError) {
          removeQuickPin();
          removeBiometrics();
          handleFullLogout(err.message);
          return;
        }
        console.error('Sync failed', err);
        setSyncState('ERROR');
      }
    },
    [decryptAllItems, handleFullLogout]
  );

  // Initialize vault on full master password authentication
  const handleAuthenticated = async (newSession: UserSession) => {
    setSessionNotice(null);
    setSession(newSession);
    saveLockedSessionMeta(newSession);
    UnifiedStorage.saveSession(newSession.user, newSession.token);
    setIsLocked(false);

    // 1. Ensure IndexedDB is initialized and load local cache
    await UnifiedStorage.init();
    const { items: cachedItems } = UnifiedStorage.getLocalVault();
    if (cachedItems.length > 0) {
      const decrypted = await decryptAllItems(cachedItems, newSession.vaultKey);
      setItems(decrypted);
    }

    // 2. Trigger sync with Cloudflare D1
    await performSync(newSession, cachedItems);
  };

  // Lock Master Vault and wipe keys from memory
  const handleLock = useCallback(() => {
    if (session && isQuickUnlockConfigured()) {
      saveLockedSessionMeta(session);
      setSession(null);
      setItems([]);
      setIsLocked(true);
    } else {
      // Full logout if Quick Unlock is not configured
      handleFullLogout();
    }
  }, [session, handleFullLogout]);

  // Switch to Master Password screen without destroying locked session
  const handleSwitchToPassword = () => {
    setIsLocked(false);
  };

  // Revoke all sessions across all devices ("Log Out All Devices")
  const handleRevokeAllSessions = async () => {
    if (!session) return;
    await WorkerClient.revokeAllSessions(session.token);
    removeQuickPin();
    removeBiometrics();
    handleFullLogout('All active sessions across your devices have been logged out.');
  };

  // Permanently delete account & encrypted cloud vault
  const handleDeleteAccount = async (masterPassword: string) => {
    if (!session) return;
    const { authKeyHash } = await deriveMasterKeys(masterPassword, session.user.salt);
    await WorkerClient.deleteAccount(session.token, authKeyHash);
    removeQuickPin();
    removeBiometrics();
    handleFullLogout('Your account and encrypted cloud vault have been permanently deleted.');
  };

  // Quick Unlock success handler (restores vaultKey into RAM)
  const handleQuickUnlocked = async (unwrappedKey: CryptoKey) => {
    const meta = getLockedSessionMeta();
    if (!meta) {
      handleFullLogout();
      return;
    }

    const restoredSession: UserSession = {
      token: meta.token,
      user: meta.user,
      vaultKey: unwrappedKey,
      authKeyHash: meta.authKeyHash,
    };

    setSession(restoredSession);
    setIsLocked(false);

    // Decrypt cached items with unwrapped key
    await UnifiedStorage.init();
    const { items: cachedItems } = UnifiedStorage.getLocalVault();
    if (cachedItems.length > 0) {
      const decrypted = await decryptAllItems(cachedItems, unwrappedKey);
      setItems(decrypted);
    }

    // Trigger cloud sync
    await performSync(restoredSession, cachedItems);
  };

  // Auto-Lock Inactivity & Tab Blur Listener
  useEffect(() => {
    if (!session || isLocked) return;

    let timeoutId: number | null = null;

    const resetTimer = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      const minutes = getAutoLockMinutes();
      if (minutes > 0) {
        timeoutId = window.setTimeout(() => {
          handleLock();
        }, minutes * 60 * 1000);
      }
    };

    const handleActivity = () => {
      resetTimer();
    };

    const handleBlur = () => {
      if (getLockOnBlur()) {
        handleLock();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && getLockOnBlur()) {
        handleLock();
      }
    };

    resetTimer();

    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, isLocked, handleLock]);

  // Add or Edit Vault Item
  const handleSaveItem = async (data: { id?: string; itemType: ItemType; payload: DecryptedPayload }) => {
    if (!session) return;

    const itemId = data.id || crypto.randomUUID();
    const now = Date.now();
    const existingItem = items.find(i => i.id === itemId);

    // 1. Encrypt payload locally using AES-256-GCM
    const { ciphertext, iv } = await encryptVaultItem(data.payload, session.vaultKey);

    const newItem: VaultItem = {
      id: itemId,
      itemType: data.itemType,
      ciphertext,
      iv,
      createdAt: existingItem?.createdAt || editingItem?.createdAt || now,
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
      if (e instanceof AuthRevokedError) {
        removeQuickPin();
        removeBiometrics();
        handleFullLogout(e.message);
        return;
      }
      console.warn('Saved locally, queued for cloud sync...', e);
      UnifiedStorage.enqueuePendingOp({
        type: 'upsert',
        id: newItem.id,
        item: {
          id: newItem.id,
          ciphertext: newItem.ciphertext,
          iv: newItem.iv,
          itemType: newItem.itemType,
        },
        timestamp: Date.now(),
      });
      setSyncState('OFFLINE');
    }
  };

  // Bulk Import Handlers
  const handleImportItems = async (importedItems: ImportResultItem[]) => {
    if (!session) return;
    const now = Date.now();
    const newVaultItems: VaultItem[] = [];

    for (const item of importedItems) {
      const payload: DecryptedPayload = {
        name: item.name,
        username: item.username,
        password: item.password,
        url: item.url,
        notes: item.notes,
        totpSecret: item.totpSecret,
        secretValue: item.secretValue,
        environment: item.environment,
        walletAddress: item.walletAddress,
        seedPhrase: item.seedPhrase,
        privateKey: item.privateKey,
        network: item.network,
        derivationPath: item.derivationPath,
        tags: item.tags,
      };

      const { ciphertext, iv } = await encryptVaultItem(payload, session.vaultKey);
      newVaultItems.push({
        id: crypto.randomUUID(),
        itemType: item.itemType || 'login',
        ciphertext,
        iv,
        createdAt: now,
        updatedAt: now,
        decrypted: payload,
      });
    }

    const updatedList = [...newVaultItems, ...items];
    setItems(updatedList);

    const localChecksum = await calculateVaultChecksum(updatedList);
    UnifiedStorage.saveLocalVault(updatedList, localChecksum, 1);

    // Batch sync to server
    performSync(session, updatedList);
  };

  // Permanent Delete Vault Item
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
      if (e instanceof AuthRevokedError) {
        removeQuickPin();
        removeBiometrics();
        handleFullLogout(e.message);
        return;
      }
      console.warn('Deleted locally, queued for cloud sync...', e);
      UnifiedStorage.enqueuePendingOp({
        type: 'delete',
        id,
        timestamp: Date.now(),
      });
      setSyncState('OFFLINE');
    }
  };

  // Soft Delete Vault Item (Move to Trash)
  const handleSoftDelete = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item || !item.decrypted) return;
    const updatedPayload: DecryptedPayload = {
      ...item.decrypted,
      deletedAt: Date.now(),
    };
    await handleSaveItem({
      id: item.id,
      itemType: item.itemType,
      payload: updatedPayload,
    });
  };

  // Restore Vault Item from Trash
  const handleRestoreItem = async (item: VaultItem) => {
    if (!item.decrypted) return;
    const updatedPayload: DecryptedPayload = {
      ...item.decrypted,
    };
    delete updatedPayload.deletedAt;
    await handleSaveItem({
      id: item.id,
      itemType: item.itemType,
      payload: updatedPayload,
    });
  };

  // Empty Trash (Permanently purges all items currently in Trash)
  const handleEmptyTrash = async () => {
    if (!session) return;
    const trashItems = items.filter(i => !!i.decrypted?.deletedAt);
    if (trashItems.length === 0) return;

    const remainingItems = items.filter(i => !i.decrypted?.deletedAt);
    setItems(remainingItems);

    const localChecksum = await calculateVaultChecksum(remainingItems);
    UnifiedStorage.saveLocalVault(remainingItems, localChecksum, 1);

    try {
      setSyncState('SYNCING');
      await Promise.all(
        trashItems.map(item =>
          WorkerClient.deleteVaultItem(session.token, item.id)
        )
      );
      setSyncState('IN_SYNC');
    } catch (e) {
      if (e instanceof AuthRevokedError) {
        removeQuickPin();
        removeBiometrics();
        handleFullLogout(e.message);
        return;
      }
      console.warn('Batch trash empty queued for cloud sync...', e);
      const now = Date.now();
      for (const item of trashItems) {
        UnifiedStorage.enqueuePendingOp({
          type: 'delete',
          id: item.id,
          timestamp: now,
        });
      }
      setSyncState('OFFLINE');
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (item: VaultItem) => {
    if (!item.decrypted || !session) return;
    const updatedPayload: DecryptedPayload = {
      ...item.decrypted,
      favorite: !item.decrypted.favorite,
    };
    await handleSaveItem({
      id: item.id,
      itemType: item.itemType,
      payload: updatedPayload,
    });
  };

  const openGeneratorModal = (onSelect?: (pass: string) => void, mode: GeneratorTab = 'password') => {
    setOnGeneratorSelect(() => onSelect);
    setGeneratorInitialMode(mode);
    setIsGeneratorOpen(true);
  };

  const handleSaveColdWalletToVault = (wallet: ColdWalletResult) => {
    setEditingItem({
      id: '',
      itemType: 'wallet',
      ciphertext: '',
      iv: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      decrypted: {
        name: `${wallet.network} Cold Wallet`,
        walletAddress: wallet.walletAddress,
        seedPhrase: wallet.mnemonic,
        privateKey: wallet.privateKey,
        network: wallet.network,
        derivationPath: wallet.derivationPath,
        tags: ['Cold Wallet', 'Crypto'],
      },
    });
    setIsGeneratorOpen(false);
    setIsItemModalOpen(true);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        Boolean(target?.isContentEditable);

      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.key === 'Escape') {
        setIsItemModalOpen(false);
        setIsGeneratorOpen(false);
        setIsBreachAuditOpen(false);
        setIsImportModalOpen(false);
        setIsExportModalOpen(false);
        setIsSecurityModalOpen(false);
        return;
      }

      if (!session || isLocked) return;

      if (isMod && key === 'l') {
        e.preventDefault();
        handleLock();
        return;
      }

      if ((isMod && key === 'k') || (e.key === '/' && !isTypingTarget)) {
        e.preventDefault();
        const searchInput = document.getElementById('vault-search-desktop') as HTMLInputElement | null;
        searchInput?.focus();
        searchInput?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session, isLocked, handleLock]);

  // Automatic online/offline detection & pending sync replay
  useEffect(() => {
    const handleOffline = () => {
      if (session) setSyncState('OFFLINE');
    };

    const handleOnline = () => {
      if (session && !isLocked) {
        void performSync(session, items);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [session, isLocked, items, performSync]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        userEmail={session?.user?.email}
        syncState={syncState}
        onLock={handleLock}
        onOpenGenerator={() => openGeneratorModal()}
        onOpenBreachAudit={() => setIsBreachAuditOpen(true)}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenExport={() => setIsExportModalOpen(true)}
        onOpenSecurity={() => setIsSecurityModalOpen(true)}
        onManualSync={() => session && performSync(session, items)}
      />

      {isLocked && isQuickUnlockConfigured() ? (
        <QuickUnlockScreen
          onUnlocked={handleQuickUnlocked}
          onSwitchToPassword={handleSwitchToPassword}
          onFullLogout={() => handleFullLogout()}
        />
      ) : !session ? (
        <AuthScreen
          onAuthenticated={handleAuthenticated}
          onOpenGenerator={() => openGeneratorModal()}
          onQuickUnlock={
            (hasQuickPin() || hasBiometrics()) ? () => setIsLocked(true) : undefined
          }
          sessionNotice={sessionNotice}
        />
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
          onRestoreItem={handleRestoreItem}
          onPermanentDelete={handleDeleteItem}
          onEmptyTrash={handleEmptyTrash}
        />
      )}

      {/* Modals */}
      <ItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        onSave={handleSaveItem}
        onSoftDelete={handleSoftDelete}
        onPermanentDelete={handleDeleteItem}
        onRestore={handleRestoreItem}
        initialItem={editingItem}
        onOpenGenerator={(onSelect, mode) => openGeneratorModal(onSelect, mode)}
      />

      <PasswordGeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        onSelectPassword={onGeneratorSelect}
        onSaveColdWalletToVault={handleSaveColdWalletToVault}
        initialMode={generatorInitialMode}
        isLoggedIn={Boolean(session)}
      />

      <BreachCheckModal
        isOpen={isBreachAuditOpen}
        onClose={() => setIsBreachAuditOpen(false)}
        items={items.filter(i => !i.decrypted?.deletedAt)}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={handleImportItems}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        items={items.filter(i => !i.decrypted?.deletedAt)}
      />

      {session && (
        <SecuritySettingsModal
          isOpen={isSecurityModalOpen}
          onClose={() => setIsSecurityModalOpen(false)}
          session={session}
          onUpdateSession={(updatedSession) => setSession(updatedSession)}
          onRevokeAllSessions={handleRevokeAllSessions}
          onDeleteAccount={handleDeleteAccount}
        />
      )}

      <PwaBanner />
    </div>
  );
};

export default App;
