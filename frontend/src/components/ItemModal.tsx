import React, { useState, useEffect } from 'react';
import {
  X,
  KeyRound,
  FileText,
  Terminal,
  Wallet,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  Star,
  Tag,
  Plus,
  Trash2,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { ItemType, DecryptedPayload, VaultItem } from '../types/vault.js';
import { checkPasswordBreach } from '../crypto/hibp.js';
import { GeneratorTab } from './PasswordGeneratorModal.js';
import { generateColdWallet } from '../crypto/coldWalletGenerator.js';

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: { id?: string; itemType: ItemType; payload: DecryptedPayload }) => Promise<void>;
  onSoftDelete?: (id: string) => Promise<void>;
  onPermanentDelete?: (id: string) => Promise<void>;
  onRestore?: (item: VaultItem) => Promise<void>;
  initialItem?: VaultItem | null;
  onOpenGenerator: (onSelect: (val: string) => void, mode?: GeneratorTab) => void;
}

const PRESET_TAGS = ['Social', 'Work', 'Finance', 'Personal', 'Dev', 'API', 'Server', 'Cloud', 'Crypto'];
const PRESET_ENVIRONMENTS = ['Production', 'Staging', 'Development', 'Test'];
const PRESET_CRYPTO_NETWORKS = [
  { id: 'Ethereum', symbol: 'ETH', color: '#627EEA' },
  { id: 'Bitcoin', symbol: 'BTC', color: '#F7931A' },
  { id: 'Solana', symbol: 'SOL', color: '#14F195' },
  { id: 'Polygon', symbol: 'MATIC', color: '#8247E5' },
  { id: 'BNB Chain', symbol: 'BNB', color: '#F3BA2F' },
  { id: 'Multi-Chain', symbol: 'MULTI', color: '#9333EA' },
  { id: 'Other', symbol: 'OTHER', color: '#A1A1AA' },
];

const EMPTY_FORM = {
  name: '',
  username: '',
  password: '',
  url: '',
  notes: '',
  totpSecret: '',
  secretValue: '',
  environment: 'Production',
  walletAddress: '',
  seedPhrase: '',
  privateKey: '',
  network: 'Ethereum',
  derivationPath: '',
  favorite: false,
  tags: [] as string[],
};

