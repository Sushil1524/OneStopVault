import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  FileText,
  Terminal,
  Copy,
  Check,
  Eye,
  EyeOff,
  Star,
  ExternalLink,
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import { VaultItem } from '../types/vault.js';
import { generateTOTP } from '../crypto/totp.js';

interface VaultItemCardProps {
  item: VaultItem;
  onEdit: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void;
  onRestore?: (item: VaultItem) => void;
  onPermanentDelete?: (id: string) => void;
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

function getEnvBadgeStyle(env?: string) {
  switch (env?.toLowerCase()) {
    case 'production':
      return { bg: 'rgba(244, 63, 94, 0.15)', text: '#fda4af', border: 'rgba(244, 63, 94, 0.3)' };
    case 'staging':
      return { bg: 'rgba(168, 85, 247, 0.15)', text: '#d8b4fe', border: 'rgba(168, 85, 247, 0.3)' };
    case 'development':
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.3)' };
    case 'test':
      return { bg: 'rgba(56, 189, 248, 0.15)', text: '#7dd3fc', border: 'rgba(56, 189, 248, 0.3)' };
    default:
      return { bg: 'rgba(255, 255, 255, 0.08)', text: 'var(--text-muted)', border: 'var(--border-color)' };
  }
}

function getNetworkBadgeStyle(network?: string) {
  switch (network?.toLowerCase()) {
    case 'ethereum':
      return { bg: 'rgba(98, 126, 234, 0.15)', text: '#a5b4fc', border: 'rgba(98, 126, 234, 0.35)', short: 'ETH' };
    case 'bitcoin':
      return { bg: 'rgba(247, 147, 26, 0.15)', text: '#fdba74', border: 'rgba(247, 147, 26, 0.35)', short: 'BTC' };
    case 'solana':
      return { bg: 'rgba(20, 241, 149, 0.15)', text: '#86efac', border: 'rgba(20, 241, 149, 0.35)', short: 'SOL' };
    case 'polygon':
      return { bg: 'rgba(130, 71, 229, 0.15)', text: '#c084fc', border: 'rgba(130, 71, 229, 0.35)', short: 'POL' };
    case 'bnb chain':
      return { bg: 'rgba(243, 186, 47, 0.15)', text: '#fde047', border: 'rgba(243, 186, 47, 0.35)', short: 'BNB' };
    case 'multi-chain':
      return { bg: 'rgba(56, 189, 248, 0.15)', text: '#7dd3fc', border: 'rgba(56, 189, 248, 0.35)', short: 'MULTI' };
    default:
      return { bg: 'rgba(255, 255, 255, 0.08)', text: 'var(--text-muted)', border: 'var(--border-color)', short: network ? network.slice(0, 4).toUpperCase() : 'WALLET' };
  }
}

function getExplorerUrl(network?: string, address?: string): string | null {
  if (!address) return null;
  const cleanAddr = address.trim();
  switch (network?.toLowerCase()) {
    case 'ethereum':
      return `https://etherscan.io/address/${cleanAddr}`;
    case 'bitcoin':
      return `https://mempool.space/address/${cleanAddr}`;
    case 'solana':
      return `https://solscan.io/account/${cleanAddr}`;
    case 'polygon':
      return `https://polygonscan.com/address/${cleanAddr}`;
    case 'bnb chain':
      return `https://bscscan.com/address/${cleanAddr}`;
    default:
      return null;
  }
}

