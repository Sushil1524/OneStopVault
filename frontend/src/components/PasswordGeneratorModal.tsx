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

export type GeneratorTab = 'password' | 'passphrase' | 'username' | 'email';

interface PasswordGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPassword?: (value: string) => void;
  initialMode?: GeneratorTab;
}

export const PasswordGeneratorModal: React.FC<PasswordGeneratorModalProps> = ({
  isOpen,
  onClose,
  onSelectPassword,
  initialMode = 'password',
}) => {
  // Mode selection
  const [activeTab, setActiveTab] = useState<GeneratorTab>(initialMode);

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
      setActiveTab(initialMode);
    }
  }, [isOpen, initialMode]);

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

  const generate = () => {
    setIsRotating(true);
    setTimeout(() => setIsRotating(false), 300);

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
  ]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSelectButtonLabel = () => {
    if (activeTab === 'username') return 'Use This Username';
    if (activeTab === 'email') return 'Use This Email';
    return 'Use This Password';
  };

  const getSelectButtonIcon = () => {
    if (activeTab === 'username') return <UserCheck size={16} />;
    if (activeTab === 'email') return <Mail size={16} />;
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
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '540px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <KeyRound size={22} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Identity & Credential Generator</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Generated Value Preview Box */}
        <div
          style={{
            position: 'relative',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid var(--border-glow)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: generatedValue.length > 32 ? '0.85rem' : generatedValue.length > 22 ? '1.02rem' : '1.18rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              wordBreak: 'break-all',
              userSelect: 'all',
              letterSpacing: activeTab === 'password' ? '0.04em' : '0.01em',
            }}
          >
            {generatedValue}
          </span>

          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={generate}
              className="btn btn-ghost"
              style={{ padding: '8px', transition: 'transform 0.3s ease', transform: isRotating ? 'rotate(180deg)' : 'none' }}
              title="Regenerate"
            >
              <RefreshCw size={18} />
            </button>
            <button onClick={handleCopy} className="btn btn-primary" style={{ padding: '8px 12px' }} title="Copy to clipboard">
              {copied ? <Check size={18} color="var(--accent-emerald)" /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        {/* Strength & Entropy Indicator (Only for Password & Passphrase) */}
        {(activeTab === 'password' || activeTab === 'passphrase') ? (
          <div style={{ marginBottom: '18px' }}>
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
        ) : activeTab === 'username' ? (
          /* Info pill for Username */
          <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(96, 165, 250, 0.1)', border: '1px solid rgba(96, 165, 250, 0.25)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: '#93c5fd' }}>
            <Info size={15} style={{ flexShrink: 0 }} />
            <span>
              <strong>{IDENTITY_ADJECTIVES.length} Adjectives × {IDENTITY_NOUNS.length} Nouns</strong> (17.9M+ combos). 100% separate from vault passcode words.
            </span>
          </div>
        ) : (
          /* Info pill for Email */
          <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: '#6ee7b7' }}>
            <Info size={15} style={{ flexShrink: 0 }} />
            <span>
              {emailMode === 'plus'
                ? 'Plus-addressing delivers all mail to your real inbox while tracking data leaks or spam.'
                : 'Generates a disposable handle tag with your chosen email service domain.'}
            </span>
          </div>
        )}

        {/* Generator Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Mode Selector Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', background: 'rgba(255, 255, 255, 0.05)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
            {[
              { id: 'password', label: 'Password', icon: <Sliders size={13} /> },
              { id: 'passphrase', label: 'Passphrase', icon: <Type size={13} /> },
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
                    padding: '6px 4px',
                    minHeight: '32px',
                    gap: '5px',
                    background: active ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={avoidAmbiguous}
                    onChange={(e) => setAvoidAmbiguous(e.target.checked)}
                  />
                  <span>
                    Avoid Ambiguous Characters{' '}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      (no I, l, 1, O, 0, |)
                    </span>
                  </span>
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
          {onSelectPassword && (
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
