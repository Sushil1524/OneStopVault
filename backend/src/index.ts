import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types.js';
import { authApp } from './routes/auth.js';
import { vaultApp } from './routes/vault.js';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Vault-Checksum'],
  exposeHeaders: ['Content-Length', 'X-Vault-Checksum'],
  maxAge: 86400,
}));

app.get('/', (c) => {
  return c.json({
    name: 'OneStop Vault API',
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});


app.route('/api/auth', authApp);
app.route('/api/vault', vaultApp);

app.notFound((c) => {
  return c.json({ error: 'Endpoint not found' }, 404);
});

app.onError((err, c) => {
  console.error('Worker global error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

export default app;
