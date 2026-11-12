import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  RefreshCw,
  KeyRound,
  Sparkles,
  ShieldCheck,
  Sliders,
  Type,
  User,
  AtSign,
  UserCheck,
  Mail,
  Info,
  Wallet,
  Printer,
  Eye,
  EyeOff,
  ExternalLink,
  Shield,
  Lock,
} from 'lucide-react';
import { generateSecurePassphrase, calculatePassphraseEntropy, PASSPHRASE_WORDLIST } from '../crypto/wordlist.js';
import {
  generateSecureUsername,
  generateSecureEmail,
  EMAIL_DOMAIN_PRESETS,
  UsernameStyle,
  UsernameSeparator,
  SuffixDigits,
  IDENTITY_ADJECTIVES,
  IDENTITY_NOUNS,
} from '../crypto/identityGenerator.js';
import {
  generateColdWallet,
  ColdWalletResult,
  CryptoNetworkId,
} from '../crypto/coldWalletGenerator.js';

export type GeneratorTab = 'password' | 'passphrase' | 'wallet' | 'username' | 'email';

interface PasswordGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPassword?: (value: string) => void;
  onSaveColdWalletToVault?: (wallet: ColdWalletResult) => void;
  initialMode?: GeneratorTab;
  isLoggedIn?: boolean;
}

