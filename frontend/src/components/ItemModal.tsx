import React, { useState, useEffect } from 'react';
import { X, KeyRound, FileText, Eye, EyeOff, Sparkles, ShieldCheck, Star, Tag, Plus } from 'lucide-react';
import { ItemType, DecryptedPayload, VaultItem } from '../types/vault.js';
import { checkPasswordBreach } from '../crypto/hibp.js';

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: { id?: string; itemType: ItemType; payload: DecryptedPayload }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  initialItem?: VaultItem | null;
  onOpenGenerator: (onSelect: (pass: string) => void) => void;
}

const PRESET_TAGS = ['Social', 'Work', 'Finance', 'Personal', 'Shopping', 'Dev'];

// Empty form state used when adding a new item
const EMPTY_FORM = {
  name: '',
  username: '',
  password: '',
  url: '',
  notes: '',
  totpSecret: '',
  favorite: false,
  tags: [] as string[],
};

export const ItemModal: React.FC<ItemModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialItem,
  onOpenGenerator,
}) => {
  const [itemType, setItemType] = useState<ItemType>('login');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [breachCount, setBreachCount] = useState<number | null>(null);
  const [customTagInput, setCustomTagInput] = useState('');

  // When the modal opens, populate form with existing item data or reset to empty
  useEffect(() => {
    if (initialItem?.decrypted) {
      const d = initialItem.decrypted;
      setItemType(initialItem.itemType);
      setForm({
        name: d.name || '',
        username: d.username || '',
        password: d.password || '',
        url: d.url || '',
        notes: d.notes || '',
        totpSecret: d.totpSecret || '',
        favorite: !!d.favorite,
        tags: Array.isArray(d.tags) ? d.tags : [],
      });
    } else {
      setItemType('login');
      setForm(EMPTY_FORM);
    }
    setBreachCount(null);
    setShowPassword(false);
    setCustomTagInput('');
  }, [initialItem, isOpen]);

  if (!isOpen) return null;

  // Helper to update a single form field
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setForm(prev => {
      const exists = prev.tags.includes(tag);
      return {
        ...prev,
        tags: exists ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag],
      };
    });
  };

  // Add custom tag on Enter or click
  const handleAddCustomTag = () => {
    const trimmed = customTagInput.trim();
    if (!trimmed) return;
    if (!form.tags.includes(trimmed)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, trimmed] }));
    }
    setCustomTagInput('');
  };

  const handleCheckBreach = async () => {
    if (!form.password) return;
    const result = await checkPasswordBreach(form.password);
    setBreachCount(result.breachCount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload: DecryptedPayload = {
        name: form.name,
        notes: form.notes,
        favorite: form.favorite,
        tags: form.tags,
        ...(itemType === 'login' && {
          username: form.username,
          password: form.password,
          url: form.url,
          totpSecret: form.totpSecret,
        }),
      };
      await onSave({ id: initialItem?.id, itemType, payload });
      onClose();
    } catch (err) {
      console.error('Failed to save vault item:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initialItem || !onDelete) return;
    if (!confirm('Delete this vault item permanently?')) return;
    await onDelete(initialItem.id);
    onClose();
  };

  return (
    // Backdrop — click outside to close
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
        zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      {/* Modal panel */}
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel animate-fade-in"
        style={{ width: '100%', maxWidth: '520px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{initialItem ? 'Edit Item' : 'New Item'}</h2>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px' }}><X size={20} /></button>
        </div>

        {/* Item type selector */}
        {!initialItem && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button type="button" onClick={() => setItemType('login')}
              className={`btn ${itemType === 'login' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}>
              <KeyRound size={16} /> Login
            </button>
            <button type="button" onClick={() => setItemType('note')}
              className={`btn ${itemType === 'note' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}>
              <FileText size={16} /> Secure Note
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Title field */}
          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="input-label">Title *</label>
              <button type="button" onClick={() => setForm(p => ({ ...p, favorite: !p.favorite }))}
                className="btn btn-ghost" style={{ padding: '2px 6px', color: form.favorite ? 'var(--accent-amber)' : 'var(--text-dim)' }}>
                <Star size={16} fill={form.favorite ? 'var(--accent-amber)' : 'none'} />
              </button>
            </div>
            <input required type="text" className="input-field" placeholder="e.g. GitHub, Netflix, SSH Key"
              value={form.name} onChange={set('name')} />
          </div>

          {/* Category Tags Selector */}
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Tag size={13} /> Tags & Categories
            </label>
            
            {/* Tag Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {PRESET_TAGS.map(tag => {
                const isSelected = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: isSelected ? '1px solid #ffffff' : '1px solid var(--border-color)',
                      background: isSelected ? '#ffffff' : 'rgba(255,255,255,0.06)',
                      color: isSelected ? '#000000' : 'var(--text-muted)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    #{tag}
                  </button>
                );
              })}
              {form.tags.filter(t => !PRESET_TAGS.includes(t)).map(customTag => (
                <button
                  key={customTag}
                  type="button"
                  onClick={() => toggleTag(customTag)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid #ffffff',
                    background: '#ffffff',
                    color: '#000000',
                  }}
                >
                  #{customTag} ✕
                </button>
              ))}
            </div>

            {/* Custom Tag Input */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                className="input-field"
                style={{ padding: '8px 12px', fontSize: '0.825rem' }}
                placeholder="Add custom tag (e.g. Work, Gaming, Server)"
                value={customTagInput}
                onChange={e => setCustomTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={handleAddCustomTag}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {/* Login-specific fields */}
          {itemType === 'login' && (
            <>
              <div className="input-group">
                <label className="input-label">Username / Email</label>
                <input type="text" className="input-field" placeholder="you@example.com"
                  value={form.username} onChange={set('username')} />
              </div>

              {/* Password with show/hide + generator + breach check */}
              <div className="input-group">
                <label className="input-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input-field mono"
                    style={{ paddingRight: '88px' }}
                    placeholder="Enter or generate a password"
                    value={form.password}
                    onChange={e => { set('password')(e); setBreachCount(null); }}
                  />
                  <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '4px' }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: '6px' }}
                      onClick={() => setShowPassword(v => !v)} title={showPassword ? 'Hide' : 'Show'}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '6px', color: 'var(--accent-primary)' }}
                      onClick={() => onOpenGenerator(newPass => setForm(p => ({ ...p, password: newPass })))} title="Generate password">
                      <Sparkles size={16} />
                    </button>
                  </div>
                </div>

                {form.password && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                    <button type="button" className="btn btn-ghost"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                      onClick={handleCheckBreach}>
                      <ShieldCheck size={14} color="var(--accent-emerald)" /> Check for leaks
                    </button>
                    {breachCount !== null && (
                      <span className={`badge ${breachCount > 0 ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.7rem' }}>
                        {breachCount > 0 ? `Leaked ${breachCount.toLocaleString()} times` : 'Not found in any breach'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="input-group">
                <label className="input-label">Website URL</label>
                <input type="url" className="input-field" placeholder="https://github.com"
                  value={form.url} onChange={set('url')} />
              </div>

              {/* TOTP 2FA secret */}
              <div className="input-group">
                <label className="input-label">2FA Secret Key (TOTP)</label>
                <input type="text" className="input-field mono" placeholder="JBSWY3DPEHPK3PXP"
                  value={form.totpSecret} onChange={e => setForm(p => ({ ...p, totpSecret: e.target.value.toUpperCase() }))} />
              </div>
            </>
          )}

          {/* Notes */}
          <div className="input-group">
            <label className="input-label">Notes</label>
            <textarea rows={3} className="input-field" style={{ resize: 'vertical' }}
              placeholder="Additional encrypted notes…" value={form.notes} onChange={set('notes')} />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', gap: '12px' }}>
            {initialItem && onDelete
              ? <button type="button" className="btn btn-danger" onClick={handleDelete}>Delete</button>
              : <div />}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? 'Saving…' : 'Save Item'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
