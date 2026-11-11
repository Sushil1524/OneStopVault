/**
 * routes/vault.ts
 * All vault CRUD endpoints — protected by JWT auth middleware at the top.
 *
 * Every item stored here is already encrypted by the client (AES-256-GCM).
 * The server only sees ciphertext it can't read; it just stores and retrieves it.
 * An extra HMAC "pepper" is applied server-side so even a raw DB dump is useless.
 */

import { Hono } from 'hono';
import { Env } from '../types.js';
import { authenticateRequest } from '../crypto/security.js';
import { getVaultItems, getVaultMetadata, upsertVaultItem, deleteVaultItem } from '../db/queries.js';
import { applyServerPepper, verifyAndStripPepper } from '../crypto/pepper.js';

const vaultApp = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// Auth Middleware (verifies JWT signature, expiry, user existence, and token_version)
vaultApp.use('*', async (c, next) => {
  const auth = await authenticateRequest(c);
  if (!auth.ok) {
    return auth.response;
  }

  c.set('userId', auth.user.id);
  await next();
});

// GET /api/vault/status - Returns vault version and server checksum
vaultApp.get('/status', async (c) => {
  const userId = c.get('userId');
  const meta = await getVaultMetadata(c.env.DB, userId);

  return c.json({
    version: meta.version,
    checksum: meta.checksum,
    updatedAt: meta.updated_at,
  });
});

// GET /api/vault/items - Retrieves all encrypted vault items
vaultApp.get('/items', async (c) => {
  const userId = c.get('userId');
  const pepper = c.env.SERVER_PEPPER || '';
  const rows = await getVaultItems(c.env.DB, userId);

  const items = await Promise.all(
    rows.map(async (row) => {
      let rawCiphertext = row.ciphertext;
      if (pepper) {
        try {
          rawCiphertext = await verifyAndStripPepper(row.ciphertext, pepper);
        } catch (e) {
          // If HMAC unwrap fails, log warning
          console.warn('Pepper verification failed for item', row.id);
        }
      }

      return {
        id: row.id,
        ciphertext: rawCiphertext,
        iv: row.iv,
        itemType: row.item_type,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    })
  );

  const meta = await getVaultMetadata(c.env.DB, userId);

  return c.json({
    items,
    metadata: {
      version: meta.version,
      checksum: meta.checksum,
      updatedAt: meta.updated_at,
    },
  });
});

// POST /api/vault/items - Insert or Update a single vault item
vaultApp.post('/items', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { id, ciphertext, iv, itemType } = body;

  if (!id || !ciphertext || !iv) {
    return c.json({ error: 'Missing required item fields (id, ciphertext, iv)' }, 400);
  }

  const pepper = c.env.SERVER_PEPPER || '';
  const pepperedCiphertext = await applyServerPepper(ciphertext, pepper);

  await upsertVaultItem(c.env.DB, {
    id,
    user_id: userId,
    ciphertext: pepperedCiphertext,
    iv,
    item_type: itemType || 'login',
  });

  const meta = await getVaultMetadata(c.env.DB, userId);

  return c.json({
    message: 'Item saved successfully',
    id,
    metadata: {
      version: meta.version,
      checksum: meta.checksum,
      updatedAt: meta.updated_at,
    },
  });
});

// DELETE /api/vault/items/:id - Delete an item
vaultApp.delete('/items/:id', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('id');

  const success = await deleteVaultItem(c.env.DB, itemId, userId);
  if (!success) {
    return c.json({ error: 'Item not found or already deleted' }, 404);
  }

  const meta = await getVaultMetadata(c.env.DB, userId);

  return c.json({
    message: 'Item deleted successfully',
    id: itemId,
    metadata: {
      version: meta.version,
      checksum: meta.checksum,
      updatedAt: meta.updated_at,
    },
  });
});

// POST /api/vault/sync - Batch Sync Endpoint
vaultApp.post('/sync', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { clientItems, clientChecksum } = body;

  const pepper = c.env.SERVER_PEPPER || '';
  const meta = await getVaultMetadata(c.env.DB, userId);

  // If client checksum matches server checksum, we are fully in sync
  if (clientChecksum && clientChecksum === meta.checksum) {
    return c.json({
      synced: true,
      action: 'NONE',
      metadata: {
        version: meta.version,
        checksum: meta.checksum,
        updatedAt: meta.updated_at,
      },
    });
  }

  // Otherwise, process batch upserts if client sent new/updated items
  if (Array.isArray(clientItems) && clientItems.length > 0) {
    for (const item of clientItems) {
      if (item.id && item.ciphertext && item.iv) {
        const peppered = await applyServerPepper(item.ciphertext, pepper);
        await upsertVaultItem(c.env.DB, {
          id: item.id,
          user_id: userId,
          ciphertext: peppered,
          iv: item.iv,
          item_type: item.itemType || 'login',
        });
      }
    }
  }

  // Fetch updated server items to return to client
  const updatedRows = await getVaultItems(c.env.DB, userId);
  const items = await Promise.all(
    updatedRows.map(async (row) => ({
      id: row.id,
      ciphertext: pepper ? await verifyAndStripPepper(row.ciphertext, pepper) : row.ciphertext,
      iv: row.iv,
      itemType: row.item_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  );

  const updatedMeta = await getVaultMetadata(c.env.DB, userId);

  return c.json({
    synced: true,
    action: 'RECONCILED',
    items,
    metadata: {
      version: updatedMeta.version,
      checksum: updatedMeta.checksum,
      updatedAt: updatedMeta.updated_at,
    },
  });
});

export { vaultApp };
