import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  KeyRound,
  Fingerprint,
  Clock,
  Check,
  AlertCircle,
  Trash2,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import {
  hasQuickPin,
  setupQuickPin,
  removeQuickPin,
  hasBiometrics,
  setupBiometrics,
  removeBiometrics,
  isBiometricsAvailable,
  getAutoLockMinutes,
  setAutoLockMinutes,
  getLockOnBlur,
  setLockOnBlur,
} from '../crypto/quickUnlock.js';
import { deriveMasterKeys } from '../crypto/keyDerivation.js';
import { UserSession } from '../types/vault.js';

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession;
  onUpdateSession?: (session: UserSession) => void;
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  isOpen,
  onClose,
  session,
  onUpdateSession,
}) => {
  // PIN state
  const [pinEnabled, setPinEnabled] = useState<boolean>(false);
  const [showPinSetup, setShowPinSetup] = useState<boolean>(false);
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<boolean>(false);

  // Biometrics state
  const [bioSupported, setBioSupported] = useState<boolean>(false);
  const [bioEnabled, setBioEnabled] = useState<boolean>(false);
  const [bioLoading, setBioLoading] = useState<boolean>(false);
  const [bioError, setBioError] = useState<string | null>(null);

  // Auto-lock state
  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(5);
  const [lockOnBlur, setLockOnBlurState] = useState<boolean>(false);

  // In-modal key authorization (if key was not extractable from legacy login)
  const [authPassword, setAuthPassword] = useState<string>('');
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<boolean>(false);

  const isKeyExtractable = session.vaultKey.extractable;

  useEffect(() => {
    if (isOpen) {
      setPinEnabled(hasQuickPin());
      setBioEnabled(hasBiometrics());
      setAutoLockMinutesState(getAutoLockMinutes());
      setLockOnBlurState(getLockOnBlur());
      setBioError(null);
      setPinError(null);

      isBiometricsAvailable().then(avail => {
        setBioSupported(avail);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle one-time key upgrade authorization
  const handleAuthorizeKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthorizing(true);
    try {
      const { vaultKey, authKeyHash } = await deriveMasterKeys(authPassword, session.user.salt);
      if (authKeyHash !== session.authKeyHash) {
        throw new Error('Incorrect Master Password');
      }

      const updatedSession: UserSession = {
        ...session,
        vaultKey,
      };

      onUpdateSession?.(updatedSession);
      setAuthSuccess(true);
      setAuthPassword('');
      setTimeout(() => setAuthSuccess(false), 3000);
    } catch (err: any) {
      setAuthError(err.message || 'Authorization failed');
    } finally {
      setIsAuthorizing(false);
    }
  };

  // Handle PIN save
  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    if (!session.vaultKey.extractable) {
      setPinError('Please authorize your Master Password above to enable Quick PIN.');
      return;
    }

    if (newPin.length < 4 || newPin.length > 8) {
      setPinError('PIN must be between 4 and 8 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match');
      return;
    }

    try {
      await setupQuickPin(newPin, session.vaultKey);
      setPinEnabled(true);
      setShowPinSetup(false);
      setNewPin('');
      setConfirmPin('');
      setPinSuccess(true);
      setTimeout(() => setPinSuccess(false), 2500);
    } catch (err: any) {
      setPinError(err.message || 'Failed to set up PIN');
    }
  };

  const handleRemovePin = () => {
    removeQuickPin();
    setPinEnabled(false);
    setShowPinSetup(false);
  };

  // Handle Biometric toggle
  const handleEnableBiometrics = async () => {
    setBioError(null);

    if (!session.vaultKey.extractable) {
      setBioError('Please authorize your Master Password above to enable Biometrics.');
      return;
    }

    setBioLoading(true);
    try {
      await setupBiometrics(session.user.email, session.vaultKey);
      setBioEnabled(true);
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setBioError(err.message || 'Biometric enrollment failed');
      }
    } finally {
      setBioLoading(false);
    }
  };

  const handleRemoveBiometrics = () => {
    removeBiometrics();
    setBioEnabled(false);
  };

  // Handle Auto-lock change
  const handleAutoLockChange = (mins: number) => {
    setAutoLockMinutesState(mins);
    setAutoLockMinutes(mins);
  };

  const handleLockOnBlurChange = (val: boolean) => {
    setLockOnBlurState(val);
    setLockOnBlur(val);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
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
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={22} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Security & Quick Unlock</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* ──────────────── Key Upgrade Authorization Banner (if legacy session) ──────────────── */}
          {!isKeyExtractable && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-amber)', marginBottom: '6px', fontWeight: 600, fontSize: '0.9rem' }}>
                <ShieldAlert size={18} />
                <span>One-Time Authorization Required</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
                Enter your Master Password once below to authorize Quick Unlock key wrapping for this session:
              </p>
              <form onSubmit={handleAuthorizeKey} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  placeholder="Enter Master Password"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  className="input-field"
                  style={{
                    flex: 1,
                    minHeight: '38px',
                    padding: '8px 12px',
                    fontSize: '0.9rem',
                    background: 'rgba(15, 23, 42, 0.95)',
                  }}
                  required
                />
                <button
                  type="submit"
                  disabled={isAuthorizing || !authPassword}
                  className="btn btn-primary"
                  style={{ minHeight: '38px', padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  {isAuthorizing ? 'Authorizing...' : 'Authorize'}
                </button>
              </form>
              {authError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-rose)', fontSize: '0.8rem', marginTop: '8px' }}>
                  <AlertCircle size={14} /> {authError}
                </div>
              )}
            </div>
          )}

          {authSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
              <Check size={16} /> Session key authorized! You can now enable Quick PIN and Biometrics below.
            </div>
          )}

          {/* ──────────────── Quick PIN Section ──────────────── */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={18} color="var(--accent-primary)" />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Quick PIN Unlock</span>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  background: pinEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                  color: pinEnabled ? 'var(--accent-emerald)' : 'var(--text-dim)',
                  fontWeight: 600,
                }}
              >
                {pinEnabled ? 'Configured' : 'Disabled'}
              </span>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
              Unlock the vault quickly using a 4 to 8 digit numeric PIN. Protected with PBKDF2 key wrapping and auto-wipe after 5 failed tries.
            </p>

            {pinSuccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-emerald)', fontSize: '0.8rem', marginBottom: '12px' }}>
                <Check size={14} /> Quick PIN successfully updated!
              </div>
            )}

            {!showPinSetup ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowPinSetup(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                >
                  {pinEnabled ? 'Change PIN' : 'Set Up Quick PIN'}
                </button>
                {pinEnabled && (
                  <button
                    type="button"
                    onClick={handleRemovePin}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.8rem', color: 'var(--accent-rose)', padding: '6px 12px' }}
                  >
                    <Trash2 size={14} /> Remove PIN
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleSavePin} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="input-label" style={{ fontSize: '0.75rem', marginBottom: '4px', display: 'block' }}>Enter 4-8 Digit PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      placeholder="e.g. 7492"
                      value={newPin}
                      onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                      className="input-field mono"
                      style={{
                        background: 'rgba(15, 23, 42, 0.9)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        padding: '10px 14px',
                        fontSize: '1rem',
                        letterSpacing: '0.15em',
                      }}
                      required
                    />
                  </div>
                  <div>
                    <label className="input-label" style={{ fontSize: '0.75rem', marginBottom: '4px', display: 'block' }}>Confirm PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      placeholder="Repeat PIN"
                      value={confirmPin}
                      onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                      className="input-field mono"
                      style={{
                        background: 'rgba(15, 23, 42, 0.9)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        padding: '10px 14px',
                        fontSize: '1rem',
                        letterSpacing: '0.15em',
                      }}
                      required
                    />
                  </div>
                </div>

                {pinError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-rose)', fontSize: '0.8rem' }}>
                    <AlertCircle size={14} /> {pinError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button type="submit" className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '8px 18px', minHeight: '36px' }}>
                    <Check size={15} /> Save PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowPinSetup(false); setPinError(null); }}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.85rem', padding: '8px 14px', minHeight: '36px' }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* ──────────────── Biometrics Section ──────────────── */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Fingerprint size={18} color="var(--accent-primary)" />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Biometric Unlock</span>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  background: bioEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                  color: bioEnabled ? 'var(--accent-emerald)' : 'var(--text-dim)',
                  fontWeight: 600,
                }}
              >
                {bioEnabled ? 'Enabled' : bioSupported ? 'Available' : 'Unsupported'}
              </span>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
              Unlock using device biometrics (Fingerprint on Android/Mac, Face ID on iPhone/iPad, or Windows Hello on PC).
            </p>

            {bioSupported ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {!bioEnabled ? (
                  <button
                    type="button"
                    onClick={handleEnableBiometrics}
                    disabled={bioLoading}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Fingerprint size={15} />
                    <span>{bioLoading ? 'Enrolling...' : 'Enable Device Biometrics'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRemoveBiometrics}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.8rem', color: 'var(--accent-rose)', padding: '6px 12px' }}
                  >
                    <Trash2 size={14} /> Disable Biometrics
                  </button>
                )}
              </div>
            ) : (
              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-dim)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}
              >
                Platform biometrics is not available in this browser or device. Quick PIN is recommended for fast unlock.
              </div>
            )}

            {bioError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-rose)', fontSize: '0.8rem', marginTop: '10px' }}>
                <AlertCircle size={14} /> {bioError}
              </div>
            )}
          </div>

          {/* ──────────────── Auto-Lock Section ──────────────── */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Clock size={18} color="var(--accent-primary)" />
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Auto-Lock Inactivity Timeout</span>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
              Automatically lock the vault and clear decrypted keys from browser memory after inactivity.
            </p>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {[
                { label: '1 min', mins: 1 },
                { label: '5 mins', mins: 5 },
                { label: '15 mins', mins: 15 },
                { label: '30 mins', mins: 30 },
                { label: 'Never', mins: 0 },
              ].map(opt => (
                <button
                  key={opt.mins}
                  type="button"
                  onClick={() => handleAutoLockChange(opt.mins)}
                  className="btn"
                  style={{
                    flex: '1 1 auto',
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    minHeight: '34px',
                    background: autoLockMinutes === opt.mins ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.05)',
                    color: autoLockMinutes === opt.mins ? '#000000' : 'var(--text-main)',
                    fontWeight: autoLockMinutes === opt.mins ? 600 : 400,
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Lock on blur toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={lockOnBlur}
                onChange={e => handleLockOnBlurChange(e.target.checked)}
                style={{ accentColor: 'var(--accent-primary)' }}
              />
              <span>Lock immediately when tab loses focus or is minimized</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
