/**
 * Cloudflare Worker API Client Wrapper
 */

const API_BASE_URL = (import.meta as any).env?.VITE_WORKER_API_URL || 'http://localhost:8787';

export class AuthRevokedError extends Error {
  constructor(message = 'Session expired or revoked. Please sign in again.') {
    super(message);
    this.name = 'AuthRevokedError';
  }
}

async function handleProtectedResponse(res: Response, fallbackMsg: string) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new AuthRevokedError(data.error || 'Session expired or revoked. Please sign in again.');
  }
  if (!res.ok) {
    throw new Error(data.error || fallbackMsg);
  }
  return data;
}

export class WorkerClient {
  static async register(email: string, authHash: string, salt: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, authHash, salt }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    return data;
  }

  static async getSalt(email: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/salt?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to retrieve salt');
    }
    return data.salt as string;
  }

  static async login(email: string, authHash: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, authHash }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }
    return data;
  }

  static async revokeAllSessions(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/revoke-sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleProtectedResponse(res, 'Failed to revoke sessions') as Promise<{
      success: boolean;
      tokenVersion: number;
      message: string;
    }>;
  }

  static async deleteAccount(token: string, authHash: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ authHash }),
    });
    return handleProtectedResponse(res, 'Failed to delete account') as Promise<{
      success: boolean;
      message: string;
    }>;
  }

  static async getVaultStatus(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/vault/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleProtectedResponse(res, 'Failed to fetch vault status') as Promise<{
      version: number;
      checksum: string;
      updatedAt: number;
    }>;
  }

  static async getVaultItems(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/vault/items`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleProtectedResponse(res, 'Failed to fetch vault items') as Promise<{
      items: Array<{
        id: string;
        ciphertext: string;
        iv: string;
        itemType: string;
        createdAt: number;
        updatedAt: number;
      }>;
      metadata: { version: number; checksum: string; updatedAt: number };
    }>;
  }

  static async saveVaultItem(token: string, item: { id: string; ciphertext: string; iv: string; itemType: string }) {
    const res = await fetch(`${API_BASE_URL}/api/vault/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(item),
    });
    return handleProtectedResponse(res, 'Failed to save item');
  }

  static async deleteVaultItem(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/vault/items/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleProtectedResponse(res, 'Failed to delete item');
  }

  static async batchSync(token: string, clientItems: any[], clientChecksum: string) {
    const res = await fetch(`${API_BASE_URL}/api/vault/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ clientItems, clientChecksum }),
    });
    return handleProtectedResponse(res, 'Batch sync failed');
  }
}
