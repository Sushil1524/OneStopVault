/**
 * Cloudflare Worker API Client Wrapper
 */

const API_BASE_URL = (import.meta as any).env?.VITE_WORKER_API_URL || 'http://localhost:8787';

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

  static async getVaultStatus(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/vault/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch vault status');
    }
    return data as { version: number; checksum: string; updatedAt: number };
  }

  static async getVaultItems(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/vault/items`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch vault items');
    }
    return data as {
      items: Array<{
        id: string;
        ciphertext: string;
        iv: string;
        itemType: string;
        createdAt: number;
        updatedAt: number;
      }>;
      metadata: { version: number; checksum: string; updatedAt: number };
    };
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

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save item');
    }
    return data;
  }

  static async deleteVaultItem(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/vault/items/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to delete item');
    }
    return data;
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

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Batch sync failed');
    }
    return data;
  }
}
