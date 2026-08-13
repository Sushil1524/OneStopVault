import React, { useState, useEffect } from 'react';
import { KeyRound, FileText, Copy, Check, Eye, EyeOff, Star, ExternalLink, Clock } from 'lucide-react';
import { VaultItem } from '../types/vault.js';
import { generateTOTP } from '../crypto/totp.js';

interface VaultItemCardProps {
  item: VaultItem;
  onEdit: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void;
}

// Get a favicon image URL for any website URL
function getFaviconUrl(urlStr?: string): string | null {
  if (!urlStr) return null;
  try {
    const fullUrl = urlStr.startsWith('http') ? urlStr : `https://${urlStr}`;
    const { hostname } = new URL(fullUrl);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return null;
  }
}

// Copies text to clipboard and briefly shows a "copied" checkmark
function useCopyButton() {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    // Auto-clear clipboard indicator after 3 seconds
    setTimeout(() => setCopied(false), 3000);
  };
  return { copied, copy };
}

export const VaultItemCard: React.FC<VaultItemCardProps> = ({ item, onEdit, onToggleFavorite }) => {
  const payload = item.decrypted ?? { name: 'Encrypted Item' };

  const [showPassword, setShowPassword] = useState(false);
  const userCopy  = useCopyButton();
  const passCopy  = useCopyButton();
  const totpCopy  = useCopyButton();

  // Live TOTP code — updates every second while the card is mounted
  const [totpCode, setTotpCode]       = useState('');
  const [totpSeconds, setTotpSeconds] = useState(30);

  useEffect(() => {
    if (!payload.totpSecret) return;
    let active = true;

    const refresh = async () => {
      const { code, secondsRemaining } = await generateTOTP(payload.totpSecret!);
      if (active) { setTotpCode(code); setTotpSeconds(secondsRemaining); }
    };

    refresh();
    const timer = setInterval(refresh, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [payload.totpSecret]);

  const faviconUrl = getFaviconUrl(payload.url);

  // Normalise a URL so it always has a protocol (needed for <a href> and new URL())
  const safeUrl = payload.url
    ? (payload.url.startsWith('http') ? payload.url : `https://${payload.url}`)
    : null;

  return (
    <div className="glass-card animate-fade-in" style={{ padding: '18px', display: 'flex', flexDirection: 'column' }}>

      {/* ── Card Header: icon · name · url · star ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Favicon for login items, generic icon otherwise */}
          {faviconUrl ? (
            <img src={faviconUrl} alt="" width={28} height={28}
              style={{ borderRadius: '6px', objectFit: 'contain' }}
              onError={e => { (e.target as HTMLElement).style.display = 'none'; }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: '6px', background: 'rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}>
              {item.itemType === 'login' ? <KeyRound size={16} /> : <FileText size={16} />}
            </div>
          )}

          <div>
            {/* Clicking the title opens the edit modal */}
            <h3 onClick={() => onEdit(item)} style={{ fontSize: '1rem', fontWeight: 600, margin: 0, cursor: 'pointer' }}>
              {payload.name}
            </h3>
            {safeUrl && (
              <a href={safeUrl} target="_blank" rel="noreferrer"
                style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                {new URL(safeUrl).hostname} <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>

        {/* Favourite star toggle */}
        <button onClick={() => onToggleFavorite(item)} className="btn btn-ghost" style={{ padding: '4px', color: payload.favorite ? 'var(--accent-amber)' : 'var(--text-dim)' }}>
          <Star size={16} fill={payload.favorite ? 'var(--accent-amber)' : 'none'} />
        </button>
      </div>

      {/* ── Login fields ── */}
      {item.itemType === 'login' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '4px 0 12px' }}>
          {/* Username row */}
          {payload.username && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Username</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{payload.username}</span>
                <button onClick={() => userCopy.copy(payload.username!)} className="btn btn-ghost" style={{ padding: '2px 4px' }} title="Copy username">
                  {userCopy.copied ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* Password row */}
          {payload.password && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Password</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="mono" style={{ letterSpacing: showPassword ? 'normal' : '2px' }}>
                  {showPassword ? payload.password : '••••••••••'}
                </span>
                <button onClick={() => setShowPassword(v => !v)} className="btn btn-ghost" style={{ padding: '2px 4px' }}>
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={() => passCopy.copy(payload.password!)} className="btn btn-ghost" style={{ padding: '2px 4px' }} title="Copy password">
                  {passCopy.copied ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* Live TOTP 2FA code — only shown when a secret key is stored */}
          {payload.totpSecret && (
            <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} color="var(--accent-primary)" />
                {/* The 6-digit TOTP code, styled monospaced and bold */}
                <span className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '1px' }}>
                  {totpCode}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* Countdown shows how many seconds until the code rotates */}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{totpSeconds}s</span>
                <button onClick={() => totpCopy.copy(totpCode)} className="btn btn-ghost" style={{ padding: '2px 4px' }} title="Copy 2FA code">
                  {totpCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Secure Note preview ── */}
      {item.itemType === 'note' && payload.notes && (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0 12px', maxHeight: '60px', overflow: 'hidden' }}>
          {payload.notes}
        </p>
      )}

      {/* ── Card Footer: tags + type badge + edit button ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
        {payload.tags && payload.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {payload.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-muted)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{item.itemType}</span>
          <button onClick={() => onEdit(item)} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Edit</button>
        </div>
      </div>
    </div>
  );
};