function maskAddress(addr?: string): string {
  if (!addr) return '';
  const clean = addr.trim();
  if (clean.length <= 12) return clean;
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

export const VaultItemCard: React.FC<VaultItemCardProps> = ({
  item,
  onEdit,
  onToggleFavorite,
  onRestore,
  onPermanentDelete,
}) => {
  const payload = item.decrypted ?? { name: 'Encrypted Item' };
  const isDeleted = !!payload.deletedAt;
  const [expanded, setExpanded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const userCopy = useCopyButton();
  const passCopy = useCopyButton();
  const secretCopy = useCopyButton();
  const addressCopy = useCopyButton();
  const seedCopy = useCopyButton();
  const privateKeyCopy = useCopyButton();
  const totpCopy = useCopyButton();

  const [totpCode, setTotpCode] = useState('');
  const [totpSeconds, setTotpSeconds] = useState(30);

  useEffect(() => {
    if (!payload.totpSecret) return;
    let active = true;
    const refresh = async () => {
      const { code, secondsRemaining } = await generateTOTP(payload.totpSecret!);
      if (active) {
        setTotpCode(code);
        setTotpSeconds(secondsRemaining);
      }
    };
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [payload.totpSecret]);

  const faviconUrl = getFaviconUrl(payload.url);
  const safeUrl = payload.url
    ? payload.url.startsWith('http')
      ? payload.url
      : `https://${payload.url}`
    : null;

  const hostname = safeUrl
    ? (() => {
        try {
          return new URL(safeUrl).hostname;
        } catch {
          return payload.url;
        }
      })()
    : null;

  const envBadge = payload.environment ? getEnvBadgeStyle(payload.environment) : null;
  const networkBadge = payload.network ? getNetworkBadgeStyle(payload.network) : null;
  const explorerUrl = getExplorerUrl(payload.network, payload.walletAddress);
  const seedWords = payload.seedPhrase ? payload.seedPhrase.trim().split(/\s+/).filter(Boolean) : [];

  const getItemIcon = () => {
    if (faviconUrl) {
      return (
        <img
          src={faviconUrl}
          alt=""
          width={26}
          height={26}
          style={{ objectFit: 'contain' }}
          onError={e => {
            const el = e.target as HTMLImageElement;
            el.style.display = 'none';
          }}
        />
      );
    }
    if (item.itemType === 'secret') {
      return <Terminal size={18} color="var(--accent-primary, #60a5fa)" />;
    }
    if (item.itemType === 'wallet') {
      return <Wallet size={18} color="var(--accent-amber, #fbbf24)" />;
    }
    if (item.itemType === 'login') {
      return <KeyRound size={18} color="var(--text-muted)" />;
    }
    return <FileText size={18} color="var(--text-muted)" />;
  };

  return (
    <div
      className="vault-card"
      style={{
        background: isDeleted ? 'rgba(28, 16, 20, 0.7)' : 'rgba(18, 18, 20, 0.9)',
        border: isDeleted
          ? '1px solid rgba(244, 63, 94, 0.25)'
          : '1px solid var(--border-color)',
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
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: isDeleted
              ? 'rgba(244, 63, 94, 0.12)'
              : item.itemType === 'secret'
              ? 'rgba(96, 165, 250, 0.12)'
              : item.itemType === 'wallet'
              ? 'rgba(245, 158, 11, 0.15)'
              : 'rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {getItemIcon()}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '0.9rem',
              color: isDeleted ? '#fca5a5' : '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{payload.name}</span>
          </div>

          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              marginTop: '1px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.itemType === 'secret'
              ? payload.environment
                ? `${payload.environment} · API Key`
                : 'Developer Secret'
              : item.itemType === 'wallet'
              ? `${payload.network || 'Crypto Wallet'}${payload.walletAddress ? ` · ${maskAddress(payload.walletAddress)}` : ''}`
              : payload.username || hostname || (item.itemType === 'note' ? 'Secure Note' : '—')}
          </div>
        </div>

        {/* Right side: badges + expand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {isDeleted && (
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(244, 63, 94, 0.15)',
                color: 'var(--accent-rose)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
              }}
            >
              TRASH
            </span>
          )}

          {!isDeleted && item.itemType === 'wallet' && payload.network && networkBadge && (
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '6px',
                background: networkBadge.bg,
                color: networkBadge.text,
                border: `1px solid ${networkBadge.border}`,
                letterSpacing: '0.5px',
              }}
            >
              {networkBadge.short}
            </span>
          )}

          {!isDeleted && payload.environment && envBadge && (
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '6px',
                background: envBadge.bg,
                color: envBadge.text,
                border: `1px solid ${envBadge.border}`,
                textTransform: 'uppercase',
              }}
            >
              {payload.environment.slice(0, 4)}
            </span>
          )}

          {!isDeleted && payload.totpSecret && (
            <span
              style={{
                fontSize: '0.6rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(16,185,129,0.15)',
                color: 'var(--accent-emerald)',
                border: '1px solid rgba(16,185,129,0.3)',
              }}
            >
              2FA
            </span>
          )}

          {!isDeleted && payload.favorite && (
            <Star size={13} fill="var(--accent-amber)" color="var(--accent-amber)" />
          )}

          <div style={{ color: 'var(--text-dim)' }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div
          style={{
            borderTop: isDeleted
              ? '1px solid rgba(244, 63, 94, 0.2)'
              : '1px solid var(--border-color)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {/* Deleted Warning Notice */}
          {isDeleted && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                color: 'var(--accent-rose)',
                fontSize: '0.78rem',
              }}
            >
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span>
                Moved to trash on{' '}
                {payload.deletedAt ? new Date(payload.deletedAt).toLocaleDateString() : 'recently'}.
              </span>
            </div>
          )}

          {/* ── Developer Secret & API Key Fields ── */}
          {item.itemType === 'secret' && (
            <>
              {payload.environment && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                    Environment
                  </span>
                  {envBadge && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: envBadge.bg,
                        color: envBadge.text,
                        border: `1px solid ${envBadge.border}`,
                      }}
                    >
                      {payload.environment}
                    </span>
                  )}
                </div>
              )}

              {payload.secretValue && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Secret / API Key
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={() => setShowSecret(v => !v)}
                        className="btn btn-ghost"
                        style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}
                        title={showSecret ? 'Hide secret' : 'Show secret'}
                      >
                        {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        onClick={() => secretCopy.copy(payload.secretValue!)}
                        className="btn btn-ghost"
                        style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}
                        title="Copy secret"
                      >
                        {secretCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>

                  <div
                    className="mono"
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      fontSize: '0.8rem',
                      letterSpacing: showSecret ? '0' : '2px',
                      color: showSecret ? '#fff' : 'var(--text-dim)',
                      wordBreak: 'break-all',
                      userSelect: showSecret ? 'all' : 'none',
                    }}
                  >
                    {showSecret ? payload.secretValue : '••••••••••••••••••••••••••••••••'}
                  </div>
                </div>
              )}

              {safeUrl && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                    Endpoint / URL
                  </span>
                  <a
                    href={safeUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      textDecoration: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {hostname} <ExternalLink size={11} />
                  </a>
                </div>
              )}
            </>
          )}

          {/* ── Crypto Wallet Fields ── */}
          {item.itemType === 'wallet' && (
            <>
              {/* Network & Derivation Path */}
              {(payload.network || payload.derivationPath) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                    Network & Path
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {networkBadge && (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: networkBadge.bg,
                          color: networkBadge.text,
                          border: `1px solid ${networkBadge.border}`,
                        }}
                      >
                        {payload.network}
                      </span>
                    )}
                    {payload.derivationPath && (
                      <span
                        className="mono"
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        {payload.derivationPath}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Public Receiving Address */}
              {payload.walletAddress && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Public Address
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {explorerUrl && (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost"
                          style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0, textDecoration: 'none', color: 'inherit' }}
                          title="View on block explorer"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <button
                        onClick={() => addressCopy.copy(payload.walletAddress!)}
                        className="btn btn-ghost"
                        style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}
                        title="Copy address"
                      >
                        {addressCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>

                  <div
                    className="mono"
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      fontSize: '0.78rem',
                      color: '#fff',
                      wordBreak: 'break-all',
                      userSelect: 'all',
                    }}
                  >
                    {payload.walletAddress}
                  </div>
                </div>
              )}

              {/* Recovery Seed Phrase */}
              {payload.seedPhrase && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        Recovery Seed Phrase
                      </span>
                      {seedWords.length > 0 && (
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '5px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                          }}
                        >
                          {seedWords.length} words
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={() => setShowSeed(v => !v)}
                        className="btn btn-ghost"
                        style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}
                        title={showSeed ? 'Hide seed phrase' : 'Show seed phrase'}
                      >
                        {showSeed ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        onClick={() => seedCopy.copy(payload.seedPhrase!)}
                        className="btn btn-ghost"
                        style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}
                        title="Copy seed phrase"
                      >
                        {seedCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>

                  {showSeed ? (
                    <div
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.6)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))',
                        gap: '6px',
                      }}
                    >
                      {seedWords.map((word, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            fontSize: '0.78rem',
                          }}
                        >
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', minWidth: '16px' }}>
                            {idx + 1}.
                          </span>
                          <span className="mono" style={{ color: '#fff', fontWeight: 500 }}>
                            {word}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="mono"
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        fontSize: '0.8rem',
                        letterSpacing: '2px',
                        color: 'var(--text-dim)',
                        userSelect: 'none',
                      }}
                    >
                      •••• •••• •••• •••• •••• ••••
                    </div>
                  )}
                </div>
              )}

              {/* Private Key */}
              {payload.privateKey && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Private Key
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={() => setShowPrivateKey(v => !v)}
                        className="btn btn-ghost"
                        style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}
                        title={showPrivateKey ? 'Hide private key' : 'Show private key'}
                      >
                        {showPrivateKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        onClick={() => privateKeyCopy.copy(payload.privateKey!)}
                        className="btn btn-ghost"
                        style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}
                        title="Copy private key"
                      >
                        {privateKeyCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>

                  <div
                    className="mono"
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      fontSize: '0.78rem',
                      letterSpacing: showPrivateKey ? '0' : '2px',
                      color: showPrivateKey ? '#fff' : 'var(--text-dim)',
                      wordBreak: 'break-all',
                      userSelect: showPrivateKey ? 'all' : 'none',
                    }}
                  >
                    {showPrivateKey ? payload.privateKey : '••••••••••••••••••••••••••••••••••••••••'}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Login fields ── */}
          {item.itemType === 'login' && (
            <>
              {payload.username && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                    Username
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '0.825rem',
                        color: '#fff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {payload.username}
                    </span>
                    <button
                      onClick={() => userCopy.copy(payload.username!)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}
                    >
                      {userCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}

              {payload.password && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                    Password
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="mono" style={{ fontSize: '0.825rem', letterSpacing: showPassword ? '0' : '2px' }}>
                      {showPassword ? payload.password : '•••••••••'}
                    </span>
                    <button
                      onClick={() => setShowPassword(v => !v)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      onClick={() => passCopy.copy(payload.password!)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 4px', minHeight: 'auto', flexShrink: 0 }}
                    >
                      {passCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}

              {safeUrl && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                    URL
                  </span>
                  <a
                    href={safeUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      textDecoration: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {hostname} <ExternalLink size={11} />
                  </a>
                </div>
              )}

              {payload.totpSecret && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={14} color="var(--accent-emerald)" />
                    <span
                      className="mono"
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        color: 'var(--accent-emerald)',
                        letterSpacing: '2px',
                      }}
                    >
                      {totpCode}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{totpSeconds}s</span>
                    <button
                      onClick={() => totpCopy.copy(totpCode)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 4px', minHeight: 'auto' }}
                    >
                      {totpCopy.copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Note content */}
          {payload.notes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                {item.itemType === 'note' ? 'Note Content' : 'Notes'}
              </span>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                {payload.notes}
              </p>
            </div>
          )}

          {/* Tags */}
          {payload.tags && payload.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {payload.tags.map(tag => (
                <span
                  key={tag}
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.07)',
                    color: 'var(--text-muted)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '6px',
              borderTop: isDeleted
                ? '1px solid rgba(244, 63, 94, 0.2)'
                : '1px solid var(--border-color)',
            }}
          >
            {isDeleted ? (
              <>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {onRestore && (
                    <button
                      onClick={() => onRestore(item)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.78rem', minHeight: 'auto', gap: '5px' }}
                    >
                      <RotateCcw size={13} /> Restore
                    </button>
                  )}
                  {onPermanentDelete && (
                    <button
                      onClick={() => {
                        if (confirm(`Permanently delete "${payload.name}"? This cannot be undone.`)) {
                          onPermanentDelete(item.id);
                        }
                      }}
                      className="btn btn-danger"
                      style={{ padding: '4px 10px', fontSize: '0.78rem', minHeight: 'auto', gap: '5px' }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
                <button
                  onClick={() => onEdit(item)}
                  className="btn btn-ghost"
                  style={{ padding: '4px 10px', fontSize: '0.78rem', minHeight: 'auto' }}
                >
                  View Details
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onToggleFavorite(item)}
                  className="btn btn-ghost"
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.78rem',
                    gap: '5px',
                    minHeight: 'auto',
                    color: payload.favorite ? 'var(--accent-amber)' : 'var(--text-dim)',
                  }}
                >
                  <Star size={13} fill={payload.favorite ? 'var(--accent-amber)' : 'none'} />
                  {payload.favorite ? 'Starred' : 'Star'}
                </button>
                <button
                  onClick={() => onEdit(item)}
                  className="btn btn-secondary"
                  style={{ padding: '5px 14px', fontSize: '0.82rem', minHeight: 'auto' }}
                >
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

