import React, { useState, useEffect, useMemo } from 'react';
import { X, Copy, Check, RefreshCw, KeyRound, Sparkles, ShieldCheck, Sliders, Type } from 'lucide-react';
import { generateSecurePassphrase, calculatePassphraseEntropy, PASSPHRASE_WORDLIST } from '../crypto/wordlist.js';

interface PasswordGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPassword?: (password: string) => void;
}

export const PasswordGeneratorModal: React.FC<PasswordGeneratorModalProps> = ({
  isOpen,
  onClose,
  onSelectPassword,
}) => {
  // Mode selection
  const [usePassphrase, setUsePassphrase] = useState<boolean>(false);

  // Random Password state
  const [length, setLength] = useState<number>(18);
  const [useUppercase, setUseUppercase] = useState<boolean>(true);
  const [useLowercase, setUseLowercase] = useState<boolean>(true);
  const [useNumbers, setUseNumbers] = useState<boolean>(true);
  const [useSymbols, setUseSymbols] = useState<boolean>(true);

  // Passphrase state
  const [wordCount, setWordCount] = useState<number>(4);
  const [separator, setSeparator] = useState<string>('-');
  const [capitalize, setCapitalize] = useState<boolean>(false);
  const [includeNumber, setIncludeNumber] = useState<boolean>(true);

  // Output & UI state
  const [generatedPassword, setGeneratedPassword] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isRotating, setIsRotating] = useState<boolean>(false);

  // Calculate entropy
  const entropy = useMemo(() => {
    if (usePassphrase) {
      return calculatePassphraseEntropy({ wordCount, includeNumber });
    }
    let pool = 0;
    if (useUppercase) pool += 26;
    if (useLowercase) pool += 26;
    if (useNumbers) pool += 10;
    if (useSymbols) pool += 27;
    if (pool === 0) pool = 26;
    return Math.round(length * Math.log2(pool));
  }, [usePassphrase, wordCount, includeNumber, length, useUppercase, useLowercase, useNumbers, useSymbols]);

  const strength = useMemo(() => {
    if (entropy < 36) return { label: 'Weak', color: 'var(--accent-rose)', percent: 25 };
    if (entropy < 54) return { label: 'Moderate', color: 'var(--accent-amber)', percent: 50 };
    if (entropy < 72) return { label: 'Strong', color: 'var(--accent-emerald)', percent: 75 };
    return { label: 'Very Strong', color: '#38bdf8', percent: 100 };
  }, [entropy]);

  const generate = () => {
    setIsRotating(true);
    setTimeout(() => setIsRotating(false), 300);

    if (usePassphrase) {
      const phrase = generateSecurePassphrase({
        wordCount,
        separator,
        capitalize,
        includeNumber,
      });
      setGeneratedPassword(phrase);
      return;
    }

    let charset = '';
    if (useUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (useLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (useNumbers) charset += '0123456789';
    if (useSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!charset) charset = 'abcdefghijklmnopqrstuvwxyz';

    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[array[i] % charset.length];
    }
    setGeneratedPassword(result);
  };

  useEffect(() => {
    if (isOpen) {
      generate();
    }
  }, [
    isOpen,
    length,
    useUppercase,
    useLowercase,
    useNumbers,
    useSymbols,
    usePassphrase,
    wordCount,
    separator,
    capitalize,
    includeNumber,
  ]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <KeyRound size={22} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Password Generator</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Generated Password Box */}
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
              fontSize: generatedPassword.length > 32 ? '0.9rem' : generatedPassword.length > 22 ? '1.05rem' : '1.2rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              wordBreak: 'break-all',
              userSelect: 'all',
              letterSpacing: '0.02em',
            }}
          >
            {generatedPassword}
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

        {/* Strength & Entropy Indicator */}
        <div style={{ marginBottom: '20px' }}>
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

        {/* Generator Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Mode Selector Tabs */}
          <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.05)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
            <button
              onClick={() => setUsePassphrase(false)}
              className="btn"
              style={{
                flex: 1,
                fontSize: '0.85rem',
                minHeight: '34px',
                background: !usePassphrase ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                borderColor: !usePassphrase ? 'var(--border-glow)' : 'transparent',
                color: !usePassphrase ? 'var(--text-main)' : 'var(--text-muted)',
              }}
            >
              <Sliders size={14} /> Random Characters
            </button>
            <button
              onClick={() => setUsePassphrase(true)}
              className="btn"
              style={{
                flex: 1,
                fontSize: '0.85rem',
                minHeight: '34px',
                background: usePassphrase ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                borderColor: usePassphrase ? 'var(--border-glow)' : 'transparent',
                color: usePassphrase ? 'var(--text-main)' : 'var(--text-muted)',
              }}
            >
              <Type size={14} /> Memorable Passphrase
            </button>
          </div>

          {!usePassphrase ? (
            /* Random Character Mode */
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
            </>
          ) : (
            /* Memorable Passphrase Mode */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Word Count Selector */}
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

              {/* Separator Selector */}
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

              {/* Toggles */}
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
                Powered by a curated <strong>2,048-word dictionary</strong> ({PASSPHRASE_WORDLIST.length} words, 11 bits/word) using cryptographic random sampling. High entropy, easy to type, and memorable.
              </div>
            </div>
          )}

          {onSelectPassword && (
            <button
              onClick={() => {
                onSelectPassword(generatedPassword);
                onClose();
              }}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '6px' }}
            >
              <Sparkles size={16} />
              Use This Password
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
