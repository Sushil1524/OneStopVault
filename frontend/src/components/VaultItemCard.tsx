import React, { useState, useEffect } from 'react';
import { KeyRound, FileText, Copy, Check, Eye, EyeOff, Star, ExternalLink, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { VaultItem } from '../types/vault.js';
import { generateTOTP } from '../crypto/totp.js';

interface VaultItemCardProps {
  item: VaultItem;
  onEdit: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void;
}

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

function useCopyButton() {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return { copied, copy };
}

export const VaultItemCard: React.FC<VaultItemCardProps> = ({ item, onEdit, onToggleFavorite }) => {
  const payload = item.decrypted ?? { name: 'Encrypted Item' };
  const [expanded, setExpanded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const userCopy = useCopyButton();
  const passCopy = useCopyButton();
  const totpCopy = useCopyButton();

  const [totpCode, setTotpCode] = useState('');
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
  const safeUrl = payload.url
    ? (payload.url.startsWith('http') ? payload.url : `https://${payload.url}`)
    : null;

  const hostname = safeUrl ? (() => { try { return new URL(safeUrl).hostname; } catch { return payload.url; } })() : null;

  return (
    <div
      className="vault-card"
      style={{
        background: 'rgba(18,18,20,0.9)',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
        overflow: 'hidden',
        transition: 'border-color 0.2s ease',
      }}
    >
      {/* ── Card Row (always visible) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 14px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Icon */}
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          {faviconUrl ? (
            <img
              src={faviconUrl}
              alt=""
              width={26}
              height={26}
              style={{ objectFit: 'contain' }}
              onError={e => {
                const el = e.target as HTMLImageElement;
                el.style.display = 'none';
                el.parentElement!.innerHTML = item.itemType === 'login'
                  ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`
                  : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
              }}
            />
          ) : (
            item.itemType === 'login' ? <KeyRound size={18} color="var(--text-muted)" /> : <FileText size={18} color="var(--text-muted)" />
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {payload.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {payload.username || hostname || (item.itemType === 'note' ? 'Secure Note' : '—')}
          </div>
        </div>

        {/* Right side: badges + expand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {payload.totpSecret && (
            <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', color: 'var(--accent-emerald)', border: '1px solid rgba(16,185,129,0.3)' }}>
              2FA
            </span>
          )}
          {payload.favorite && <Star size={13} fill="var(--accent-amber)" color="var(--accent-amber)" />}
          <div style={{ color: 'var(--text-dim)' }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-color)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Login fields */}
          {item.itemType === 'login' && (
            <>
              {payload.username && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0 }}>Username</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span style={{ fontSize: '0.825rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payload.username}</span>
                    <button onClick={() => userCopy.copy(payload.username!)} className="btn btn-ghost" style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}>
                      {userCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}

              {payload.password && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0 }}>Password</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="mono" style={{ fontSize: '0.825rem', letterSpacing: showPassword ? '0' : '2px' }}>
                      {showPassword ? payload.password : '•••••••••'}
                    </span>
                    <button onClick={() => setShowPassword(v => !v)} className="btn btn-ghost" style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}>
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button onClick={() => passCopy.copy(payload.password!)} className="btn btn-ghost" style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}>
                      {passCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}

              {safeUrl && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0 }}>URL</span>
                  <a href={safeUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {hostname} <ExternalLink size={11} />
                  </a>
                </div>
              )}

              {payload.totpSecret && (
                <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={14} color="var(--accent-emerald)" />
                    <span className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-emerald)', letterSpacing: '2px' }}>
                      {totpCode}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{totpSeconds}s</span>
                    <button onClick={() => totpCopy.copy(totpCode)} className="btn btn-ghost" style={{ padding: '2px 4px', minHeight: 'auto' }}>
                      {totpCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Note content */}
          {item.itemType === 'note' && payload.notes && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
              {payload.notes}
            </p>
          )}

          {/* Tags */}
          {payload.tags && payload.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {payload.tags.map(tag => (
                <span key={tag} style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: '8px', background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid var(--border-color)' }}>
            <button
              onClick={() => onToggleFavorite(item)}
              className="btn btn-ghost"
              style={{ padding: '4px 8px', fontSize: '0.78rem', gap: '5px', minHeight: 'auto', color: payload.favorite ? 'var(--accent-amber)' : 'var(--text-dim)' }}
            >
              <Star size={13} fill={payload.favorite ? 'var(--accent-amber)' : 'none'} />
              {payload.favorite ? 'Starred' : 'Star'}
            </button>
            <button onClick={() => onEdit(item)} className="btn btn-secondary" style={{ padding: '5px 14px', fontSize: '0.82rem', minHeight: 'auto' }}>
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
