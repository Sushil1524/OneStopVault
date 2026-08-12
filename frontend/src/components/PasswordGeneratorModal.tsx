import React, { useState, useEffect } from 'react';
import { X, Copy, Check, RefreshCw, KeyRound, Sparkles } from 'lucide-react';

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
  const [length, setLength] = useState<number>(18);
  const [useUppercase, setUseUppercase] = useState<boolean>(true);
  const [useLowercase, setUseLowercase] = useState<boolean>(true);
  const [useNumbers, setUseNumbers] = useState<boolean>(true);
  const [useSymbols, setUseSymbols] = useState<boolean>(true);
  const [usePassphrase, setUsePassphrase] = useState<boolean>(false);
  const [generatedPassword, setGeneratedPassword] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const wordList = [
    'cascade', 'horizon', 'glacier', 'quantum', 'solstice', 'nebula', 'phantom',
    'starlight', 'orbit', 'catalyst', 'echo', 'vortex', 'phoenix', 'cipher',
    'titan', 'aurora', 'zenith', 'pulse', 'ember', 'velocity', 'tesseract'
  ];

  const generate = () => {
    if (usePassphrase) {
      const words: string[] = [];
      for (let i = 0; i < 4; i++) {
        const randomIndex = Math.floor(Math.random() * wordList.length);
        words.push(wordList[randomIndex]);
      }
      const num = Math.floor(Math.random() * 90 + 10);
      setGeneratedPassword(`${words.join('-')}-${num}`);
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
  }, [isOpen, length, useUppercase, useLowercase, useNumbers, useSymbols, usePassphrase]);

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
          maxWidth: '480px',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
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
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: generatedPassword.length > 28 ? '0.95rem' : '1.15rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              wordBreak: 'break-all',
            }}
          >
            {generatedPassword}
          </span>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={generate} className="btn btn-ghost" style={{ padding: '8px' }} title="Regenerate">
              <RefreshCw size={18} />
            </button>
            <button onClick={handleCopy} className="btn btn-primary" style={{ padding: '8px 12px' }}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setUsePassphrase(false)}
              className={`btn ${!usePassphrase ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, fontSize: '0.85rem' }}
            >
              Random Password
            </button>
            <button
              onClick={() => setUsePassphrase(true)}
              className={`btn ${usePassphrase ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, fontSize: '0.85rem' }}
            >
              Memorable Passphrase
            </button>
          </div>

          {!usePassphrase ? (
            <>
              {/* Length Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="input-label">Password Length</span>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
                    {length} characters
                  </span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="64"
                  value={length}
                  onChange={(e) => setLength(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                />
              </div>

              {/* Toggles */}
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
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Passphrases combine 4 random dictionary words with numbers. They are easy to remember while remaining cryptographically resilient.
            </p>
          )}

          {onSelectPassword && (
            <button
              onClick={() => {
                onSelectPassword(generatedPassword);
                onClose();
              }}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '8px' }}
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
