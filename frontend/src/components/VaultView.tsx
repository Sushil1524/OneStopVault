import React, { useState } from 'react';
import {
  Search,
  Plus,
  KeyRound,
  FileText,
  Star,
  ShieldCheck,
  Tag,
  Terminal,
  Wallet,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { VaultItem } from '../types/vault.js';
import { VaultItemCard } from './VaultItemCard.js';

interface VaultViewProps {
  items: VaultItem[];
  onAddNew: () => void;
  onEditItem: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void;
  onRestoreItem?: (item: VaultItem) => void;
  onPermanentDelete?: (id: string) => void;
  onEmptyTrash?: () => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: <ShieldCheck size={14} /> },
  { id: 'favorites', label: 'Starred', icon: <Star size={14} /> },
  { id: 'login', label: 'Logins', icon: <KeyRound size={14} /> },
  { id: 'wallet', label: 'Wallets', icon: <Wallet size={14} /> },
  { id: 'secret', label: 'API Keys', icon: <Terminal size={14} /> },
  { id: 'note', label: 'Notes', icon: <FileText size={14} /> },
  { id: 'trash', label: 'Trash', icon: <Trash2 size={14} /> },
];

export const VaultView: React.FC<VaultViewProps> = ({
  items,
  onAddNew,
  onEditItem,
  onToggleFavorite,
  onRestoreItem,
  onPermanentDelete,
  onEmptyTrash,
}) => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const activeItems = items.filter(i => !i.decrypted?.deletedAt);
  const trashItems = items.filter(i => !!i.decrypted?.deletedAt);

  const allTags = Array.from(new Set(activeItems.flatMap(i => i.decrypted?.tags || []))).sort();

  const isTrashView = activeCategory === 'trash';
  const basePool = isTrashView ? trashItems : activeItems;

  const filteredItems = basePool.filter(item => {
    const d = item.decrypted;
    if (!isTrashView) {
      if (activeCategory === 'favorites' && !d?.favorite) return false;
      if (activeCategory === 'login' && item.itemType !== 'login') return false;
      if (activeCategory === 'wallet' && item.itemType !== 'wallet') return false;
      if (activeCategory === 'secret' && item.itemType !== 'secret') return false;
      if (activeCategory === 'note' && item.itemType !== 'note') return false;
    }
    if (activeTag && (!d?.tags || !d.tags.includes(activeTag))) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        d?.name?.toLowerCase().includes(q) ||
        d?.username?.toLowerCase().includes(q) ||
        d?.url?.toLowerCase().includes(q) ||
        d?.notes?.toLowerCase().includes(q) ||
        d?.environment?.toLowerCase().includes(q) ||
        d?.secretValue?.toLowerCase().includes(q) ||
        d?.walletAddress?.toLowerCase().includes(q) ||
        d?.network?.toLowerCase().includes(q) ||
        d?.derivationPath?.toLowerCase().includes(q) ||
        d?.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const counts: Record<string, number> = {
    all: activeItems.length,
    favorites: activeItems.filter(i => i.decrypted?.favorite).length,
    login: activeItems.filter(i => i.itemType === 'login').length,
    wallet: activeItems.filter(i => i.itemType === 'wallet').length,
    secret: activeItems.filter(i => i.itemType === 'secret').length,
    note: activeItems.filter(i => i.itemType === 'note').length,
    trash: trashItems.length,
  };

  // Shared empty state
  const EmptyState = () => (
    <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center' }}>
      {isTrashView ? (
        <>
          <Trash2 size={40} style={{ opacity: 0.35, display: 'block', margin: '0 auto 12px', color: 'var(--text-muted)' }} />
          <h3 style={{ marginBottom: '6px', fontSize: '1rem' }}>Trash is empty</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Items you delete from your vault will be kept here safely for recovery.
          </p>
        </>
      ) : (
        <>
          <ShieldCheck size={40} style={{ opacity: 0.45, marginBottom: '12px', display: 'block', margin: '0 auto 12px' }} />
          <h3 style={{ marginBottom: '6px', fontSize: '1rem' }}>
            {searchQuery || activeTag ? 'No items match' : 'Your vault is empty'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            {searchQuery || activeTag
              ? 'Clear filters to see all items.'
              : 'Tap + to add your first password, crypto wallet, API key, or note.'}
          </p>
          {!searchQuery && !activeTag && (
            <button onClick={onAddNew} className="btn btn-primary">
              <Plus size={15} /> Add First Item
            </button>
          )}
        </>
      )}
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* ════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden on mobile via CSS)
      ════════════════════════════════════════════════ */}
      <div
        className="desktop-only"
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          width: '100%',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          gap: '20px',
          flex: 1,
        }}
      >
        {/* Desktop Sidebar */}
        <aside style={{ height: 'fit-content' }}>
          <div className="glass-panel" style={{ padding: '14px' }}>
            <button
              onClick={onAddNew}
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px', marginBottom: '12px' }}
            >
              <Plus size={16} /> New Item
            </button>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {CATEGORIES.map(cat => {
                const isActive = activeCategory === cat.id && !activeTag;
                const isTrashCat = cat.id === 'trash';
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setActiveTag(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive
                        ? isTrashCat
                          ? 'rgba(244, 63, 94, 0.15)'
                          : 'rgba(255,255,255,0.12)'
                        : 'transparent',
                      color: isActive
                        ? isTrashCat
                          ? '#fda4af'
                          : '#fff'
                        : isTrashCat && counts.trash > 0
                        ? 'var(--accent-rose)'
                        : 'var(--text-muted)',
                      fontWeight: isActive ? 600 : 400,
                      fontSize: '0.875rem',
                      transition: 'all 0.15s ease',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {cat.icon} {cat.label}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '1px 6px',
                        borderRadius: '6px',
                        background: isTrashCat && counts.trash > 0 ? 'rgba(244, 63, 94, 0.2)' : 'rgba(255,255,255,0.06)',
                        color: isTrashCat && counts.trash > 0 ? '#fda4af' : 'var(--text-dim)',
                      }}
                    >
                      {counts[cat.id]}
                    </span>
                  </button>
                );
              })}
            </nav>

            {allTags.length > 0 && !isTrashView && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                <div
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    color: 'var(--text-dim)',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Tag size={11} /> Tags
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {allTags.map(tag => {
                    const sel = activeTag === tag;
                    return (
                      <button
                        key={tag}
                        onClick={() => setActiveTag(sel ? null : tag)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          border: sel ? '1px solid #fff' : '1px solid var(--border-color)',
                          background: sel ? '#fff' : 'rgba(255,255,255,0.05)',
                          color: sel ? '#000' : 'var(--text-muted)',
                          transition: 'all 0.15s',
                        }}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Desktop main content */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          {/* Trash Header Banner */}
          {isTrashView && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Trash2 size={20} color="var(--accent-rose)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
                    Trash Bin ({trashItems.length})
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Items here remain client-side encrypted until permanently deleted. You can restore items at any time.
                  </div>
                </div>
              </div>

              {trashItems.length > 0 && onEmptyTrash && (
                <button
                  onClick={() => {
                    if (confirm(`Empty trash? All ${trashItems.length} item(s) will be permanently deleted forever.`)) {
                      onEmptyTrash();
                    }
                  }}
                  className="btn btn-danger"
                  style={{ padding: '6px 14px', fontSize: '0.8rem', minHeight: 'auto', gap: '6px' }}
                >
                  <Trash2 size={14} /> Empty Trash
                </button>
              )}
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
                pointerEvents: 'none',
              }}
            />
            <input
              id="vault-search-desktop"
              type="text"
              className="input-field"
              style={{ paddingLeft: '36px' }}
              placeholder={isTrashView ? 'Search trash items…' : 'Search passwords, wallets, notes, tags… (Ctrl+K)'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start', fontSize: '0.78rem', padding: '4px 10px' }}
            >
              #{activeTag} ✕
            </button>
          )}

          {filteredItems.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
                gap: '12px',
                alignItems: 'start',
              }}
            >
              {filteredItems.map(item => (
                <VaultItemCard
                  key={item.id}
                  item={item}
                  onEdit={onEditItem}
                  onToggleFavorite={onToggleFavorite}
                  onRestore={onRestoreItem}
                  onPermanentDelete={onPermanentDelete}
                />
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </main>
      </div>

      {/* ════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on desktop via CSS)
      ════════════════════════════════════════════════ */}

      {/* Sticky category tab bar */}
      <div className="mobile-category-bar">
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id && !activeTag;
          const isTrashCat = cat.id === 'trash';
          return (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setActiveTag(null);
              }}
              className="mobile-cat-tab"
              data-active={isActive ? 'true' : 'false'}
              style={{
                color: isActive
                  ? isTrashCat
                    ? '#fda4af'
                    : '#ffffff'
                  : isTrashCat && counts.trash > 0
                  ? 'var(--accent-rose)'
                  : undefined,
                borderBottomColor: isActive
                  ? isTrashCat
                    ? 'var(--accent-rose)'
                    : '#ffffff'
                  : 'transparent',
              }}
            >
              <span className="mobile-cat-tab-icon">{cat.icon}</span>
              <span className="mobile-cat-tab-label">{cat.label}</span>
              {counts[cat.id] > 0 && (
                <span
                  className="mobile-cat-tab-count"
                  style={{
                    background: isTrashCat ? 'rgba(244,63,94,0.3)' : undefined,
                    color: isTrashCat ? '#fda4af' : undefined,
                  }}
                >
                  {counts[cat.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mobile search + list */}
      <div className="mobile-content">
        {/* Mobile Trash Header */}
        {isTrashView && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              marginBottom: '10px',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trash2 size={16} color="var(--accent-rose)" />
              <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#fff' }}>
                Trash ({trashItems.length})
              </span>
            </div>

            {trashItems.length > 0 && onEmptyTrash && (
              <button
                onClick={() => {
                  if (confirm(`Empty trash? All ${trashItems.length} item(s) will be permanently deleted.`)) {
                    onEmptyTrash();
                  }
                }}
                className="btn btn-danger"
                style={{ padding: '4px 10px', fontSize: '0.75rem', minHeight: 'auto', gap: '4px' }}
              >
                <Trash2 size={12} /> Empty Trash
              </button>
            )}
          </div>
        )}

        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-dim)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '36px' }}
            placeholder={isTrashView ? 'Search trash items…' : 'Search vault…'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {activeTag && (
          <button
            onClick={() => setActiveTag(null)}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '4px 10px', marginBottom: '10px' }}
          >
            #{activeTag} ✕
          </button>
        )}

        {filteredItems.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '80px' }}>
            {filteredItems.map(item => (
              <VaultItemCard
                key={item.id}
                item={item}
                onEdit={onEditItem}
                onToggleFavorite={onToggleFavorite}
                onRestore={onRestoreItem}
                onPermanentDelete={onPermanentDelete}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Mobile FAB (only for active vault, hide when in trash) */}
      {!isTrashView && (
        <button onClick={onAddNew} className="mobile-fab" title="Add New Item">
          <Plus size={22} color="#000" />
        </button>
      )}
    </div>
  );
};

