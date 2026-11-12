/**
 * OneStop Vault Service Worker
 * Precaches app shell + build assets for full offline PWA support,
 * and coordinates clean updates via SKIP_WAITING.
 */

const CACHE_VERSION = '__ONESTOP_CACHE_VERSION__';
const CACHE_NAME = `onestop-vault-${CACHE_VERSION}`;
const PRECACHE_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon.svg']; // __ONESTOP_PRECACHE_LINE__

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const assets = Array.isArray(PRECACHE_ASSETS)
        ? PRECACHE_ASSETS
        : ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon.svg'];
      await Promise.allSettled(
        assets.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('onestop-vault-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isNavigation =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  // Cache-first for Vite hashed bundles and static icons
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icon')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first for HTML & app shell with offline fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (isNavigation) {
          const shell = await caches.match('/index.html');
          if (shell) return shell;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
