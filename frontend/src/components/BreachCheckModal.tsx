import React, { useState, useMemo } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Lock,
  ExternalLink,
  Edit,
  Clock,
  KeyRound,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import { VaultItem, BreachAuditResult } from '../types/vault.js';
import { checkPasswordBreach } from '../crypto/hibp.js';

interface BreachCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: VaultItem[];
  onEditItem?: (item: VaultItem) => void;
}

type HealthFilter = 'all' | 'reused' | 'weak' | 'no2fa' | 'stale' | 'breached';

interface FlaggedIssue {
  type: 'reused' | 'weak' | 'no2fa' | 'stale' | 'breached';
  label: string;
  severity: 'high' | 'medium' | 'low';
}

interface ItemHealthAnalysis {
  item: VaultItem;
  issues: FlaggedIssue[];
  passwordAgeDays: number;
}

export const BreachCheckModal: React.FC<BreachCheckModalProps> = ({
  isOpen,
  onClose,
  items,
  onEditItem,
}) => {
  const [activeFilter, setActiveFilter] = useState<HealthFilter>('all');
  const [auditingHibp, setAuditingHibp] = useState<boolean>(false);
  const [hibpResults, setHibpResults] = useState<Record<string, BreachAuditResult>>({});

  // 1. Vault Health Analysis (Pure local in-memory audit)
  const { analyses, counts, healthScore, grade } = useMemo(() => {
    const activeLogins = items.filter(
      (i) => i.decrypted && (i.itemType === 'login' || i.itemType === 'secret') && !i.decrypted.deletedAt
    );

    // Group passwords to identify reuse
    const passwordGroups = new Map<string, string[]>();
    activeLogins.forEach((item) => {
      const pass = item.decrypted?.password;
      if (pass) {
        const group = passwordGroups.get(pass) || [];
        group.push(item.id);
        passwordGroups.set(pass, group);
      }
    });

    const now = Date.now();
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

    let reusedCount = 0;
    let weakCount = 0;
    let no2faCount = 0;
    let staleCount = 0;
    let breachedCount = 0;

    const list: ItemHealthAnalysis[] = [];

    activeLogins.forEach((item) => {
      const d = item.decrypted!;
      const issues: FlaggedIssue[] = [];
      const pass = d.password || '';

      // Reused check
      if (pass && (passwordGroups.get(pass)?.length || 0) > 1) {
        const occurrences = passwordGroups.get(pass)!.length;
        issues.push({
          type: 'reused',
          label: `Shared across ${occurrences} accounts`,
          severity: 'high',
        });
        reusedCount++;
      }

      // Weak check (< 12 chars or low variety)
      if (item.itemType === 'login') {
        if (!pass || pass.length < 12) {
          issues.push({
            type: 'weak',
            label: pass.length === 0 ? 'Missing password' : `Weak length (${pass.length} chars, min 12 recommended)`,
            severity: pass.length < 8 ? 'high' : 'medium',
          });
          weakCount++;
        } else if (/^[a-z]+$/.test(pass) || /^[0-9]+$/.test(pass)) {
          issues.push({
            type: 'weak',
            label: 'Low complexity (single character set)',
            severity: 'medium',
          });
          weakCount++;
        }

        // 2FA / TOTP check
        if (!d.totpSecret) {
          issues.push({
            type: 'no2fa',
            label: 'No 2FA / TOTP configured',
            severity: 'low',
          });
          no2faCount++;
        }
      }

      // Stale password check (> 1 year old)
      const lastModified = item.updatedAt || item.createdAt || now;
      const ageMs = now - lastModified;
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      if (ageMs > ONE_YEAR_MS && pass) {
        issues.push({
          type: 'stale',
          label: `Unchanged for ${Math.floor(ageDays / 30)} months (> 1 year)`,
          severity: 'low',
        });
        staleCount++;
      }

      // HIBP check
      const hibp = hibpResults[item.id];
      if (hibp && hibp.isBreached) {
        issues.push({
          type: 'breached',
          label: `Pwned! Found in ${hibp.breachCount.toLocaleString()} public breaches`,
          severity: 'high',
        });
        breachedCount++;
      }

      if (issues.length > 0) {
        list.push({ item, issues, passwordAgeDays: ageDays });
      }
    });

    // Score computation (0 to 100)
    let score = 100;
    if (activeLogins.length > 0) {
      score -= Math.min(40, breachedCount * 25);
      score -= Math.min(30, reusedCount * 12);
      score -= Math.min(25, weakCount * 8);
      score -= Math.min(20, no2faCount * 4);
      score -= Math.min(15, staleCount * 3);
      score = Math.max(0, Math.min(100, Math.round(score)));
    }

    let grade = { label: 'Excellent', color: 'var(--accent-emerald)', bg: 'rgba(16, 185, 129, 0.12)' };
    if (score < 50) {
      grade = { label: 'Critical Attention', color: 'var(--accent-rose)', bg: 'rgba(244, 63, 94, 0.15)' };
    } else if (score < 75) {
      grade = { label: 'Needs Improvement', color: 'var(--accent-amber)', bg: 'rgba(245, 158, 11, 0.15)' };
    } else if (score < 90) {
      grade = { label: 'Good Security', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
    }

    return {
      analyses: list,
      counts: {
        total: activeLogins.length,
        flagged: list.length,
        reused: reusedCount,
        weak: weakCount,
        no2fa: no2faCount,
        stale: staleCount,
        breached: breachedCount,
      },
      healthScore: score,
      grade,
    };
  }, [items, hibpResults]);

  if (!isOpen) return null;

  // Run HIBP k-Anonymity Leak Check
  const runHibpAudit = async () => {
    setAuditingHibp(true);
    const newResults: Record<string, BreachAuditResult> = {};

    for (const item of items) {
      if (item.decrypted && item.decrypted.password) {
        try {
          const breachInfo = await checkPasswordBreach(item.decrypted.password);
          newResults[item.id] = {
            itemId: item.id,
            name: item.decrypted.name || 'Unnamed Item',
            username: item.decrypted.username,
            isBreached: breachInfo.isBreached,
            breachCount: breachInfo.breachCount,
          };
        } catch (e) {
          console.warn('HIBP audit check failed for item', item.id, e);
        }
      }
    }

    setHibpResults(newResults);
    setAuditingHibp(false);
  };

  // Filter items based on active tab
  const filteredAnalyses = analyses.filter((a) => {
    if (activeFilter === 'all') return true;
    return a.issues.some((issue) => issue.type === activeFilter);
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
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
          maxWidth: '720px',
          padding: '24px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: grade.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: grade.color,
              }}
            >
              {healthScore >= 75 ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 700 }}>Vault Health Dashboard</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
                Comprehensive zero-knowledge audit · Reused, weak, 2FA, age &amp; HIBP leaks
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px' }}>
            <X size={20} />
          </button>
        </div>

        {/* ── Score & Stats Hero Card ── */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Score Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: grade.bg,
                border: `2px solid ${grade.color}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: grade.color,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{healthScore}</span>
              <span style={{ fontSize: '0.62rem', fontWeight: 600, opacity: 0.8 }}>/100</span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>{grade.label}</span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: grade.bg,
                    color: grade.color,
                    fontWeight: 600,
                  }}
                >
                  {counts.flagged === 0 ? 'Zero Issues' : `${counts.flagged} Item(s) Need Action`}
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                {counts.total} credentials audited across your local vault.
              </p>
            </div>
          </div>

          {/* Right: HIBP Scan Trigger */}
          <button
            type="button"
            onClick={runHibpAudit}
            disabled={auditingHibp}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.8rem', gap: '6px' }}
          >
            <RefreshCw size={14} className={auditingHibp ? 'animate-spin' : ''} color="var(--accent-primary)" />
            <span>{auditingHibp ? 'Scanning HIBP...' : 'Scan Leaks (HIBP)'}</span>
          </button>
        </div>

        {/* ── Category Filter Tabs ── */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '8px',
            marginBottom: '12px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`btn ${activeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '4px 10px', fontSize: '0.75rem', minHeight: 'auto', borderRadius: '16px' }}
          >
            All Issues ({counts.flagged})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('reused')}
            className={`btn ${activeFilter === 'reused' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              minHeight: 'auto',
              borderRadius: '16px',
              color: activeFilter === 'reused' ? undefined : counts.reused > 0 ? 'var(--accent-rose)' : undefined,
            }}
          >
            Reused ({counts.reused})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('weak')}
            className={`btn ${activeFilter === 'weak' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              minHeight: 'auto',
              borderRadius: '16px',
              color: activeFilter === 'weak' ? undefined : counts.weak > 0 ? 'var(--accent-amber)' : undefined,
            }}
          >
            Weak ({counts.weak})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('no2fa')}
            className={`btn ${activeFilter === 'no2fa' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '4px 10px', fontSize: '0.75rem', minHeight: 'auto', borderRadius: '16px' }}
          >
            Missing 2FA ({counts.no2fa})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('stale')}
            className={`btn ${activeFilter === 'stale' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '4px 10px', fontSize: '0.75rem', minHeight: 'auto', borderRadius: '16px' }}
          >
            Stale &gt;1yr ({counts.stale})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('breached')}
            className={`btn ${activeFilter === 'breached' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              minHeight: 'auto',
              borderRadius: '16px',
              color: activeFilter === 'breached' ? undefined : counts.breached > 0 ? 'var(--accent-rose)' : undefined,
            }}
          >
            Pwned Leaks ({counts.breached})
          </button>
        </div>

        {/* ── Issues List ── */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredAnalyses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
              <CheckCircle2 size={44} color="var(--accent-emerald)" style={{ marginBottom: '10px' }} />
              <h3 style={{ fontSize: '1rem', color: '#fff', margin: '0 0 4px' }}>No Issues Found</h3>
              <p style={{ fontSize: '0.8rem', margin: 0 }}>
                {activeFilter === 'all'
                  ? 'All vault credentials satisfy your security policies!'
                  : `No items flagged under the "${activeFilter}" category.`}
              </p>
            </div>
          ) : (
            filteredAnalyses.map(({ item, issues }) => {
              const d = item.decrypted!;
              return (
                <div
                  key={item.id}
                  style={{
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>{d.name}</span>
                      {d.url && (
                        <a
                          href={d.url.startsWith('http') ? d.url : `https://${d.url}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center' }}
                        >
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>

                    {d.username && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '6px' }}>
                        {d.username}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {issues.map((issue, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: '5px',
                            background:
                              issue.severity === 'high'
                                ? 'rgba(244, 63, 94, 0.15)'
                                : issue.severity === 'medium'
                                ? 'rgba(245, 158, 11, 0.15)'
                                : 'rgba(255, 255, 255, 0.07)',
                            color:
                              issue.severity === 'high'
                                ? '#fda4af'
                                : issue.severity === 'medium'
                                ? '#fbbf24'
                                : 'var(--text-muted)',
                            border: `1px solid ${
                              issue.severity === 'high'
                                ? 'rgba(244, 63, 94, 0.3)'
                                : issue.severity === 'medium'
                                ? 'rgba(245, 158, 11, 0.3)'
                                : 'rgba(255, 255, 255, 0.1)'
                            }`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {issue.severity === 'high' && <AlertTriangle size={10} />}
                          <span>{issue.label}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {onEditItem && (
                    <button
                      type="button"
                      onClick={() => onEditItem(item)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.75rem', minHeight: 'auto', gap: '4px', flexShrink: 0 }}
                    >
                      <Edit size={12} /> Fix
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div
          style={{
            marginTop: '12px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: 'var(--text-dim)',
          }}
        >
          <span>
            HIBP checks use <strong>k-Anonymity</strong> (only 5-char SHA-1 prefix transmitted).
          </span>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
