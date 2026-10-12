import React, { useState } from 'react';
import { Shield, KeyRound, Lock, ShieldAlert, Upload, Download, Menu, X, RefreshCw, Fingerprint } from 'lucide-react';
import { SyncStatusBadge } from './SyncStatusBadge.js';
import { SyncState } from '../types/vault.js';

interface NavbarProps {
  userEmail?: string;
  syncState: SyncState;
  onLock: () => void;
  onOpenGenerator: () => void;
  onOpenBreachAudit: () => void;
  onOpenImport?: () => void;
  onOpenExport?: () => void;
  onOpenSecurity?: () => void;
  onManualSync: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  userEmail,
  syncState,
  onLock,
  onOpenGenerator,
  onOpenBreachAudit,
  onOpenImport,
  onOpenExport,
  onOpenSecurity,
  onManualSync,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header
        style={{
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(9, 9, 11, 0.97)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '10px 16px',
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Brand / Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'var(--gradient-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Shield size={18} color="#000" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.05rem', color: 'var(--text-main)', margin: 0, lineHeight: 1.2, fontWeight: 700 }}>
                OneStop <span style={{ color: 'var(--accent-primary)' }}>Vault</span>
              </h1>
              <p className="hide-mobile" style={{ fontSize: '0.7rem', color: 'var(--text-dim)', margin: 0 }}>
                Cloudflare D1 · Web Crypto · Zero-Knowledge
              </p>
            </div>
          </div>

          {/* Desktop nav buttons */}
          <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={onOpenGenerator} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} title="Password Generator">
              <KeyRound size={14} /> Generator
            </button>
            {userEmail && (
              <>
                <SyncStatusBadge state={syncState} onManualSync={onManualSync} />
                {onOpenImport && (
                  <button onClick={onOpenImport} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                    <Upload size={14} /> Import
                  </button>
                )}
                {onOpenExport && (
                  <button onClick={onOpenExport} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                    <Download size={14} /> Export
                  </button>
                )}
                <button onClick={onOpenBreachAudit} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  <ShieldAlert size={14} color="var(--accent-amber)" /> Breach Audit
                </button>
                {onOpenSecurity && (
                  <button onClick={onOpenSecurity} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} title="Security & Quick Unlock">
                    <Fingerprint size={14} color="var(--accent-primary)" /> Security
                  </button>
                )}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{userEmail}</span>
                <button onClick={onLock} className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  <Lock size={14} /> Lock
                </button>
              </>
            )}
          </div>

          {/* Mobile: sync status + hamburger */}
          <div className="show-mobile-flex" style={{ alignItems: 'center', gap: '8px' }}>
            {userEmail && <SyncStatusBadge state={syncState} onManualSync={onManualSync} />}
            {userEmail && (
              <button
                onClick={() => setMenuOpen(v => !v)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#fff',
                }}
                aria-label="Menu"
              >
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
            {!userEmail && (
              <button onClick={onOpenGenerator} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                <KeyRound size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile Slide-down Drawer Menu ── */}
      {menuOpen && userEmail && (
        <div
          className="show-mobile-flex"
          style={{
            flexDirection: 'column',
            background: 'rgba(9, 9, 11, 0.98)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid var(--border-color)',
            padding: '12px 16px',
            gap: '8px',
            position: 'sticky',
            top: '55px',
            zIndex: 45,
          }}
        >
          {/* User email */}
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', padding: '4px 0 8px', borderBottom: '1px solid var(--border-color)' }}>
            Signed in as <strong style={{ color: 'var(--text-muted)' }}>{userEmail}</strong>
          </div>

          <button onClick={() => { onOpenGenerator(); setMenuOpen(false); }} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '0.875rem' }}>
            <KeyRound size={16} /> Password Generator
          </button>

          {onOpenImport && (
            <button onClick={() => { onOpenImport(); setMenuOpen(false); }} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '0.875rem' }}>
              <Upload size={16} /> Import Passwords
            </button>
          )}

          {onOpenExport && (
            <button onClick={() => { onOpenExport(); setMenuOpen(false); }} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '0.875rem' }}>
              <Download size={16} /> Export Passwords
            </button>
          )}

          <button onClick={() => { onOpenBreachAudit(); setMenuOpen(false); }} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '0.875rem' }}>
            <ShieldAlert size={16} color="var(--accent-amber)" /> Breach Audit
          </button>

          {onOpenSecurity && (
            <button onClick={() => { onOpenSecurity(); setMenuOpen(false); }} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '0.875rem' }}>
              <Fingerprint size={16} /> Security & Quick Unlock
            </button>
          )}

          <button onClick={() => { onManualSync(); setMenuOpen(false); }} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '0.875rem' }}>
            <RefreshCw size={16} /> Sync Now
          </button>

          <button onClick={() => { onLock(); setMenuOpen(false); }} className="btn btn-danger" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '0.875rem' }}>
            <Lock size={16} /> Lock Vault
          </button>
        </div>
      )}
    </>
  );
};
