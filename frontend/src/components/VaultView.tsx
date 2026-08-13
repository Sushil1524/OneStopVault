import React, { useState } from 'react';
import { Search, Plus, KeyRound, FileText, Star, ShieldCheck, Filter, Tag } from 'lucide-react';
import { VaultItem } from '../types/vault.js';
import { VaultItemCard } from './VaultItemCard.js';

interface VaultViewProps {
  items: VaultItem[];
  onAddNew: () => void;
  onEditItem: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void;
}

// Sidebar category definitions
const CATEGORIES = [
  { id: 'all',       label: 'All Items',     icon: <Filter size={16} />,   color: 'var(--accent-primary)' },
  { id: 'favorites', label: 'Favorites',     icon: <Star size={16} color="var(--accent-amber)" />, color: 'var(--accent-amber)' },
  { id: 'login',     label: 'Logins',        icon: <KeyRound size={16} />, color: 'var(--accent-primary)' },
  { id: 'note',      label: 'Secure Notes',  icon: <FileText size={16} />, color: 'var(--accent-primary)' },
];

export const VaultView: React.FC<VaultViewProps> = ({ items, onAddNew, onEditItem, onToggleFavorite }) => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Collect all unique tags from items
  const allTags = Array.from(
    new Set(items.flatMap(item => item.decrypted?.tags || []))
  ).sort();

  // Apply category + tag + search filters
  const filteredItems = items.filter(item => {
    const d = item.decrypted;

    // Category filter
    if (activeCategory === 'favorites' && !d?.favorite) return false;
    if (activeCategory === 'login' && item.itemType !== 'login') return false;
    if (activeCategory === 'note' && item.itemType !== 'note') return false;

    // Active Tag filter
    if (activeTag && (!d?.tags || !d.tags.includes(activeTag))) return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const tagMatch = d?.tags?.some(t => t.toLowerCase().includes(q));
      return (
        d?.name?.toLowerCase().includes(q) ||
        d?.username?.toLowerCase().includes(q) ||
        d?.url?.toLowerCase().includes(q) ||
        d?.notes?.toLowerCase().includes(q) ||
        tagMatch
      );
    }

    return true;
  });

  // Count items per category for sidebar badges
  const counts = {
    all:       items.length,
    favorites: items.filter(i => i.decrypted?.favorite).length,
    login:     items.filter(i => i.itemType === 'login').length,
    note:      items.filter(i => i.itemType === 'note').length,
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', flex: 1, width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px' }}>

        {/* ── Left Sidebar ──────────────────────────────────── */}
        <aside className="glass-panel" style={{ padding: '16px', height: 'fit-content' }}>
          <div style={{ paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
            <button onClick={onAddNew} className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
              <Plus size={18} /> New Item
            </button>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat.id && !activeTag;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setActiveTag(null);
                  }}
                  className={`btn ${isActive ? 'btn-secondary' : 'btn-ghost'}`}
                  style={{
                    justifyContent: 'space-between',
                    background: isActive ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    borderColor: isActive ? cat.color : 'transparent',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {cat.icon} {cat.label}
                  </span>
                  <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    {counts[cat.id as keyof typeof counts]}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Tags Sidebar Section */}
          {allTags.length > 0 && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Tag size={12} /> TAGS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {allTags.map(tag => {
                  const isSelected = activeTag === tag;
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        setActiveTag(isSelected ? null : tag);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        border: isSelected ? '1px solid #ffffff' : '1px solid var(--border-color)',
                        background: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.05)',
                        color: isSelected ? '#000000' : 'var(--text-muted)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* ── Main Content ──────────────────────────────────── */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Search bar & Tag filter badge */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                type="text"
                className="input-field"
                style={{ paddingLeft: '42px' }}
                placeholder="Search by name, username, URL, or #tag…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {activeTag && (
              <button
                onClick={() => setActiveTag(null)}
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '10px 14px' }}
              >
                Tag: #{activeTag} ✕
              </button>
            )}
          </div>

          {/* Item grid or empty state */}
          {filteredItems.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {filteredItems.map(item => (
                <VaultItemCard key={item.id} item={item} onEdit={onEditItem} onToggleFavorite={onToggleFavorite} />
              ))}
            </div>
          ) : (
            <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <ShieldCheck size={48} color="var(--accent-primary)" style={{ marginBottom: '16px', opacity: 0.7 }} />
              <h3 style={{ marginBottom: '8px' }}>
                {searchQuery || activeTag ? 'No items match your filter' : 'Your vault is empty'}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                {searchQuery || activeTag ? 'Try clearing search or tag filters.' : 'Add your first login or secure note to get started.'}
              </p>
              {!searchQuery && !activeTag && (
                <button onClick={onAddNew} className="btn btn-primary">
                  <Plus size={16} /> Add Your First Item
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
