import React from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, WifiOff } from 'lucide-react';
import { SyncState } from '../types/vault.js';

interface SyncStatusBadgeProps {
  state: SyncState;
  onManualSync?: () => void;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ state, onManualSync }) => {
  switch (state) {
    case 'IN_SYNC':
      return (
        <div
          onClick={onManualSync}
          className="badge badge-success"
          style={{ cursor: 'pointer', padding: '4px 8px' }}
          title="Local and Cloudflare D1 checksums match. Click to re-verify."
        >
          <CheckCircle2 size={13} />
          <span className="hide-mobile">In Sync</span>
        </div>
      );
    case 'SYNCING':
      return (
        <div className="badge badge-info animate-pulse" style={{ padding: '4px 8px' }} title="Syncing ciphertext with Cloudflare...">
          <RefreshCw size={13} className="animate-spin" />
          <span className="hide-mobile">Syncing...</span>
        </div>
      );
    case 'MISMATCH':
      return (
        <div
          onClick={onManualSync}
          className="badge badge-warning animate-pulse"
          style={{ cursor: 'pointer', padding: '4px 8px' }}
          title="Checksum mismatch detected. Click to resolve."
        >
          <AlertTriangle size={13} />
          <span className="hide-mobile">Reconciling...</span>
        </div>
      );
    case 'OFFLINE':
      return (
        <div className="badge badge-warning" style={{ padding: '4px 8px' }} title="Operating in offline cache mode.">
          <WifiOff size={13} />
          <span className="hide-mobile">Offline</span>
        </div>
      );
    case 'ERROR':
      return (
        <div
          onClick={onManualSync}
          className="badge badge-danger"
          style={{ cursor: 'pointer', padding: '4px 8px' }}
          title="Sync error. Click to retry."
        >
          <AlertTriangle size={13} />
          <span className="hide-mobile">Retry</span>
        </div>
      );
    default:
      return null;
  }
};
