import React from 'react';
import { Shield, KeyRound, Lock, ShieldAlert, Upload } from 'lucide-react';
import { SyncStatusBadge } from './SyncStatusBadge.js';
import { SyncState } from '../types/vault.js';

interface NavbarProps {
  userEmail?: string;
  syncState: SyncState;
  onLock: () => void;
  onOpenGenerator: () => void;
  onOpenBreachAudit: () => void;
  onOpenImport?: () => void;
  onManualSync: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  userEmail,
  syncState,
  onLock,
  onOpenGenerator,
  onOpenBreachAudit,
  onOpenImport,
  onManualSync,
}) => {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(9, 9, 11, 0.85)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        padding: '12px 24px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'var(--gradient-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(255, 255, 255, 0.2)',
            }}
          >
            <Shield size={22} color="#000" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0, lineHeight: 1 }}>
                OneStop <span style={{ color: 'var(--accent-primary)' }}>Vault</span>
              </h1>
              <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                Zero-Knowledge
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
              Cloudflare D1 & Worker + Web Crypto
            </p>
          </div>
        </div>

        {/* Header Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Generator button is ALWAYS accessible without logging in */}
          <button
            onClick={onOpenGenerator}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            title="Open Password Generator (No login required)"
          >
            <KeyRound size={16} />
            <span>Generator</span>
          </button>

          {/* Authenticated user actions */}
          {userEmail && (
            <>
              <SyncStatusBadge state={syncState} onManualSync={onManualSync} />

              {onOpenImport && (
                <button
                  onClick={onOpenImport}
                  className="btn btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                  title="Import credentials & 2FA keys from Chrome, Bitwarden, 2FAS, Aegis"
                >
                  <Upload size={16} />
                  <span className="hide-mobile">Import</span>
                </button>
              )}

              <button
                onClick={onOpenBreachAudit}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                title="Audit Vault against HaveIBeenPwned Leaks"
              >
                <ShieldAlert size={16} color="var(--accent-amber)" />
                <span className="hide-mobile">Breach Audit</span>
              </button>

              <div
                style={{
                  height: '24px',
                  width: '1px',
                  background: 'var(--border-color)',
                  margin: '0 4px',
                }}
              />

              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }} className="hide-mobile">
                {userEmail}
              </div>

              <button
                onClick={onLock}
                className="btn btn-danger"
                style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                title="Lock Vault and purge keys from browser RAM"
              >
                <Lock size={15} />
                <span>Lock</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
