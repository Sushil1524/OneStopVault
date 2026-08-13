import React, { useState } from 'react';
import { X, Upload, FileText, Lock, ShieldCheck, CheckCircle2, AlertTriangle, KeyRound, Clock, Sparkles } from 'lucide-react';
import { parseImportFile, ImportResultItem } from '../crypto/importers/importer.js';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (items: ImportResultItem[]) => Promise<void>;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImportSuccess }) => {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [filePassword, setFilePassword] = useState<string>('');
  const [requiresPassword, setRequiresPassword] = useState<boolean>(false);

  const [formatName, setFormatName] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<ImportResultItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const [parsing, setParsing] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    setError(null);
    setParsing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
      await analyzeContent(content, '');
      setParsing(false);
    };
    reader.onerror = () => {
      setError('Failed to read selected file');
      setParsing(false);
    };
    reader.readAsText(file);
  };

  const analyzeContent = async (content: string, password: string) => {
    setError(null);
    const outcome = await parseImportFile(content, password);

    if (outcome.requiresPassword && !password) {
      setRequiresPassword(true);
      setFormatName(outcome.formatName || 'Encrypted Backup File');
      setParsedItems([]);
      return;
    }

    if (outcome.error) {
      setError(outcome.error);
      if (!password) setParsedItems([]);
      return;
    }

    setRequiresPassword(false);
    setFormatName(outcome.formatName || 'Vault Backup');
    const items = outcome.items || [];
    setParsedItems(items);
    // Select all parsed items by default
    setSelectedIndices(new Set(items.map((_, i) => i)));
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileContent || !filePassword) return;
    setParsing(true);
    await analyzeContent(fileContent, filePassword);
    setParsing(false);
  };

  const toggleItemSelection = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleExecuteImport = async () => {
    const itemsToImport = parsedItems.filter((_, idx) => selectedIndices.has(idx));
    if (itemsToImport.length === 0) return;

    setImporting(true);
    try {
      await onImportSuccess(itemsToImport);
      handleReset();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to import items');
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFileContent(null);
    setFileName('');
    setFilePassword('');
    setRequiresPassword(false);
    setFormatName(null);
    setParsedItems([]);
    setSelectedIndices(new Set());
    setError(null);
  };

  return (
    <div
      onClick={() => {
        handleReset();
        onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '680px',
          padding: '28px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Upload size={22} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Import Vault Credentials & 2FA Keys</h2>
          </div>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="btn btn-ghost"
            style={{ padding: '6px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Security Assurance Banner */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-color)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <ShieldCheck size={16} color="var(--accent-emerald)" />
          <span>
            <strong style={{ color: '#fff' }}>100% Client-Side Local Import:</strong> Files and decryption passwords never leave your browser. Zero network requests are made until items are re-encrypted with your master key.
          </span>
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
              marginBottom: '16px',
            }}
          >
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: File Dropzone (if no file loaded) */}
        {!fileContent && (
          <div
            style={{
              border: '2px dashed var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '40px 20px',
              textAlign: 'center',
              background: 'rgba(18, 18, 20, 0.6)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onClick={() => document.getElementById('import-file-input')?.click()}
          >
            <Upload size={36} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px' }}>Click or Drop Backup File to Import</h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-dim)', maxWidth: '440px', margin: '0 auto 16px' }}>
              Supports Chrome/Firefox/Brave CSVs, Bitwarden JSON, 1Password, 2FAS Authenticator, Aegis Authenticator (.enc, .2fas, .json, .csv, .kv, .aegis)
            </p>
            <input
              id="import-file-input"
              type="file"
              accept=".json,.csv,.2fas,.enc,.encrypt,.kv,.aegis,.txt"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
              Select File
            </button>
          </div>
        )}

        {/* Step 2: Decryption Password Prompt if backup is encrypted */}
        {fileContent && requiresPassword && (
          <form onSubmit={handlePasswordSubmit} style={{ padding: '20px', background: 'rgba(18, 18, 20, 0.9)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <Lock size={20} color="var(--accent-amber)" />
              <div>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Password Protected File Detected</h3>
                <span className="badge badge-warning" style={{ fontSize: '0.65rem', marginTop: '2px' }}>
                  {formatName}
                </span>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              File <strong style={{ color: '#fff' }}>{fileName}</strong> is encrypted. Enter the backup password to decrypt it locally in browser RAM:
            </p>
            <div className="input-group">
              <input
                type="password"
                required
                placeholder="Enter file decryption password"
                className="input-field mono"
                value={filePassword}
                onChange={(e) => setFilePassword(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
              <button type="button" onClick={handleReset} className="btn btn-ghost">
                Choose Different File
              </button>
              <button type="submit" disabled={parsing} className="btn btn-primary">
                {parsing ? 'Decrypting Locally...' : 'Decrypt & Inspect File'}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Parsed Items Preview Table & Selector */}
        {fileContent && !requiresPassword && parsedItems.length > 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <span className="badge badge-info" style={{ fontSize: '0.7rem', marginRight: '8px' }}>
                  {formatName}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Found <strong style={{ color: '#fff' }}>{parsedItems.length}</strong> entries in {fileName}
                </span>
              </div>
              <button onClick={handleReset} className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                Change File
              </button>
            </div>

            {/* Scrollable Table */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(9, 9, 11, 0.8)',
                marginBottom: '16px',
              }}
            >
              {parsedItems.map((item, idx) => {
                const isSelected = selectedIndices.has(idx);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleItemSelection(idx)}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemSelection(idx)}
                        style={{ cursor: 'pointer', accentColor: '#ffffff' }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'flex', gap: '8px' }}>
                          {item.username && <span>{item.username}</span>}
                          {item.url && <span>• {item.url}</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {item.password && <span title="Password included"><KeyRound size={14} color="var(--text-muted)" /></span>}
                      {item.totpSecret && (
                        <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                          <Clock size={11} /> 2FA TOTP
                        </span>
                      )}
                      {item.tags?.map((t) => (
                        <span key={t} className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Selected: <strong style={{ color: '#fff' }}>{selectedIndices.size}</strong> / {parsedItems.length}
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={handleReset} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={importing || selectedIndices.size === 0}
                  onClick={handleExecuteImport}
                  className="btn btn-primary"
                >
                  {importing ? 'Encrypting & Saving...' : `Import ${selectedIndices.size} Items into Vault`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