export const PasswordGeneratorModal: React.FC<PasswordGeneratorModalProps> = ({
  isOpen,
  onClose,
  onSelectPassword,
  onSaveColdWalletToVault,
  initialMode = 'password',
  isLoggedIn = true,
}) => {
  const showWalletTab = isLoggedIn !== false;

  // Mode selection
  const [activeTab, setActiveTab] = useState<GeneratorTab>(() => {
    if (!showWalletTab && initialMode === 'wallet') return 'password';
    return initialMode;
  });

  // ── Random Password state ──
  const [length, setLength] = useState<number>(18);
  const [useUppercase, setUseUppercase] = useState<boolean>(true);
  const [useLowercase, setUseLowercase] = useState<boolean>(true);
  const [useNumbers, setUseNumbers] = useState<boolean>(true);
  const [useSymbols, setUseSymbols] = useState<boolean>(true);
  const [avoidAmbiguous, setAvoidAmbiguous] = useState<boolean>(false);

  // ── Passphrase state ──
  const [wordCount, setWordCount] = useState<number>(4);
  const [separator, setSeparator] = useState<string>('-');
  const [capitalize, setCapitalize] = useState<boolean>(false);
  const [includeNumber, setIncludeNumber] = useState<boolean>(true);

  // ── Cold Wallet state ──
  const [walletWordCount, setWalletWordCount] = useState<12 | 18 | 24>(12);
  const [walletNetwork, setWalletNetwork] = useState<CryptoNetworkId>('Ethereum');
  const [walletPassphrase, setWalletPassphrase] = useState<string>('');
  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);
  const [coldWallet, setColdWallet] = useState<ColdWalletResult | null>(null);
  const [showSeed, setShowSeed] = useState<boolean>(true);
  const [showPrivKey, setShowPrivKey] = useState<boolean>(false);
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);
  const [copiedLegacy, setCopiedLegacy] = useState<boolean>(false);
  const [copiedPubKey, setCopiedPubKey] = useState<boolean>(false);
  const [copiedSeed, setCopiedSeed] = useState<boolean>(false);
  const [copiedPrivKey, setCopiedPrivKey] = useState<boolean>(false);

  // ── Username state ──
  const [usernameStyle, setUsernameStyle] = useState<UsernameStyle>('words');
  const [usernameSeparator, setUsernameSeparator] = useState<UsernameSeparator>('');
  const [usernameCapitalize, setUsernameCapitalize] = useState<boolean>(true);
  const [usernameDigits, setUsernameDigits] = useState<SuffixDigits>('two');
  const [usernameLength, setUsernameLength] = useState<number>(12);

  // ── Email state ──
  const [emailMode, setEmailMode] = useState<'plus' | 'domain'>('plus');
  const [plusEmail, setPlusEmail] = useState<string>('');
  const [domain, setDomain] = useState<string>('gmail.com');

  // Output & UI state
  const [generatedValue, setGeneratedValue] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isRotating, setIsRotating] = useState<boolean>(false);

  // Reset initial mode when opening modal
  useEffect(() => {
    if (isOpen) {
      if (!showWalletTab && initialMode === 'wallet') {
        setActiveTab('password');
      } else {
        setActiveTab(initialMode);
      }
    }
  }, [isOpen, initialMode, showWalletTab]);

  // Calculate entropy for password modes
  const entropy = useMemo(() => {
    if (activeTab === 'passphrase') {
      return calculatePassphraseEntropy({ wordCount, includeNumber });
    }
    let pool = 0;
    if (useUppercase) pool += avoidAmbiguous ? 24 : 26; // minus 'I', 'O'
    if (useLowercase) pool += avoidAmbiguous ? 24 : 26; // minus 'l', 'o'
    if (useNumbers) pool += avoidAmbiguous ? 8 : 10;    // minus '1', '0'
    if (useSymbols) pool += avoidAmbiguous ? 26 : 27;   // minus '|'
    if (pool === 0) pool = avoidAmbiguous ? 24 : 26;
    return Math.round(length * Math.log2(pool));
  }, [activeTab, wordCount, includeNumber, length, useUppercase, useLowercase, useNumbers, useSymbols, avoidAmbiguous]);

  const strength = useMemo(() => {
    if (entropy < 36) return { label: 'Weak', color: 'var(--accent-rose)', percent: 25 };
    if (entropy < 54) return { label: 'Moderate', color: 'var(--accent-amber)', percent: 50 };
    if (entropy < 72) return { label: 'Strong', color: 'var(--accent-emerald)', percent: 75 };
    return { label: 'Very Strong', color: '#38bdf8', percent: 100 };
  }, [entropy]);

  const generate = (forceNewMnemonic: boolean = true) => {
    setIsRotating(true);
    setTimeout(() => setIsRotating(false), 300);

    if (activeTab === 'wallet') {
      generateColdWallet({
        wordCount: walletWordCount,
        network: walletNetwork,
        passphrase: walletPassphrase,
        customMnemonic: !forceNewMnemonic && coldWallet ? coldWallet.mnemonic : undefined,
      }).then((wallet) => {
        setColdWallet(wallet);
        setGeneratedValue(wallet.mnemonic);
      });
      return;
    }

    if (activeTab === 'passphrase') {
      const phrase = generateSecurePassphrase({
        wordCount,
        separator,
        capitalize,
        includeNumber,
      });
      setGeneratedValue(phrase);
      return;
    }

    if (activeTab === 'username') {
      const name = generateSecureUsername({
        style: usernameStyle,
        separator: usernameSeparator,
        capitalize: usernameCapitalize,
        digits: usernameDigits,
        length: usernameLength,
      });
      setGeneratedValue(name);
      return;
    }

    if (activeTab === 'email') {
      const email = generateSecureEmail({
        mode: emailMode,
        plusEmail,
        domain,
        usernameOptions: {
          style: usernameStyle,
          digits: usernameDigits,
        },
      });
      setGeneratedValue(email);
      return;
    }

    // Default: Random Password
    const filterAmbiguous = (str: string) =>
      avoidAmbiguous ? str.split('').filter((c) => !'Il1O0o|'.includes(c)).join('') : str;

    let charset = '';
    if (useUppercase) charset += filterAmbiguous('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (useLowercase) charset += filterAmbiguous('abcdefghijklmnopqrstuvwxyz');
    if (useNumbers) charset += filterAmbiguous('0123456789');
    if (useSymbols) charset += filterAmbiguous('!@#$%^&*()_+-=[]{}|;:,.<>?');

    if (!charset) charset = filterAmbiguous('abcdefghijklmnopqrstuvwxyz');

    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[array[i] % charset.length];
    }
    setGeneratedValue(result);
  };

  useEffect(() => {
    if (isOpen) {
      generate();
    }
  }, [
    isOpen,
    activeTab,
    // Password deps
    length,
    useUppercase,
    useLowercase,
    useNumbers,
    useSymbols,
    avoidAmbiguous,
    // Passphrase deps
    wordCount,
    separator,
    capitalize,
    includeNumber,
    // Username deps
    usernameStyle,
    usernameSeparator,
    usernameCapitalize,
    usernameDigits,
    usernameLength,
    // Email deps
    emailMode,
    plusEmail,
    domain,
    // Cold wallet deps (word count generates a fresh mnemonic)
    walletWordCount,
  ]);

  // Re-derive keys from the SAME mnemonic when switching network or editing/clearing the 25th word
  useEffect(() => {
    if (isOpen && activeTab === 'wallet' && coldWallet) {
      generate(false);
    }
  }, [walletNetwork, walletPassphrase]);

  const handlePrintPaperWallet = () => {
    if (!coldWallet) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OneStop - Cold Wallet Paper Backup</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; margin: 40px; color: #111; }
            .card { border: 2px dashed #222; border-radius: 12px; padding: 24px; max-width: 650px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 16px; }
            .badge { background: #eee; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
            .word { border: 1px solid #ccc; border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: monospace; }
            .word-idx { color: #666; margin-right: 6px; font-size: 11px; }
            .field { margin: 8px 0; word-break: break-all; font-family: monospace; font-size: 12px; }
            .warning { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 10px 14px; border-radius: 6px; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <div>
                <h2 style="margin: 0;">OneStop Cold Wallet Backup</h2>
                <p style="margin: 4px 0 0; font-size: 12px; color: #666;">Air-Gapped Offline Paper Storage · ${new Date().toLocaleDateString()}</p>
              </div>
              <div class="badge">${coldWallet.network} · ${coldWallet.wordCount} Words</div>
            </div>
            <div>
              <strong>Public Receiving Address:</strong>
              <div class="field" style="background: #f4f4f5; padding: 8px 12px; border-radius: 6px;">${coldWallet.walletAddress}</div>
            </div>
            ${coldWallet.legacyAddress ? `
            <div style="margin-top: 8px;">
              <strong>Legacy Address (P2PKH):</strong>
              <div class="field" style="background: #f4f4f5; padding: 8px 12px; border-radius: 6px;">${coldWallet.legacyAddress}</div>
            </div>` : ''}
            <div style="margin-top: 8px;">
              <strong>Public Key:</strong>
              <div class="field" style="background: #f4f4f5; padding: 8px 12px; border-radius: 6px; font-size: 11px;">${coldWallet.publicKey}</div>
            </div>
            <div style="margin-top: 16px;">
              <strong>BIP-39 Recovery Seed Phrase:</strong>
              <div class="grid">
                ${coldWallet.mnemonicWords.map((w, i) => `<div class="word"><span class="word-idx">${i + 1}.</span>${w}</div>`).join('')}
              </div>
            </div>
            <div>
              <strong>Private Key:</strong>
              <div class="field" style="background: #f4f4f5; padding: 8px 12px; border-radius: 6px;">${coldWallet.privateKey}</div>
            </div>
            <div style="font-size: 12px; color: #666;">Derivation Path: <code>${coldWallet.derivationPath}</code></div>
            <div class="warning">
              ⚠️ <strong>SECURITY WARNING:</strong> Anyone who obtains this paper sheet has complete, irreversible control over your crypto assets. Store this in a fireproof, waterproof safe. Never photograph or upload to the internet.
            </div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSelectButtonLabel = () => {
    if (activeTab === 'username') return 'Use This Username';
    if (activeTab === 'email') return 'Use This Email';
    if (activeTab === 'wallet') return 'Use This Wallet Seed';
    return 'Use This Password';
  };

  const getSelectButtonIcon = () => {
    if (activeTab === 'username') return <UserCheck size={16} />;
    if (activeTab === 'email') return <Mail size={16} />;
    if (activeTab === 'wallet') return <Wallet size={16} />;
    return <Sparkles size={16} />;
  };

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
        className="glass-panel animate-fade-in generator-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <KeyRound size={20} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
            <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Identity & Credential Generator
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Generated Value Preview Box (For Password, Passphrase, Username, Email) */}
        {activeTab !== 'wallet' && (
          <div
            style={{
              position: 'relative',
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid var(--border-glow)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: generatedValue.length > 28 ? '0.88rem' : generatedValue.length > 20 ? '0.98rem' : '1.12rem',
                fontWeight: 600,
                color: 'var(--text-main)',
                wordBreak: 'break-all',
                overflowWrap: 'break-word',
                userSelect: 'all',
                lineHeight: 1.35,
                letterSpacing: activeTab === 'password' ? '0.04em' : '0.01em',
              }}
            >
              {generatedValue}
            </span>

            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button
                onClick={() => generate(true)}
                className="btn btn-ghost"
                style={{ padding: '8px', minHeight: 'auto', transition: 'transform 0.3s ease', transform: isRotating ? 'rotate(180deg)' : 'none' }}
                title="Regenerate"
              >
                <RefreshCw size={17} />
              </button>
              <button onClick={handleCopy} className="btn btn-primary" style={{ padding: '8px 12px', minHeight: 'auto' }} title="Copy to clipboard">
                {copied ? <Check size={17} color="var(--accent-emerald)" /> : <Copy size={17} />}
              </button>
            </div>
          </div>
        )}

        {/* Strength & Entropy Indicator (Only for Password & Passphrase) */}
        {(activeTab === 'password' || activeTab === 'passphrase') ? (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} color={strength.color} />
                <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
              </div>
              <span style={{ color: 'var(--text-muted)' }}>
                ~{entropy} bits entropy
              </span>
            </div>
            <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${strength.percent}%`,
                  height: '100%',
                  background: strength.color,
                  transition: 'all 0.3s ease',
                }}
              />
            </div>
          </div>
        ) : activeTab === 'wallet' ? (
          /* Info pill for Cold Wallet */
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: '#fbbf24' }}>
            <Lock size={15} style={{ flexShrink: 0 }} />
            <span>
              <strong>100% Air-Gapped & Offline Capable.</strong> Generated via browser Web Crypto CSPRNG (BIP-39). Keys and seed phrase never touch any server.
            </span>
          </div>
        ) : activeTab === 'username' ? (
          /* Info pill for Username */
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(96, 165, 250, 0.1)', border: '1px solid rgba(96, 165, 250, 0.25)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: '#93c5fd' }}>
            <Info size={15} style={{ flexShrink: 0 }} />
            <span>
              <strong>{IDENTITY_ADJECTIVES.length} Adjectives × {IDENTITY_NOUNS.length} Nouns</strong> (17.9M+ combos). 100% separate from vault passcode words.
            </span>
          </div>
        ) : (
          /* Info pill for Email */
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: '#6ee7b7' }}>
            <Info size={15} style={{ flexShrink: 0 }} />
            <span>
              {emailMode === 'plus'
                ? 'Plus-addressing delivers all mail to your real inbox while tracking data leaks or spam.'
                : 'Generates a disposable handle tag with your chosen email service domain.'}
            </span>
          </div>
        )}

        {/* Generator Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Mode Selector Tabs (2-Row Layout: All tabs 100% visible on mobile with NO hidden scrolling) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Row 1: Credentials & Security */}
            <div style={{ display: 'grid', gridTemplateColumns: showWalletTab ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '6px' }}>
              {[
                { id: 'password', label: 'Password', icon: <Sliders size={13} /> },
                { id: 'passphrase', label: 'Passphrase', icon: <Type size={13} /> },
                ...(showWalletTab ? [{ id: 'wallet', label: 'Cold Wallet', icon: <Wallet size={13} /> }] : []),
              ].map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as GeneratorTab)}
                    className="btn"
                    style={{
                      fontSize: '0.78rem',
                      padding: '8px 4px',
                      minHeight: '35px',
                      gap: '5px',
                      background: active ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.05)',
                      borderColor: active ? 'var(--border-glow)' : 'transparent',
                      color: active ? 'var(--text-main)' : 'var(--text-muted)',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Row 2: Identities */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
              {[
                { id: 'username', label: 'Username', icon: <User size={13} /> },
                { id: 'email', label: 'Email Alias', icon: <AtSign size={13} /> },
              ].map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as GeneratorTab)}
                    className="btn"
                    style={{
                      fontSize: '0.78rem',
                      padding: '8px 4px',
                      minHeight: '35px',
                      gap: '5px',
                      background: active ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.05)',
                      borderColor: active ? 'var(--border-glow)' : 'transparent',
                      color: active ? 'var(--text-main)' : 'var(--text-muted)',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ──────────────── TAB 1: RANDOM CHARACTERS ──────────────── */}
          {activeTab === 'password' && (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="input-label" style={{ margin: 0 }}>Password Length</span>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    {length} characters
                  </span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="64"
                  value={length}
                  onChange={(e) => setLength(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={useUppercase}
                    onChange={(e) => setUseUppercase(e.target.checked)}
                  />
                  <span>Uppercase (A-Z)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={useLowercase}
                    onChange={(e) => setUseLowercase(e.target.checked)}
                  />
                  <span>Lowercase (a-z)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={useNumbers}
                    onChange={(e) => setUseNumbers(e.target.checked)}
                  />
                  <span>Numbers (0-9)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={useSymbols}
                    onChange={(e) => setUseSymbols(e.target.checked)}
                  />
                  <span>Symbols (!@#$)</span>
                </label>
              </div>

              <div style={{ paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={avoidAmbiguous}
                    onChange={(e) => setAvoidAmbiguous(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div>Avoid Ambiguous Characters</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      Excludes: I, l, 1, O, 0, |
                    </div>
                  </div>
                </label>
              </div>
            </>
          )}

          {/* ──────────────── TAB 2: MEMORABLE PASSPHRASE ──────────────── */}
          {activeTab === 'passphrase' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="input-label" style={{ margin: 0 }}>Number of Words</span>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    {wordCount} words ({wordCount * 11} bits)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[3, 4, 5, 6].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setWordCount(count)}
                      className="btn"
                      style={{
                        flex: 1,
                        padding: '6px',
                        minHeight: '34px',
                        fontSize: '0.85rem',
                        background: wordCount === count ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)',
                        color: wordCount === count ? '#000000' : 'var(--text-main)',
                        fontWeight: wordCount === count ? 600 : 400,
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="input-label" style={{ margin: 0 }}>Word Separator</span>
                  <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {separator === ' ' ? 'Space' : separator === '' ? 'None' : `"${separator}"`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { label: 'Hyphen (-)', val: '-' },
                    { label: 'Underscore (_)', val: '_' },
                    { label: 'Period (.)', val: '.' },
                    { label: 'Space', val: ' ' },
                  ].map((sep) => (
                    <button
                      key={sep.val}
                      type="button"
                      onClick={() => setSeparator(sep.val)}
                      className="btn"
                      style={{
                        flex: 1,
                        padding: '6px',
                        minHeight: '34px',
                        fontSize: '0.8rem',
                        background: separator === sep.val ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)',
                        color: separator === sep.val ? '#000000' : 'var(--text-main)',
                        fontWeight: separator === sep.val ? 600 : 400,
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {sep.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={capitalize}
                    onChange={(e) => setCapitalize(e.target.checked)}
                  />
                  <span>Capitalize (TitleCase)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={includeNumber}
                    onChange={(e) => setIncludeNumber(e.target.checked)}
                  />
                  <span>Include Number (10-99)</span>
                </label>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', background: 'rgba(255, 255, 255, 0.03)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                Powered by a curated <strong>2,048-word dictionary</strong> ({PASSPHRASE_WORDLIST.length} words, 11 bits/word) using cryptographic random sampling.
              </div>
            </div>
          )}

          {/* ──────────────── TAB: COLD WALLET GENERATOR ──────────────── */}
          {activeTab === 'wallet' && coldWallet && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Word Count & Network Config */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="input-label" style={{ marginBottom: '6px' }}>Recovery Phrase Length</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {([12, 18, 24] as const).map(count => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setWalletWordCount(count)}
                        className="btn"
                        style={{
                          flex: 1,
                          padding: '6px 4px',
                          fontSize: '0.75rem',
                          minHeight: '30px',
                          background: walletWordCount === count ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)',
                          color: walletWordCount === count ? '#000' : 'var(--text-main)',
                          fontWeight: walletWordCount === count ? 600 : 400,
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        {count}w
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="input-label" style={{ marginBottom: '6px' }}>Blockchain Network</label>
                  <select
                    className="input-field"
                    style={{ height: '32px', fontSize: '0.78rem', padding: '4px 8px' }}
                    value={walletNetwork}
                    onChange={(e) => setWalletNetwork(e.target.value as CryptoNetworkId)}
                  >
                    <option value="Ethereum">Ethereum (ETH / EVM)</option>
                    <option value="Bitcoin">Bitcoin (BTC SegWit)</option>
                    <option value="Solana">Solana (SOL)</option>
                    <option value="Polygon">Polygon (MATIC)</option>
                    <option value="BNB Chain">BNB Chain (BNB)</option>
                    <option value="Multi-Chain">Multi-Chain Universal</option>
                  </select>
                </div>
              </div>

              {/* Optional BIP-39 "25th Word" Passphrase */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="input-label" style={{ marginBottom: 0 }}>
                    BIP-39 Passphrase (&ldquo;25th Word&rdquo;) — Optional
                  </label>
                  {walletPassphrase && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setWalletPassphrase('')}
                      style={{ fontSize: '0.68rem', padding: '1px 6px', minHeight: 'auto', color: 'var(--text-muted)' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    className="input-field"
                    value={walletPassphrase}
                    onChange={(e) => setWalletPassphrase(e.target.value)}
                    placeholder="Leave blank for standard seed, or add a secret passphrase..."
                    autoComplete="off"
                    spellCheck={false}
                    style={{ paddingRight: '2.25rem', fontSize: '0.78rem', height: '34px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase((v) => !v)}
                    className="btn btn-ghost"
                    aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                    style={{
                      position: 'absolute',
                      right: '4px',
                      padding: '4px',
                      minHeight: 'auto',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {showPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  Adds an extra secret factor to the seed phrase. Different passphrases derive completely separate wallets.
                </p>
              </div>

              {/* Numbered Seed Phrase Chip Grid */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fbbf24' }}>
                      BIP-39 Recovery Seed Phrase
                    </span>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#fbbf24',
                      }}
                    >
                      {coldWallet.entropyBits} bits
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setShowSeed(v => !v)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', minHeight: 'auto' }}
                      title={showSeed ? 'Mask Words' : 'Reveal Words'}
                    >
                      {showSeed ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(coldWallet.mnemonic);
                        setCopiedSeed(true);
                        setTimeout(() => setCopiedSeed(false), 2000);
                      }}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', minHeight: 'auto', fontSize: '0.72rem', gap: '4px' }}
                    >
                      {copiedSeed ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                      <span>{copiedSeed ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => generate(true)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', minHeight: 'auto', transition: 'transform 0.3s ease', transform: isRotating ? 'rotate(180deg)' : 'none' }}
                      title="Generate new phrase"
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </div>

                {showSeed ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
                      gap: '6px',
                    }}
                  >
                    {coldWallet.mnemonicWords.map((word, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 8px',
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
                      padding: '16px',
                      textAlign: 'center',
                      background: 'rgba(0, 0, 0, 0.4)',
                      borderRadius: '6px',
                      color: 'var(--text-dim)',
                      letterSpacing: '2px',
                    }}
                  >
                    •••• •••• •••• •••• •••• ••••
                  </div>
                )}
              </div>

              {/* Public Receiving Address */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    Public Receiving Address {coldWallet.network === 'Bitcoin' ? '(Native SegWit bc1q...)' : `(${coldWallet.network})`}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {coldWallet.explorerUrl && (
                      <a
                        href={coldWallet.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost"
                        style={{ padding: '2px 5px', minHeight: 'auto', textDecoration: 'none', color: 'inherit' }}
                        title="View on Explorer / Balance Checker"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(coldWallet.walletAddress);
                        setCopiedAddress(true);
                        setTimeout(() => setCopiedAddress(false), 2000);
                      }}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', minHeight: 'auto', fontSize: '0.72rem', gap: '4px' }}
                    >
                      {copiedAddress ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                      <span>{copiedAddress ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: '0.78rem',
                    color: '#fff',
                    wordBreak: 'break-all',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    userSelect: 'all',
                  }}
                >
                  {coldWallet.walletAddress}
                </div>

                {/* Bitcoin Legacy Address (Optional P2PKH 1...) */}
                {coldWallet.legacyAddress && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                        Legacy Address (P2PKH 1...)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!coldWallet.legacyAddress) return;
                          navigator.clipboard.writeText(coldWallet.legacyAddress);
                          setCopiedLegacy(true);
                          setTimeout(() => setCopiedLegacy(false), 2000);
                        }}
                        className="btn btn-ghost"
                        style={{ padding: '1px 5px', minHeight: 'auto', fontSize: '0.68rem', gap: '4px' }}
                      >
                        {copiedLegacy ? <Check size={11} color="var(--accent-emerald)" /> : <Copy size={11} />}
                        <span>{copiedLegacy ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-dim)',
                        wordBreak: 'break-all',
                        background: 'rgba(0, 0, 0, 0.3)',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        userSelect: 'all',
                      }}
                    >
                      {coldWallet.legacyAddress}
                    </div>
                  </div>
                )}
              </div>

              {/* Public Key (Secp256k1 Curve Point - Validates on Cryptools) */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      Public Key ({coldWallet.network === 'Bitcoin' ? '33-byte Compressed' : 'Secp256k1'})
                    </span>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#38bdf8',
                      }}
                    >
                      Cryptools Validated
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(coldWallet.publicKey);
                      setCopiedPubKey(true);
                      setTimeout(() => setCopiedPubKey(false), 2000);
                    }}
                    className="btn btn-ghost"
                    style={{ padding: '2px 6px', minHeight: 'auto', fontSize: '0.72rem', gap: '4px' }}
                  >
                    {copiedPubKey ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                    <span>{copiedPubKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: '0.72rem',
                    color: '#93c5fd',
                    wordBreak: 'break-all',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    userSelect: 'all',
                  }}
                >
                  {coldWallet.publicKey}
                </div>
              </div>

              {/* Private Key */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      Private Key {coldWallet.network === 'Bitcoin' ? '(WIF Compressed)' : ''}
                    </span>
                    <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                      ({coldWallet.derivationPath})
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setShowPrivKey(v => !v)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 5px', minHeight: 'auto' }}
                      title={showPrivKey ? 'Hide Key' : 'Reveal Key'}
                    >
                      {showPrivKey ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(coldWallet.privateKey);
                        setCopiedPrivKey(true);
                        setTimeout(() => setCopiedPrivKey(false), 2000);
                      }}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', minHeight: 'auto', fontSize: '0.72rem', gap: '4px' }}
                    >
                      {copiedPrivKey ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                      <span>{copiedPrivKey ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: '0.75rem',
                    letterSpacing: showPrivKey ? '0' : '2px',
                    color: showPrivKey ? '#fff' : 'var(--text-dim)',
                    wordBreak: 'break-all',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    userSelect: showPrivKey ? 'all' : 'none',
                  }}
                >
                  {showPrivKey ? coldWallet.privateKey : '••••••••••••••••••••••••••••••••••••••••'}
                </div>
              </div>

              {/* Cold Storage Actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '2px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (onSaveColdWalletToVault) {
                      onSaveColdWalletToVault(coldWallet);
                      onClose();
                    } else if (onSelectPassword) {
                      onSelectPassword(coldWallet.mnemonic);
                      onClose();
                    }
                  }}
                  className="btn btn-primary"
                  style={{ padding: '8px 12px', fontSize: '0.8rem', gap: '6px' }}
                >
                  <Shield size={14} /> Save to Vault
                </button>

                <button
                  type="button"
                  onClick={handlePrintPaperWallet}
                  className="btn btn-secondary"
                  style={{ padding: '8px 12px', fontSize: '0.8rem', gap: '6px' }}
                >
                  <Printer size={14} /> Print Paper Wallet
                </button>
              </div>
            </div>
          )}

          {/* ──────────────── TAB 3: USERNAME GENERATOR ──────────────── */}
          {activeTab === 'username' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Style Selector */}
              <div>
                <label className="input-label" style={{ marginBottom: '8px' }}>Generation Style</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setUsernameStyle('words')}
                    className="btn"
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '0.82rem',
                      background: usernameStyle === 'words' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)',
                      color: usernameStyle === 'words' ? '#000000' : 'var(--text-main)',
                      fontWeight: usernameStyle === 'words' ? 600 : 400,
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    Words (Adjective + Noun)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUsernameStyle('random')}
                    className="btn"
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '0.82rem',
                      background: usernameStyle === 'random' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)',
                      color: usernameStyle === 'random' ? '#000000' : 'var(--text-main)',
                      fontWeight: usernameStyle === 'random' ? 600 : 400,
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    Random Alphanumeric
                  </button>
                </div>
              </div>

              {usernameStyle === 'words' ? (
                <>
                  {/* Separator */}
                  <div>
                    <label className="input-label" style={{ marginBottom: '8px' }}>Separator</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[
                        { label: 'None', val: '' as UsernameSeparator },
                        { label: 'Underscore (_)', val: '_' as UsernameSeparator },
                        { label: 'Hyphen (-)', val: '-' as UsernameSeparator },
                        { label: 'Dot (.)', val: '.' as UsernameSeparator },
                      ].map((sep) => (
                        <button
                          key={sep.label}
                          type="button"
                          onClick={() => setUsernameSeparator(sep.val)}
                          className="btn"
                          style={{
                            flex: 1,
                            padding: '6px',
                            minHeight: '32px',
                            fontSize: '0.78rem',
                            background: usernameSeparator === sep.val ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)',
                            color: usernameSeparator === sep.val ? '#000000' : 'var(--text-main)',
                            fontWeight: usernameSeparator === sep.val ? 600 : 400,
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          {sep.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Suffix digits */}
                  <div>
                    <label className="input-label" style={{ marginBottom: '8px' }}>Number Suffix</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[
                        { label: 'None', val: 'none' as SuffixDigits },
                        { label: '2 Digits (10-99)', val: 'two' as SuffixDigits },
                        { label: '3 Digits (100-999)', val: 'three' as SuffixDigits },
                      ].map((suf) => (
                        <button
                          key={suf.val}
                          type="button"
                          onClick={() => setUsernameDigits(suf.val)}
                          className="btn"
                          style={{
                            flex: 1,
                            padding: '6px',
                            minHeight: '32px',
                            fontSize: '0.78rem',
                            background: usernameDigits === suf.val ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)',
                            color: usernameDigits === suf.val ? '#000000' : 'var(--text-main)',
                            fontWeight: usernameDigits === suf.val ? 600 : 400,
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          {suf.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Capitalize Toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={usernameCapitalize}
                      onChange={(e) => setUsernameCapitalize(e.target.checked)}
                    />
                    <span>Capitalize (e.g. <code>StellarFalcon</code> vs <code>stellarfalcon</code>)</span>
                  </label>
                </>
              ) : (
                /* Random alphanumeric length */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className="input-label" style={{ margin: 0 }}>Username Length</span>
                    <span className="mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      {usernameLength} chars
                    </span>
                  </div>
                  <input
                    type="range"
                    min="6"
                    max="24"
                    value={usernameLength}
                    onChange={(e) => setUsernameLength(parseInt(e.target.value, 10))}
                    style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '6px 0 0' }}>
                    Always starts with a letter so it remains accepted across all websites and systems.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ──────────────── TAB 4: EMAIL ALIAS GENERATOR ──────────────── */}
          {activeTab === 'email' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Email Mode */}
              <div>
                <label className="input-label" style={{ marginBottom: '8px' }}>Email Type</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setEmailMode('plus')}
                    className="btn"
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '0.82rem',
                      background: emailMode === 'plus' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)',
                      color: emailMode === 'plus' ? '#000000' : 'var(--text-main)',
                      fontWeight: emailMode === 'plus' ? 600 : 400,
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    Plus-Addressed Alias (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailMode('domain')}
                    className="btn"
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '0.82rem',
                      background: emailMode === 'domain' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)',
                      color: emailMode === 'domain' ? '#000000' : 'var(--text-main)',
                      fontWeight: emailMode === 'domain' ? 600 : 400,
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    Standard Domain Email
                  </button>
                </div>
              </div>

              {emailMode === 'plus' ? (
                <div>
                  <label className="input-label">Your Real Primary Email</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="e.g. yourname@gmail.com or me@proton.me"
                    value={plusEmail}
                    onChange={(e) => setPlusEmail(e.target.value)}
                  />
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '6px 0 0', lineHeight: 1.4 }}>
                    Creates <code>yourname+alias@provider.com</code>. Messages land directly in your inbox, but you never share your clean root address!
                  </p>
                </div>
              ) : (
                <div>
                  <label className="input-label" style={{ marginBottom: '8px' }}>Domain Provider</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                    {EMAIL_DOMAIN_PRESETS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDomain(d)}
                        className="btn"
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          minHeight: '28px',
                          background: domain === d ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.06)',
                          color: domain === d ? '#000000' : 'var(--text-main)',
                          fontWeight: domain === d ? 600 : 400,
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        @{d}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="or type custom domain, e.g. mycompany.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Action / Select button if invoked by ItemModal */}
          {onSelectPassword && activeTab !== 'wallet' && (
            <button
              onClick={() => {
                onSelectPassword(generatedValue);
                onClose();
              }}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '6px', gap: '8px' }}
            >
              {getSelectButtonIcon()}
              {getSelectButtonLabel()}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
