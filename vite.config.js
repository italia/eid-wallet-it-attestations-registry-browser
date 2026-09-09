import { defineConfig } from 'vite';
import { cpSync, createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const cacheDir = resolve(root, 'cache');
const publicCache = resolve(root, 'public', 'cache');

function syncCache() {
  mkdirSync(publicCache, { recursive: true });
  cpSync(cacheDir, publicCache, { recursive: true });
}

function mime(file) {
  switch (extname(file)) {
    case '.json':
      return 'application/json; charset=utf-8';
    case '.cddl':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function serveCacheFile(urlPath, res) {
  const rel = decodeURIComponent(urlPath.replace(/^\/cache\/?/, ''));
  const file = normalize(join(cacheDir, rel));
  if (!file.startsWith(cacheDir) || !existsSync(file) || statSync(file).isDirectory()) return false;
  res.setHeader('Content-Type', mime(file));
  createReadStream(file).pipe(res);
  return true;
}

function serveCache() {
  return {
    name: 'serve-registry-cache',
    buildStart() {
      syncCache();
    },
    configureServer(server) {
      syncCache();
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (!url.startsWith('/cache/')) return next();
        if (serveCacheFile(url, res)) return;
        next();
      });
    },
    closeBundle() {
      const dest = resolve(root, 'dist', 'cache');
      mkdirSync(dest, { recursive: true });
      cpSync(cacheDir, dest, { recursive: true });
      writeFileSync(resolve(root, 'dist', '.nojekyll'), '');
    },
  };
}

const pagesBase = '/eid-wallet-it-attestations-registry-browser/';
const base = process.env.VITE_BASE || (process.env.GITHUB_ACTIONS ? pagesBase : './');

export default defineConfig({
  base,
  publicDir: 'public',
  plugins: [serveCache()],
  optimizeDeps: {
    include: ['qrcode'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
    commonjsOptions: {
      include: [/qrcode/, /node_modules/],
    },
  },
  appType: 'spa',
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: '127.0.0.1',
  },
});
