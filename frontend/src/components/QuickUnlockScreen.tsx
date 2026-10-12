import React, { useState, useEffect } from 'react';
import { Shield, Lock, Fingerprint, Delete, ArrowRight, AlertCircle, LogOut, KeyRound } from 'lucide-react';
import {
  hasQuickPin,
  hasBiometrics,
  unlockWithPin,
  unlockWithBiometrics,
  getLockedSessionMeta,
} from '../crypto/quickUnlock.js';

interface QuickUnlockScreenProps {
  onUnlocked: (vaultKey: CryptoKey) => void;
  onSwitchToPassword: () => void;
  onFullLogout: () => void;
}

export const QuickUnlockScreen: React.FC<QuickUnlockScreenProps> = ({
  onUnlocked,
  onSwitchToPassword,
  onFullLogout,
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [shake, setShake] = useState<boolean>(false);

  const pinEnabled = hasQuickPin();
  const bioEnabled = hasBiometrics();
  const sessionMeta = getLockedSessionMeta();

  // Try biometric unlock
  const handleBiometricUnlock = async () => {
    setError(null);
    setLoading(true);
    try {
      const key = await unlockWithBiometrics();
      onUnlocked(key);
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setError(err.message || 'Biometric authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-prompt biometrics once on screen mount if enabled and no PIN is entered yet
  useEffect(() => {
    if (bioEnabled) {
      handleBiometricUnlock();
    }
  }, []);

  // Handle PIN submission
  const submitPin = async (inputPin: string) => {
    if (inputPin.length < 4) return;
    setError(null);
    setLoading(true);
    try {
      const key = await unlockWithPin(inputPin);
      onUnlocked(key);
    } catch (err: any) {
      setError(err.message || 'Incorrect PIN');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  // Keyboard support for physical keyboards (Desktop)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pinEnabled) return;

      if (/^[0-9]$/.test(e.key)) {
        if (pin.length < 8) {
          const next = pin + e.key;
          setPin(next);
        }
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        if (pin.length >= 4) {
          submitPin(pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, pinEnabled]);

  const handleNumpadPress = (digit: string) => {
    if (pin.length < 8) {
      setPin(prev => prev + digit);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-primary)',
        backgroundImage: 'radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.08) 0%, transparent 60%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 9999,
      }}
    >
      <div
        className={`glass-panel animate-fade-in ${shake ? 'shake' : ''}`}
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)',
        }}
      >
        {/* Brand Icon */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--border-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <Lock size={28} color="var(--accent-primary)" />
        </div>

        <h2 style={{ fontSize: '1.4rem', margin: '0 0 4px', fontWeight: 700 }}>
          Vault Locked
        </h2>

        {sessionMeta && (
          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              marginBottom: '20px',
              wordBreak: 'break-all',
            }}
          >
            {sessionMeta.user.email}
          </p>
        )}

        {/* Biometrics Quick Action Button */}
        {bioEnabled && (
          <button
            onClick={handleBiometricUnlock}
            disabled={loading}
            className="btn btn-secondary"
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: pinEnabled ? '20px' : '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontSize: '0.9rem',
              background: 'rgba(255, 255, 255, 0.06)',
              borderColor: 'var(--border-glow)',
            }}
          >
            <Fingerprint size={20} color="var(--accent-primary)" />
            <span>Unlock with Biometrics</span>
          </button>
        )}

        {/* PIN Pad */}
        {pinEnabled && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {bioEnabled && (
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>or enter pin</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
              </div>
            )}

            {/* PIN Dots Display */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '20px',
                height: '24px',
                alignItems: 'center',
              }}
            >
              {[0, 1, 2, 3, 4, 5].map(idx => (
                <div
                  key={idx}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    border: '1.5px solid var(--border-glow)',
                    background: pin.length > idx ? 'var(--accent-primary)' : 'transparent',
                    transition: 'all 0.15s ease',
                    boxShadow: pin.length > idx ? '0 0 8px rgba(255, 255, 255, 0.5)' : 'none',
                  }}
                />
              ))}
            </div>

            {/* Interactive Numpad */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                width: '100%',
                maxWidth: '260px',
                marginBottom: '16px',
              }}
            >
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleNumpadPress(digit)}
                  className="btn"
                  style={{
                    height: '52px',
                    borderRadius: '50%',
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  {digit}
                </button>
              ))}

              {/* Bottom row: Clear / Backspace, 0, Enter */}
              <button
                type="button"
                onClick={handleBackspace}
                className="btn btn-ghost"
                style={{
                  height: '52px',
                  borderRadius: '50%',
                  color: 'var(--text-muted)',
                }}
                title="Backspace"
              >
                <Delete size={20} />
              </button>

              <button
                type="button"
                onClick={() => handleNumpadPress('0')}
                className="btn"
                style={{
                  height: '52px',
                  borderRadius: '50%',
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderColor: 'var(--border-color)',
                }}
              >
                0
              </button>

              <button
                type="button"
                onClick={() => submitPin(pin)}
                disabled={pin.length < 4 || loading}
                className="btn btn-primary"
                style={{
                  height: '52px',
                  borderRadius: '50%',
                  padding: 0,
                  opacity: pin.length >= 4 ? 1 : 0.4,
                }}
                title="Unlock"
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--accent-rose)',
              fontSize: '0.8rem',
              marginBottom: '16px',
              background: 'rgba(244, 63, 94, 0.1)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Switch to Master Password Screen */}
        <button
          type="button"
          onClick={onSwitchToPassword}
          className="btn btn-secondary"
          style={{
            width: '100%',
            fontSize: '0.85rem',
            padding: '10px 14px',
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'var(--border-color)',
          }}
        >
          <KeyRound size={15} color="var(--accent-primary)" />
          <span>Unlock with Master Password</span>
        </button>

        {/* Sign Out / Switch Account */}
        <button
          type="button"
          onClick={onFullLogout}
          className="btn btn-ghost"
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-dim)',
            padding: '6px',
            marginTop: '8px',
            gap: '6px',
          }}
        >
          <LogOut size={13} />
          <span>Sign Out / Switch Account</span>
        </button>
      </div>
    </div>
  );
};