export const ItemModal: React.FC<ItemModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onSoftDelete,
  onPermanentDelete,
  onRestore,
  initialItem,
  onOpenGenerator,
}) => {
  const [itemType, setItemType] = useState<ItemType>('login');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [breachCount, setBreachCount] = useState<number | null>(null);
  const [customTagInput, setCustomTagInput] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const isItemDeleted = !!initialItem?.decrypted?.deletedAt;

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
        secretValue: d.secretValue || '',
        environment: d.environment || 'Production',
        walletAddress: d.walletAddress || '',
        seedPhrase: d.seedPhrase || '',
        privateKey: d.privateKey || '',
        network: d.network || 'Ethereum',
        derivationPath: d.derivationPath || '',
        favorite: !!d.favorite,
        tags: Array.isArray(d.tags) ? d.tags : [],
      });
    } else {
      setItemType('login');
      setForm(EMPTY_FORM);
    }
    setBreachCount(null);
    setShowPassword(false);
    setShowSecret(false);
    setShowSeedPhrase(false);
    setShowPrivateKey(false);
    setCustomTagInput('');
    setCopiedSecret(false);
    setCopiedAddress(false);
    setCopiedSeed(false);
    setCopiedKey(false);
  }, [initialItem, isOpen]);

  if (!isOpen) return null;

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const toggleTag = (tag: string) => {
    setForm(prev => {
      const exists = prev.tags.includes(tag);
      return {
        ...prev,
        tags: exists ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag],
      };
    });
  };

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

  const handleCopySecret = () => {
    if (!form.secretValue) return;
    navigator.clipboard.writeText(form.secretValue);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload: DecryptedPayload = {
        name: form.name.trim(),
        notes: form.notes,
        favorite: form.favorite,
        tags: form.tags,
        ...(itemType === 'login' && {
          username: form.username,
          password: form.password,
          url: form.url,
          totpSecret: form.totpSecret,
        }),
        ...(itemType === 'secret' && {
          secretValue: form.secretValue,
          environment: form.environment,
          url: form.url,
        }),
        ...(itemType === 'wallet' && {
          walletAddress: form.walletAddress,
          seedPhrase: form.seedPhrase,
          privateKey: form.privateKey,
          network: form.network,
          derivationPath: form.derivationPath,
          url: form.url,
        }),
        ...(initialItem?.decrypted?.deletedAt ? { deletedAt: initialItem.decrypted.deletedAt } : {}),
      };
      await onSave({ id: initialItem?.id, itemType, payload });
      onClose();
    } catch (err) {
      console.error('Failed to save vault item:', err);
    } finally {
      setSaving(false);
    }
  };

  // Soft delete (Move to Trash)
  const handleSoftDelete = async () => {
    if (!initialItem || !onSoftDelete) return;
    await onSoftDelete(initialItem.id);
    onClose();
  };

  // Restore from Trash
  const handleRestore = async () => {
    if (!initialItem || !onRestore) return;
    await onRestore(initialItem);
    onClose();
  };

  // Permanent Delete
  const handlePermanentDelete = async () => {
    if (!initialItem || !onPermanentDelete) return;
    if (!confirm(`Permanently delete "${form.name}"? This cannot be undone.`)) return;
    await onPermanentDelete(initialItem.id);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '540px',
          padding: '24px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
              {initialItem ? (isItemDeleted ? 'Item in Trash' : 'Edit Item') : 'New Item'}
            </h2>
            {initialItem && (
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.08)',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                {itemType === 'login' ? 'Login' : itemType === 'secret' ? 'API Key / Secret' : itemType === 'wallet' ? 'Crypto Wallet' : 'Note'}
              </span>
            )}
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Trash Banner if in trash */}
        {isItemDeleted && (
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-rose)', fontSize: '0.85rem' }}>
              <AlertTriangle size={16} />
              <span>This item is currently in Trash</span>
            </div>
            {onRestore && (
              <button
                type="button"
                onClick={handleRestore}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.78rem', minHeight: 'auto', gap: '5px' }}
              >
                <RotateCcw size={13} /> Restore
              </button>
            )}
          </div>
        )}

        {/* Item type selector (for new items) */}
        {!initialItem && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '20px' }}>
            <button
              type="button"
              onClick={() => setItemType('login')}
              className={`btn ${itemType === 'login' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '8px 4px', gap: '4px' }}
            >
              <KeyRound size={14} /> Login
            </button>
            <button
              type="button"
              onClick={() => setItemType('wallet')}
              className={`btn ${itemType === 'wallet' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '8px 4px', gap: '4px' }}
            >
              <Wallet size={14} /> Wallet
            </button>
            <button
              type="button"
              onClick={() => setItemType('secret')}
              className={`btn ${itemType === 'secret' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '8px 4px', gap: '4px' }}
            >
              <Terminal size={14} /> API Key
            </button>
            <button
              type="button"
              onClick={() => setItemType('note')}
              className={`btn ${itemType === 'note' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '8px 4px', gap: '4px' }}
            >
              <FileText size={14} /> Note
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Title field */}
          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="input-label">Title *</label>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, favorite: !p.favorite }))}
                className="btn btn-ghost"
                style={{ padding: '2px 6px', color: form.favorite ? 'var(--accent-amber)' : 'var(--text-dim)' }}
                title="Star / Favorite"
              >
                <Star size={16} fill={form.favorite ? 'var(--accent-amber)' : 'none'} />
              </button>
            </div>
            <input
              required
              type="text"
              className="input-field"
              placeholder={
                itemType === 'wallet'
                  ? 'e.g. Ledger Primary, DeFi MetaMask, Phantom Solana'
                  : itemType === 'secret'
                  ? 'e.g. Stripe Production Key, OpenAI API Token, AWS Secret'
                  : 'e.g. GitHub, Google, Netflix'
              }
              value={form.name}
              onChange={set('name')}
            />
          </div>

          {/* ──────────────── Crypto Wallet & Seed Phrase Fields ──────────────── */}
          {itemType === 'wallet' && (
            <>
              {/* Network selector */}
              <div className="input-group">
                <label className="input-label">Blockchain Network</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {PRESET_CRYPTO_NETWORKS.map(net => {
                    const isSelected = form.network === net.id;
                    return (
                      <button
                        key={net.id}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, network: net.id }))}
                        className="btn"
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          minHeight: '28px',
                          borderRadius: '8px',
                          background: isSelected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
                          color: isSelected ? '#000000' : 'var(--text-main)',
                          fontWeight: isSelected ? 600 : 400,
                          borderColor: isSelected ? 'transparent' : 'var(--border-color)',
                          gap: '6px',
                        }}
                      >
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: net.color }} />
                        {net.id} ({net.symbol})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Air-Gapped Cold Wallet Quick Actions */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await generateColdWallet({ network: form.network as any });
                    setForm(p => ({
                      ...p,
                      name: p.name || `${p.network} Cold Wallet`,
                      walletAddress: res.walletAddress,
                      seedPhrase: res.mnemonic,
                      privateKey: res.privateKey,
                      derivationPath: res.derivationPath,
                    }));
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '7px 10px', fontSize: '0.78rem', gap: '6px' }}
                >
                  <Sparkles size={13} color="var(--accent-amber)" /> Generate Air-Gapped Wallet
                </button>
                <button
                  type="button"
                  onClick={() => onOpenGenerator((val) => setForm(p => ({ ...p, seedPhrase: val })), 'wallet')}
                  className="btn btn-ghost"
                  style={{ padding: '7px 10px', fontSize: '0.78rem', gap: '6px' }}
                >
                  <Wallet size={13} /> Full Generator
                </button>
              </div>

              {/* Public Address */}
              <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="input-label" style={{ margin: 0 }}>Public / Receiving Address</label>
                  {form.walletAddress && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(form.walletAddress);
                        setCopiedAddress(true);
                        setTimeout(() => setCopiedAddress(false), 2000);
                      }}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', fontSize: '0.75rem', gap: '4px' }}
                    >
                      {copiedAddress ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                      <span>{copiedAddress ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className="input-field mono"
                  placeholder="0x... or bc1... or Solana address"
                  value={form.walletAddress}
                  onChange={set('walletAddress')}
                />
              </div>

              {/* Recovery Seed Phrase */}
              <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="input-label" style={{ margin: 0 }}>Seed Phrase (12 or 24 Recovery Words)</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {form.seedPhrase && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(form.seedPhrase);
                          setCopiedSeed(true);
                          setTimeout(() => setCopiedSeed(false), 2000);
                        }}
                        className="btn btn-ghost"
                        style={{ padding: '2px 6px', fontSize: '0.75rem', gap: '4px' }}
                      >
                        {copiedSeed ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                        <span>{copiedSeed ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSeedPhrase(v => !v)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px' }}
                      title={showSeedPhrase ? 'Mask Seed Phrase' : 'Reveal Seed Phrase'}
                    >
                      {showSeedPhrase ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <textarea
                  rows={3}
                  className="input-field mono"
                  style={{
                    fontSize: '0.85rem',
                    letterSpacing: showSeedPhrase ? '0' : '2px',
                    lineHeight: 1.6,
                    resize: 'vertical',
                    background: 'rgba(15, 23, 42, 0.95)',
                  }}
                  placeholder="Enter 12, 18, or 24 recovery words separated by spaces…"
                  value={form.seedPhrase}
                  onChange={set('seedPhrase')}
                />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '4px 0 0' }}>
                  Client-side encrypted with AES-256-GCM. Never transmitted in plaintext.
                </p>
              </div>

              {/* Private Key */}
              <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="input-label" style={{ margin: 0 }}>Private Key (Optional)</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {form.privateKey && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(form.privateKey);
                          setCopiedKey(true);
                          setTimeout(() => setCopiedKey(false), 2000);
                        }}
                        className="btn btn-ghost"
                        style={{ padding: '2px 6px', fontSize: '0.75rem', gap: '4px' }}
                      >
                        {copiedKey ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                        <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPrivateKey(v => !v)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px' }}
                      title={showPrivateKey ? 'Mask Private Key' : 'Reveal Private Key'}
                    >
                      {showPrivateKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <input
                  type={showPrivateKey ? 'text' : 'password'}
                  className="input-field mono"
                  placeholder="0x... or Base58 raw private key"
                  value={form.privateKey}
                  onChange={set('privateKey')}
                />
              </div>

              {/* Derivation Path & Explorer URL */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label">Derivation Path</label>
                  <input
                    type="text"
                    className="input-field mono"
                    placeholder="m/44'/60'/0'/0/0"
                    value={form.derivationPath}
                    onChange={set('derivationPath')}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label">Explorer / DApp URL</label>
                  <input
                    type="text"
                    inputMode="url"
                    className="input-field"
                    placeholder="https://etherscan.io"
                    value={form.url}
                    onChange={set('url')}
                  />
                </div>
              </div>
            </>
          )}

          {/* ──────────────── Developer Secret & API Key Fields ──────────────── */}
          {itemType === 'secret' && (
            <>
              {/* Environment selector */}
              <div className="input-group">
                <label className="input-label">Environment</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {PRESET_ENVIRONMENTS.map(env => {
                    const isSelected = form.environment === env;
                    return (
                      <button
                        key={env}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, environment: env }))}
                        className="btn"
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          minHeight: '28px',
                          borderRadius: '8px',
                          background: isSelected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
                          color: isSelected ? '#000000' : 'var(--text-main)',
                          fontWeight: isSelected ? 600 : 400,
                          borderColor: isSelected ? 'transparent' : 'var(--border-color)',
                        }}
                      >
                        {env}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Secret Value field */}
              <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="input-label" style={{ margin: 0 }}>API Key / Secret Token *</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {form.secretValue && (
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        className="btn btn-ghost"
                        style={{ padding: '2px 6px', fontSize: '0.75rem', gap: '4px' }}
                      >
                        {copiedSecret ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                        <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSecret(v => !v)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px' }}
                      title={showSecret ? 'Mask Secret' : 'Reveal Secret'}
                    >
                      {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenGenerator(newPass => setForm(p => ({ ...p, secretValue: newPass })))}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', color: 'var(--accent-primary)' }}
                      title="Generate random secret/token"
                    >
                      <Sparkles size={15} />
                    </button>
                  </div>
                </div>

                <textarea
                  rows={4}
                  className="input-field mono"
                  style={{
                    fontSize: '0.85rem',
                    letterSpacing: showSecret ? '0' : '2px',
                    wordBreak: 'break-all',
                    resize: 'vertical',
                    background: 'rgba(15, 23, 42, 0.95)',
                  }}
                  placeholder="Paste your API key, private key, token, or connection string…"
                  value={form.secretValue}
                  onChange={set('secretValue')}
                  required
                />
              </div>

              {/* Service / Endpoint URL */}
              <div className="input-group">
                <label className="input-label">Service / Endpoint URL (Optional)</label>
                <input
                  type="text"
                  inputMode="url"
                  className="input-field"
                  placeholder="https://api.openai.com or https://aws.amazon.com"
                  value={form.url}
                  onChange={set('url')}
                />
              </div>
            </>
          )}

          {/* ──────────────── Login Specific Fields ──────────────── */}
          {itemType === 'login' && (
            <>
              <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="input-label" style={{ margin: 0 }}>Username / Email</label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '2px 6px', fontSize: '0.75rem', gap: '4px', color: 'var(--accent-primary)' }}
                    onClick={() => onOpenGenerator((newVal) => setForm(p => ({ ...p, username: newVal })), 'username')}
                    title="Generate username handle or email alias"
                  >
                    <Sparkles size={13} />
                    <span>Generate</span>
                  </button>
                </div>
                <input
                  type="text"
                  className="input-field"
                  placeholder="you@example.com or username"
                  value={form.username}
                  onChange={set('username')}
                />
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
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '6px' }}
                      onClick={() => setShowPassword(v => !v)}
                      title={showPassword ? 'Hide' : 'Show'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '6px', color: 'var(--accent-primary)' }}
                      onClick={() => onOpenGenerator((newPass) => setForm(p => ({ ...p, password: newPass })), 'password')}
                      title="Generate password"
                    >
                      <Sparkles size={16} />
                    </button>
                  </div>
                </div>

                {form.password && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                      onClick={handleCheckBreach}
                    >
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
                <input
                  type="text"
                  inputMode="url"
                  className="input-field"
                  placeholder="https://github.com"
                  value={form.url}
                  onChange={set('url')}
                />
              </div>

              {/* TOTP 2FA secret */}
              <div className="input-group">
                <label className="input-label">2FA Secret Key (TOTP)</label>
                <input
                  type="text"
                  className="input-field mono"
                  placeholder="JBSWY3DPEHPK3PXP"
                  value={form.totpSecret}
                  onChange={e => setForm(p => ({ ...p, totpSecret: e.target.value.toUpperCase() }))}
                />
              </div>
            </>
          )}

          {/* ──────────────── Category Tags ──────────────── */}
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Tag size={13} /> Tags & Categories
            </label>
            
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

            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                className="input-field"
                style={{ padding: '8px 12px', fontSize: '0.825rem' }}
                placeholder="Add custom tag (e.g. Production, Stripe, Database)"
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

          {/* Notes */}
          <div className="input-group">
            <label className="input-label">Notes</label>
            <textarea
              rows={3}
              className="input-field"
              style={{ resize: 'vertical' }}
              placeholder={
                itemType === 'secret'
                  ? 'Key scopes, rotation policy, owner, permissions…'
                  : 'Additional encrypted notes…'
              }
              value={form.notes}
              onChange={set('notes')}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', gap: '12px' }}>
            {initialItem ? (
              isItemDeleted ? (
                /* Item is in Trash */
                <div style={{ display: 'flex', gap: '8px' }}>
                  {onRestore && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleRestore}
                      style={{ fontSize: '0.825rem', padding: '6px 12px' }}
                    >
                      <RotateCcw size={14} /> Restore
                    </button>
                  )}
                  {onPermanentDelete && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handlePermanentDelete}
                      style={{ fontSize: '0.825rem', padding: '6px 12px' }}
                    >
                      <Trash2 size={14} /> Delete Permanently
                    </button>
                  )}
                </div>
              ) : (
                /* Active item -> Move to Trash */
                onSoftDelete ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleSoftDelete}
                    style={{ fontSize: '0.825rem', padding: '6px 12px' }}
                    title="Move to Trash"
                  >
                    <Trash2 size={14} /> Move to Trash
                  </button>
                ) : <div />
              )
            ) : (
              <div />
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
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
