import React, { useState } from 'react';
import { Shield, KeyRound, ArrowRight, Download, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { generateSalt, deriveMasterKeys } from '../crypto/keyDerivation.js';
import { WorkerClient } from '../api/workerClient.js';
import { UserSession } from '../types/vault.js';

interface AuthScreenProps {
  onAuthenticated: (session: UserSession) => void;
  onOpenGenerator: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated, onOpenGenerator }) => {
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [masterPassword, setMasterPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Recovery Key Modal state
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<UserSession | null>(null);

  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (pass.length >= 14) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) return { label: 'Weak', color: 'var(--accent-rose)', width: '25%' };
    if (score === 3) return { label: 'Moderate', color: 'var(--accent-amber)', width: '50%' };
    if (score === 4) return { label: 'Strong', color: 'var(--accent-primary)', width: '75%' };
    return { label: 'Excellent', color: 'var(--accent-emerald)', width: '100%' };
  };

  const strength = getPasswordStrength(masterPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (masterPassword !== confirmPassword) {
          throw new Error('Master passwords do not match');
        }
        if (masterPassword.length < 8) {
          throw new Error('Master password must be at least 8 characters long');
        }

        // 1. Generate client salt
        const salt = generateSalt();

        // 2. Derive Vault Key & Auth Key Hash via PBKDF2 (600,000 iterations)
        const { vaultKey, authKeyHash } = await deriveMasterKeys(masterPassword, salt);

        // 3. Register user with Worker API
        const res = await WorkerClient.register(email, authKeyHash, salt);

        const session: UserSession = {
          token: res.token,
          user: res.user,
          vaultKey,
          authKeyHash,
        };

        // Generate emergency recovery key
        const recKey = `${salt.substring(0, 8)}-${authKeyHash.substring(0, 16)}-RECOVERY`;
        setRecoveryKey(recKey);
        setPendingSession(session);
      } else {
        // 1. Fetch user's salt from Worker API
        const salt = await WorkerClient.getSalt(email);

        // 2. Derive Vault Key & Auth Key Hash locally
        const { vaultKey, authKeyHash } = await deriveMasterKeys(masterPassword, salt);

        // 3. Login with Worker API
        const res = await WorkerClient.login(email, authKeyHash);

        const session: UserSession = {
          token: res.token,
          user: res.user,
          vaultKey,
          authKeyHash,
        };

        onAuthenticated(session);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadRecoveryKey = () => {
    if (!recoveryKey || !pendingSession) return;
    const blob = new Blob(
      [
        `===================================================\n` +
        `ONESTOP VAULT EMERGENCY RECOVERY KEY\n` +
        `===================================================\n\n` +
        `Account Email: ${pendingSession.user.email}\n` +
        `Account Salt: ${pendingSession.user.salt}\n` +
        `Recovery Key: ${recoveryKey}\n\n` +
        `KEEP THIS FILE SECURE AND OFFLINE.\n` +
        `If you forget your Master Password, vault contents cannot be decrypted without your keys.\n`
      ],
      { type: 'text/plain;charset=utf-8' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `onestop-vault-recovery-${pendingSession.user.email.replace(/[^a-z0-9]/gi, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);

    // Proceed into application
    onAuthenticated(pendingSession);
  };

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 70px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '28px 20px',
          position: 'relative',
        }}
      >
        {/* Glow ambient accent */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '200px',
            height: '200px',
            background: 'var(--gradient-glow)',
            pointerEvents: 'none',
            borderRadius: '50%',
          }}
        />

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'var(--gradient-accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
              marginBottom: '16px',
            }}
          >
            <Shield size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '6px' }}>
            {isRegister ? 'Create Your Vault' : 'Unlock Your Vault'}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {isRegister
              ? 'Zero-knowledge encryption derived on your device.'
              : 'Enter your Master Password to decrypt locally.'}
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: 'var(--accent-rose)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Email Address</label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Master Password</label>
            <input
              type="password"
              required
              placeholder="••••••••••••••••"
              className="input-field mono"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
            />
            {isRegister && masterPassword && (
              <div style={{ marginTop: '6px' }}>
                <div
                  style={{
                    height: '4px',
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: strength.width,
                      background: strength.color,
                      transition: 'all 0.3s ease',
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: strength.color, marginTop: '4px', textAlign: 'right' }}>
                  Strength: {strength.label}
                </div>
              </div>
            )}
          </div>

          {isRegister && (
            <div className="input-group">
              <label className="input-label">Confirm Master Password</label>
              <input
                type="password"
                required
                placeholder="••••••••••••••••"
                className="input-field mono"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', marginTop: '12px', fontSize: '0.95rem' }}
          >
            {loading ? (
              <span>Deriving PBKDF2 Keys (600k rounds)...</span>
            ) : (
              <>
                <span>{isRegister ? 'Create Vault & Generate Salt' : 'Unlock Vault'}</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="btn btn-ghost"
            style={{ fontSize: '0.85rem' }}
          >
            {isRegister ? 'Already have a vault? Log In' : "Don't have a vault yet? Sign Up"}
          </button>

          {/* Quick Access Generator Button on Auth Screen */}
          <button
            type="button"
            onClick={onOpenGenerator}
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem', width: '100%', marginTop: '8px' }}
          >
            <KeyRound size={16} />
            <span>Generate Password (No Account Needed)</span>
          </button>
        </div>

        {/* Recovery Key Download Modal */}
        {recoveryKey && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(8px)',
              zIndex: 110,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <div
              className="glass-panel animate-fade-in"
              style={{ width: '100%', maxWidth: '480px', padding: '28px', textAlign: 'center' }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: 'var(--accent-emerald)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}
              >
                <CheckCircle2 size={24} />
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Vault Created Successfully!</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Save your Emergency Recovery Key. Because your Master Password never leaves your device, this file is your only backup if you forget your password.
              </p>

              <div
                style={{
                  padding: '14px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px border-glow',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '20px',
                }}
              >
                <span className="mono" style={{ fontSize: '0.9rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                  {recoveryKey}
                </span>
              </div>

              <button onClick={handleDownloadRecoveryKey} className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
                <Download size={18} />
                Download Emergency Key & Open Vault
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
