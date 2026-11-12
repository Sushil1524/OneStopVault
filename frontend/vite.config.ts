import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Injects the Vite-built assets list and a deterministic build hash into dist/sw.js
 * so the PWA precaches all hashed JS/CSS bundles for cold offline launches.
 */
function pwaPrecachePlugin(): Plugin {
  return {
    name: 'onestop-pwa-precache',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const swPath = path.join(distDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;

      const assetsToCache = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon.svg'];
      const assetsDir = path.join(distDir, 'assets');
      const hash = crypto.createHash('sha256');

      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir).sort();
        for (const file of files) {
          if (file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.wasm')) {
            assetsToCache.push(`/assets/${file}`);
            hash.update(file);
          }
        }
      }

      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        hash.update(fs.readFileSync(indexHtml));
      }

      const buildVersion = hash.digest('hex').slice(0, 12);
      let swSource = fs.readFileSync(swPath, 'utf-8');
      swSource = swSource
        .replace('__ONESTOP_CACHE_VERSION__', buildVersion)
        .replace(
          /const PRECACHE_ASSETS = .*?\/\/ __ONESTOP_PRECACHE_LINE__/,
          `const PRECACHE_ASSETS = ${JSON.stringify(assetsToCache)};`,
        );

      fs.writeFileSync(swPath, swSource, 'utf-8');
    },
  };
}

export default defineConfig({
  plugins: [react(), pwaPrecachePlugin()],
  server: {
    port: 3000,
    open: true,
  },
});
