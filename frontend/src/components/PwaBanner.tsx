import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_INSTALL_KEY = 'onestop_pwa_install_dismissed';

export const PwaBanner: React.FC = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [installDismissed, setInstallDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_INSTALL_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as { standalone?: boolean }).standalone);

    const handleBeforeInstall = (e: Event) => {
      if (isStandalone) return;
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          if (reg.waiting && navigator.serviceWorker.controller) {
            setWaitingWorker(reg.waiting);
          }

          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(installing);
              }
            });
          });
        })
        .catch((err) => {
          console.warn('PWA ServiceWorker registration failed:', err);
        });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const handleDismissInstall = () => {
    setInstallDismissed(true);
    try {
      localStorage.setItem(DISMISS_INSTALL_KEY, '1');
    } catch {
      // ignore
    }
  };

  const handleReloadUpdate = () => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  if (waitingWorker) {
    return (
      <div
        role="status"
        style={{
          position: 'fixed',
          bottom: '1.25rem',
          right: '1.25rem',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          borderRadius: '12px',
          background: 'rgba(18, 18, 22, 0.96)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5)',
          color: '#f4f4f5',
          fontSize: '0.85rem',
          maxWidth: 'calc(100vw - 2.5rem)',
        }}
      >
        <RefreshCw size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
        <span>New version ready for offline &amp; security updates.</span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleReloadUpdate}
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setWaitingWorker(null)}
          aria-label="Dismiss update notification"
          style={{
            background: 'none',
            border: 'none',
            color: '#a1a1aa',
            cursor: 'pointer',
            padding: '0.2rem',
            display: 'flex',
          }}
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  if (installPrompt && !installDismissed) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '1.25rem',
          right: '1.25rem',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          borderRadius: '12px',
          background: 'rgba(18, 18, 22, 0.96)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5)',
          color: '#f4f4f5',
          fontSize: '0.85rem',
          maxWidth: 'calc(100vw - 2.5rem)',
        }}
      >
        <Download size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
        <span>Install OneStop Vault for offline access</span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleInstallClick}
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
        >
          Install
        </button>
        <button
          type="button"
          onClick={handleDismissInstall}
          aria-label="Dismiss install prompt"
          style={{
            background: 'none',
            border: 'none',
            color: '#a1a1aa',
            cursor: 'pointer',
            padding: '0.2rem',
            display: 'flex',
          }}
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return null;
};

