import React, { useState } from 'react';
import { X, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw, Lock } from 'lucide-react';
import { VaultItem, BreachAuditResult } from '../types/vault.js';
import { checkPasswordBreach } from '../crypto/hibp.js';

interface BreachCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: VaultItem[];
}

export const BreachCheckModal: React.FC<BreachCheckModalProps> = ({ isOpen, onClose, items }) => {
  const [auditing, setAuditing] = useState<boolean>(false);
  const [results, setResults] = useState<BreachAuditResult[] | null>(null);

  if (!isOpen) return null;

  const runAudit = async () => {
    setAuditing(true);
    const auditResults: BreachAuditResult[] = [];

    for (const item of items) {
      if (item.decrypted && item.decrypted.password) {
        const breachInfo = await checkPasswordBreach(item.decrypted.password);
        auditResults.push({
          itemId: item.id,
          name: item.decrypted.name || 'Unnamed Item',
          username: item.decrypted.username,
          isBreached: breachInfo.isBreached,
          breachCount: breachInfo.breachCount,
        });
      }
    }

    setResults(auditResults);
    setAuditing(false);
  };

  const breachedCount = results ? results.filter(r => r.isBreached).length : 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '560px',
          padding: '24px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={24} color="var(--accent-amber)" />
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Password Breach Auditor</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px' }}>
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Uses <strong style={{ color: '#fff' }}>k-Anonymity</strong> via HaveIBeenPwned. Only the first 5 characters of a SHA-1 hash leave your browser. Your raw passwords and full hashes are <strong style={{ color: 'var(--accent-emerald)' }}>never transmitted</strong>.
        </p>

        {!results && !auditing && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <Lock size={40} color="var(--accent-primary)" style={{ marginBottom: '12px', opacity: 0.8 }} />
            <p style={{ fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '20px' }}>
              Ready to scan {items.length} vault items against 840+ million leaked credentials.
            </p>
            <button onClick={runAudit} className="btn btn-primary" style={{ padding: '12px 24px' }}>
              Start Privacy-Safe Audit
            </button>
          </div>
        )}

        {auditing && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <RefreshCw size={36} className="animate-spin" color="var(--accent-primary)" style={{ marginBottom: '12px' }} />
            <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>Scanning vault passwords anonymously...</p>
          </div>
        )}

        {results && !auditing && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: breachedCount > 0 ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                border: `1px solid ${breachedCount > 0 ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {breachedCount > 0 ? (
                  <AlertTriangle size={20} color="var(--accent-rose)" />
                ) : (
                  <CheckCircle2 size={20} color="var(--accent-emerald)" />
                )}
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  {breachedCount > 0
                    ? `Found ${breachedCount} compromised password(s)`
                    : 'All vault passwords are clean & unbreached!'}
                </span>
              </div>
              <button onClick={runAudit} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>
                Rescan
              </button>
            </div>

            {results.map((r) => (
              <div
                key={r.itemId}
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{r.name}</div>
                  {r.username && <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{r.username}</div>}
                </div>

                <div>
                  {r.isBreached ? (
                    <span className="badge badge-danger">
                      Leaked {r.breachCount.toLocaleString()} times
                    </span>
                  ) : (
                    <span className="badge badge-success">Safe</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
