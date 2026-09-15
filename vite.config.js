import { defineConfig } from 'vite';
import { cpSync, createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_SECURITY_POLICY } from './src/js/security/csp.js';

const root = dirname(fileURLToPath(import.meta.url));
const cacheDir = resolve(root, 'cache');
const publicCache = resolve(root, 'public', 'cache');
const demoDir = resolve(root, 'demo');

function syncCache() {
  mkdirSync(publicCache, { recursive: true });
  cpSync(cacheDir, publicCache, { recursive: true });
}

function mime(file) {
  switch (extname(file)) {
    case '.json':
      return 'application/json; charset=utf-8';
    case '.cddl':
    case '.pem':
    case '.md':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function serveRootFile(baseDir, prefix, urlPath, res) {
  const rel = decodeURIComponent(urlPath.replace(new RegExp(`^${prefix}/?`), ''));
  const file = normalize(join(baseDir, rel));
  if (!file.startsWith(baseDir) || !existsSync(file) || statSync(file).isDirectory()) return false;
  res.setHeader('Content-Type', mime(file));
  createReadStream(file).pipe(res);
  return true;
}

function serveCacheFile(urlPath, res) {
  return serveRootFile(cacheDir, '/cache', urlPath, res);
}

function cspMeta() {
  return {
    name: 'csp-meta',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.server) return html;
        const tag = `  <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`;
        return html.replace('<head>', `<head>\n${tag}`);
      },
    },
  };
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
        if (url.startsWith('/cache/') && serveCacheFile(url, res)) return;
        next();
      });
    },
    closeBundle() {
      const dest = resolve(root, 'dist', 'cache');
      mkdirSync(dest, { recursive: true });
      cpSync(cacheDir, dest, { recursive: true });
      if (existsSync(demoDir)) {
        const demoDest = resolve(root, 'dist', 'demo');
        mkdirSync(demoDest, { recursive: true });
        cpSync(demoDir, demoDest, { recursive: true });
      }
      writeFileSync(resolve(root, 'dist', '.nojekyll'), '');
    },
  };
}

// Pages sets VITE_BASE in pages.yml. Do not key off GITHUB_ACTIONS: that
// variable is also set during CI Playwright runs, which would serve the app
// under the Pages subdirectory while tests hit http://127.0.0.1:5173/.
const base = process.env.VITE_BASE || './';

export default defineConfig({
  base,
  publicDir: 'public',
  plugins: [cspMeta(), serveCache()],
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
