import React, { useState } from 'react';
import { Search, Plus, KeyRound, FileText, Star, ShieldCheck, Tag } from 'lucide-react';
import { VaultItem } from '../types/vault.js';
import { VaultItemCard } from './VaultItemCard.js';

interface VaultViewProps {
  items: VaultItem[];
  onAddNew: () => void;
  onEditItem: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void;
}

const CATEGORIES = [
  { id: 'all',       label: 'All',     icon: <ShieldCheck size={14} /> },
  { id: 'favorites', label: 'Starred', icon: <Star size={14} />        },
  { id: 'login',     label: 'Logins',  icon: <KeyRound size={14} />    },
  { id: 'note',      label: 'Notes',   icon: <FileText size={14} />    },
];

export const VaultView: React.FC<VaultViewProps> = ({ items, onAddNew, onEditItem, onToggleFavorite }) => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const allTags = Array.from(new Set(items.flatMap(i => i.decrypted?.tags || []))).sort();

  const filteredItems = items.filter(item => {
    const d = item.decrypted;
    if (activeCategory === 'favorites' && !d?.favorite) return false;
    if (activeCategory === 'login' && item.itemType !== 'login') return false;
    if (activeCategory === 'note' && item.itemType !== 'note') return false;
    if (activeTag && (!d?.tags || !d.tags.includes(activeTag))) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        d?.name?.toLowerCase().includes(q) ||
        d?.username?.toLowerCase().includes(q) ||
        d?.url?.toLowerCase().includes(q) ||
        d?.notes?.toLowerCase().includes(q) ||
        d?.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const counts: Record<string, number> = {
    all:       items.length,
    favorites: items.filter(i => i.decrypted?.favorite).length,
    login:     items.filter(i => i.itemType === 'login').length,
    note:      items.filter(i => i.itemType === 'note').length,
  };

  // Shared empty state
  const EmptyState = () => (
    <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center' }}>
      <ShieldCheck size={40} style={{ opacity: 0.45, marginBottom: '12px', display: 'block', margin: '0 auto 12px' }} />
      <h3 style={{ marginBottom: '6px', fontSize: '1rem' }}>
        {searchQuery || activeTag ? 'No items match' : 'Your vault is empty'}
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
        {searchQuery || activeTag ? 'Clear filters to see all items.' : 'Tap + to add your first login or note.'}
      </p>
      {!searchQuery && !activeTag && (
        <button onClick={onAddNew} className="btn btn-primary">
          <Plus size={15} /> Add First Item
        </button>
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
          gridTemplateColumns: '210px 1fr',
          gap: '20px',
          flex: 1,
        }}
      >
        {/* Desktop Sidebar */}
        <aside style={{ height: 'fit-content' }}>
          <div className="glass-panel" style={{ padding: '14px' }}>
            <button onClick={onAddNew} className="btn btn-primary" style={{ width: '100%', padding: '10px', marginBottom: '12px' }}>
              <Plus size={16} /> New Item
            </button>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {CATEGORIES.map(cat => {
                const isActive = activeCategory === cat.id && !activeTag;
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveCategory(cat.id); setActiveTag(null); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                      color: isActive ? '#fff' : 'var(--text-muted)',
                      fontWeight: isActive ? 600 : 400,
                      fontSize: '0.875rem',
                      transition: 'all 0.15s ease',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {cat.icon} {cat.label}
                    </span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{counts[cat.id]}</span>
                  </button>
                );
              })}
            </nav>

            {allTags.length > 0 && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Tag size={11} /> Tags
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {allTags.map(tag => {
                    const sel = activeTag === tag;
                    return (
                      <button key={tag} onClick={() => setActiveTag(sel ? null : tag)} style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '0.72rem', cursor: 'pointer', border: sel ? '1px solid #fff' : '1px solid var(--border-color)', background: sel ? '#fff' : 'rgba(255,255,255,0.05)', color: sel ? '#000' : 'var(--text-muted)', transition: 'all 0.15s' }}>
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
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="input-field"
              style={{ paddingLeft: '36px' }}
              placeholder="Search passwords, notes, tags…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {activeTag && (
            <button onClick={() => setActiveTag(null)} className="btn btn-secondary" style={{ alignSelf: 'flex-start', fontSize: '0.78rem', padding: '4px 10px' }}>
              #{activeTag} ✕
            </button>
          )}

          {filteredItems.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '12px' }}>
              {filteredItems.map(item => (
                <VaultItemCard key={item.id} item={item} onEdit={onEditItem} onToggleFavorite={onToggleFavorite} />
              ))}
            </div>
          ) : <EmptyState />}
        </main>
      </div>

      {/* ════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on desktop via CSS)
      ════════════════════════════════════════════════ */}

      {/* Sticky category tab bar */}
      <div className="mobile-category-bar">
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id && !activeTag;
          return (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setActiveTag(null); }}
              className="mobile-cat-tab"
              data-active={isActive ? 'true' : 'false'}
            >
              <span className="mobile-cat-tab-icon">{cat.icon}</span>
              <span className="mobile-cat-tab-label">{cat.label}</span>
              {counts[cat.id] > 0 && (
                <span className="mobile-cat-tab-count">{counts[cat.id]}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mobile search + list */}
      <div className="mobile-content">
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '36px' }}
            placeholder="Search…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {activeTag && (
          <button onClick={() => setActiveTag(null)} className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 10px', marginBottom: '10px' }}>
            #{activeTag} ✕
          </button>
        )}

        {filteredItems.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '80px' }}>
            {filteredItems.map(item => (
              <VaultItemCard key={item.id} item={item} onEdit={onEditItem} onToggleFavorite={onToggleFavorite} />
            ))}
          </div>
        ) : <EmptyState />}
      </div>

      {/* Mobile FAB */}
      <button onClick={onAddNew} className="mobile-fab" title="Add New Item">
        <Plus size={22} color="#000" />
      </button>
    </div>
  );
};
