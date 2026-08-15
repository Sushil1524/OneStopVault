import React, { useState } from 'react';
import {
  Download, Shield, Lock, KeyRound, Clock, Layers,
  Eye, EyeOff, CheckCircle2, AlertCircle, X,
  ChevronRight, AlertTriangle, FileJson, FileText, Globe
} from 'lucide-react';
import { VaultItem } from '../types/vault.js';
import { runExport, ExportFormat, ExportContent, EXPORT_FORMATS } from '../crypto/exporter.js';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: VaultItem[];
}

const FORMAT_ICONS: Record<ExportFormat, React.ReactNode> = {
  osvault:      <Shield size={18} />,
  csv:          <Globe size={18} />,
  bitwarden:    <FileJson size={18} />,
  aegis:        <Clock size={18} />,
  'aegis-enc':  <Clock size={18} />,
  '2fas':       <Clock size={18} />,
  '2fas-enc':   <Clock size={18} />,
  'totp-uri':   <FileText size={18} />,
};

const CONTENT_OPTIONS: { id: ExportContent; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'all',    label: 'Everything',          desc: 'Logins, notes, and TOTP secrets',     icon: <Layers size={16} />    },
  { id: 'logins', label: 'Logins & Notes only', desc: 'Passwords and notes — no TOTP',       icon: <KeyRound size={16} />  },
  { id: 'totp',   label: '2FA TOTP only',       desc: 'Authenticator secrets — no passwords', icon: <Clock size={16} />    },
];

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, items }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [format, setFormat] = useState<ExportFormat>('osvault');
  const [content, setContent] = useState<ExportContent>('all');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  if (!isOpen) return null;

  const selectedFormat = EXPORT_FORMATS.find(f => f.id === format)!;
  const needsPassword  = selectedFormat.needsPassword;
  const isUnencrypted  = !needsPassword;

  // Item counts
  const counts = {
    all:    items.filter(i => i.decrypted).length,
    logins: items.filter(i => i.decrypted && (i.itemType === 'login' || i.itemType === 'note')).length,
    totp:   items.filter(i => i.decrypted?.totpSecret).length,
  };

  const handleExport = async () => {
    setError(null);
    if (needsPassword) {
      if (!password)           { setError('Enter an export password.'); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
      if (password !== confirmPw) { setError('Passwords do not match.'); return; }
    }
    setLoading(true);
    try {
      const n = await runExport(items, format, content, password);
      setDone(n);
    } catch (e: any) {
      setError(e.message || 'Export failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1); setFormat('osvault'); setContent('all');
    setPassword(''); setConfirmPw(''); setShowPw(false);
    setError(null); setDone(null);
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '520px', padding: '22px', position: 'relative', maxHeight: '92vh', overflowY: 'auto' }}>

        {/* Close */}
        <button onClick={handleClose} className="btn btn-ghost" style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px', minHeight: 'auto' }}>
          <X size={17} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Download size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700 }}>Export Vault</h2>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: 0 }}>All exports happen in your browser · nothing sent to server</p>
          </div>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
          {[1, 2].map(s => (
            <div key={s} style={{ height: '3px', flex: 1, borderRadius: '2px', background: step >= s ? '#ffffff' : 'rgba(255,255,255,0.15)', transition: 'background 0.2s ease' }} />
          ))}
        </div>

        {/* ── SUCCESS ── */}
        {done !== null ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle2 size={46} color="var(--accent-emerald)" style={{ marginBottom: '12px' }} />
            <h3 style={{ marginBottom: '6px' }}>Export Complete!</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              <strong>{done}</strong> items exported as <code style={{ color: 'var(--accent-primary)' }}>{selectedFormat.ext}</code>
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '20px' }}>
              {needsPassword ? 'Keep your export password safe — without it the file is unreadable.' : 'This file contains unencrypted data. Store it securely.'}
            </p>
            <button onClick={handleClose} className="btn btn-primary" style={{ padding: '10px 28px' }}>Done</button>
          </div>
        ) : step === 1 ? (
          <>
            {/* ── STEP 1: Format picker ── */}
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
              Choose export format
            </p>

            {/* Password managers */}
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '6px', marginTop: '4px' }}>Password managers</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
              {EXPORT_FORMATS.filter(f => f.contentType !== 'totp').map(f => (
                <FormatButton key={f.id} f={f} selected={format === f.id} onSelect={() => setFormat(f.id)} />
              ))}
            </div>

            {/* TOTP authenticators */}
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '6px' }}>2FA authenticator apps · Plaintext</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {EXPORT_FORMATS.filter(f => f.contentType === 'totp' && !f.encrypted).map(f => (
                <FormatButton key={f.id} f={f} selected={format === f.id} onSelect={() => setFormat(f.id)} />
              ))}
            </div>

            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '6px' }}>2FA authenticator apps · Encrypted with password</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {EXPORT_FORMATS.filter(f => f.contentType === 'totp' && f.encrypted).map(f => (
                <FormatButton key={f.id} f={f} selected={format === f.id} onSelect={() => setFormat(f.id)} />
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px', marginTop: '18px', fontSize: '0.9rem' }}
            >
              Continue <ChevronRight size={16} />
            </button>
          </>
        ) : (
          <>
            {/* ── STEP 2: Content + password + export ── */}
            <button onClick={() => { setStep(1); setError(null); }} className="btn btn-ghost" style={{ padding: '4px 0', fontSize: '0.8rem', minHeight: 'auto', marginBottom: '14px', gap: '4px', color: 'var(--text-muted)' }}>
              ← Back
            </button>

            {/* Selected format badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <span style={{ color: 'var(--text-muted)' }}>{FORMAT_ICONS[format]}</span>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{selectedFormat.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{selectedFormat.targetApps} · {selectedFormat.ext}</div>
              </div>
            </div>

            {/* Unencrypted warning */}
            {isUnencrypted && (
              <div style={{ display: 'flex', gap: '9px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', marginBottom: '14px' }}>
                <AlertTriangle size={15} color="var(--accent-amber)" style={{ flexShrink: 0, marginTop: '1px' }} />
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  This format exports <strong>unencrypted</strong> plaintext. Store the file securely and delete it after importing.
                </p>
              </div>
            )}

            {/* Content type selector — only show if format supports choosing */}
            {selectedFormat.contentType === 'both' && (
              <div style={{ marginBottom: '14px' }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>What to include</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {CONTENT_OPTIONS.map(opt => {
                    const cnt = counts[opt.id];
                    const active = content === opt.id;
                    return (
                      <button key={opt.id} onClick={() => setContent(opt.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', border: active ? '1px solid #fff' : '1px solid var(--border-color)', background: active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s' }}>
                        <span style={{ color: active ? '#fff' : 'var(--text-dim)', flexShrink: 0 }}>{opt.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: active ? '#fff' : 'var(--text-main)' }}>{opt.label}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{opt.desc}</div>
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: '7px', background: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)', color: active ? '#fff' : 'var(--text-dim)', flexShrink: 0 }}>
                          {cnt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Export password (only for osvault) */}
            {needsPassword && (
              <div style={{ marginBottom: '14px' }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Lock size={12} /> Export Password
                </p>
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <input type={showPw ? 'text' : 'password'} className="input-field mono" placeholder="Create a strong export password…" value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight: '42px' }} />
                  <button onClick={() => setShowPw(v => !v)} className="btn btn-ghost" style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', padding: '3px', minHeight: 'auto' }}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <input type={showPw ? 'text' : 'password'} className="input-field mono" placeholder="Confirm password…" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Used only for this export file — not your vault master password.</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '9px', background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--accent-rose)', fontSize: '0.82rem', marginBottom: '12px' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Export button */}
            <button onClick={handleExport} disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '0.9rem' }}>
              {loading ? 'Generating export file…' : <><Download size={15} /> Export as {selectedFormat.ext}</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ── Sub-component: Format selection button ────────────────────────────────────
const FormatButton: React.FC<{
  f: typeof EXPORT_FORMATS[number];
  selected: boolean;
  onSelect: () => void;
}> = ({ f, selected, onSelect }) => (
  <button
    onClick={onSelect}
    style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 12px', borderRadius: '11px',
      border: selected ? '1px solid #ffffff' : '1px solid var(--border-color)',
      background: selected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
      cursor: 'pointer', textAlign: 'left', width: '100%',
      transition: 'all 0.15s ease',
    }}
  >
    <span style={{ color: selected ? '#fff' : 'var(--text-dim)', flexShrink: 0 }}>
      {FORMAT_ICONS[f.id]}
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: selected ? '#fff' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {f.label}
        {f.needsPassword && (
          <span style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: '5px', background: 'rgba(16,185,129,0.15)', color: 'var(--accent-emerald)', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 700 }}>
            ENCRYPTED
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {f.targetApps}
      </div>
    </div>
    <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', flexShrink: 0, fontFamily: 'monospace' }}>{f.ext}</span>
  </button>
);
