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
          style={{ cursor: 'pointer' }}
          title="Local and Cloudflare D1 checksums match perfectly. Click to re-verify."
        >
          <CheckCircle2 size={13} />
          <span>In Sync</span>
        </div>
      );
    case 'SYNCING':
      return (
        <div className="badge badge-info animate-pulse" title="Synchronizing ciphertext with Cloudflare Worker...">
          <RefreshCw size={13} className="animate-spin" />
          <span>Syncing...</span>
        </div>
      );
    case 'MISMATCH':
      return (
        <div
          onClick={onManualSync}
          className="badge badge-warning animate-pulse"
          style={{ cursor: 'pointer' }}
          title="Checksum mismatch detected between local storage and Cloudflare D1. Click to resolve."
        >
          <AlertTriangle size={13} />
          <span>Reconciling...</span>
        </div>
      );
    case 'OFFLINE':
      return (
        <div className="badge badge-warning" title="Operating in local offline cache mode.">
          <WifiOff size={13} />
          <span>Offline Mode</span>
        </div>
      );
    case 'ERROR':
      return (
        <div
          onClick={onManualSync}
          className="badge badge-danger"
          style={{ cursor: 'pointer' }}
          title="Sync error encountered. Click to retry."
        >
          <AlertTriangle size={13} />
          <span>Sync Retry</span>
        </div>
      );
    default:
      return null;
  }
};
