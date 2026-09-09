#!/usr/bin/env node
/**
 * Dump IT-Wallet Registry REST resources preserving URL path hierarchy.
 *
 * Bodies are stored byte-for-byte. JWT catalogs are not decoded on disk.
 * Usage:
 *   node scripts/dump-registry.mjs --env pre
 *   node scripts/dump-registry.mjs --env prod --with-federation
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRegistryEnv } from '../src/js/cache/environments.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_ROOT = join(ROOT, 'cache');
const USER_AGENT =
  'eid-wallet-it-attestations-registry-browser/0.2 (+https://github.com/italia/eid-wallet-it-attestations-registry-browser)';

const REGISTRY_ENDPOINT_KEYS = [
  'claims_registry',
  'authentic_sources',
  'credential_catalog',
  'taxonomy',
  'schema_registry',
];

const args = parseArgs(process.argv.slice(2));
const envSpec = resolveRegistryEnv(args.env || process.env.ITW_REGISTRY_ENV || 'pre');
const env = envSpec.id;
const baseUrl = (args.base || process.env.ITW_REGISTRY_BASE_URL || envSpec.baseUrl || '').replace(
  /\/$/,
  '',
);
const withFederation =
  args.withFederation || process.env.ITW_DUMP_FEDERATION === 'true';
const withIssuerMetadata =
  args.withIssuerMetadata || process.env.ITW_DUMP_ISSUER_METADATA === 'true';

if (!baseUrl) {
  console.error(`Unknown env "${env}". Use --env pre|prod or --base URL`);
  process.exit(1);
}

const resources = [];
const queued = new Set();
const queue = [];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--env') out.env = argv[++i];
    else if (a === '--base') out.base = argv[++i];
    else if (a === '--with-federation') out.withFederation = true;
    else if (a === '--with-issuer-metadata') out.withIssuerMetadata = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

if (args.help) {
  console.log(`dump-registry.mjs --env pre|prod [--base URL] [--with-federation] [--with-issuer-metadata] [--dry-run]`);
  process.exit(0);
}

function cachePathFor(urlString) {
  const u = new URL(urlString);
  let pathname = u.pathname;
  if (pathname.endsWith('/')) pathname = `${pathname}index`;
  return join(u.hostname, pathname.replace(/^\//, ''));
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function decodeJwtPayload(token) {
  const parts = String(token).trim().split('.');
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseBody(buf, contentType) {
  const text = buf.toString('utf8').trim();
  if (!text || text.startsWith('<')) return { json: null, jwt: null, text };
  if (text.split('.').length === 3 && /^[A-Za-z0-9_-]+\./.test(text)) {
    return { json: decodeJwtPayload(text), jwt: text, text };
  }
  if ((contentType || '').includes('json') || text.startsWith('{') || text.startsWith('[')) {
    try {
      return { json: JSON.parse(text), jwt: null, text };
    } catch {
      return { json: null, jwt: null, text };
    }
  }
  return { json: null, jwt: null, text };
}

function collectHttpsUrls(value, acc = []) {
  if (typeof value === 'string' && /^https:\/\//i.test(value)) acc.push(value.split('#')[0]);
  else if (Array.isArray(value)) value.forEach((v) => collectHttpsUrls(v, acc));
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectHttpsUrls(v, acc);
  }
  return acc;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, accept) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: accept,
          'User-Agent': USER_AGENT,
        },
        redirect: 'follow',
      });
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || '';
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(400 * 2 ** (attempt - 1));
        continue;
      }
      return { res, buf, contentType };
    } catch (err) {
      lastErr = err;
      await sleep(400 * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

function enqueue(url, kind) {
  if (!url || queued.has(url)) return;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return;
  } catch {
    return;
  }
  queued.add(url);
  queue.push({ url, kind });
}

async function dumpOne({ url, kind }) {
  const path = cachePathFor(url);
  const accept =
    kind === 'catalog'
      ? 'application/jwt, application/jose, application/json;q=0.5, */*;q=0.1'
      : 'application/json, application/jwt;q=0.8, */*;q=0.1';

  const entry = {
    url,
    path,
    kind,
    status: null,
    content_type: null,
    sha256: null,
    bytes: 0,
    duration_ms: null,
    fetched_at: new Date().toISOString(),
    error: null,
  };

  const started = Date.now();
  try {
    const { res, buf, contentType } = await fetchWithRetry(url, accept);
    entry.duration_ms = Date.now() - started;
    entry.status = res.status;
    entry.content_type = contentType;
    entry.bytes = buf.length;
    entry.sha256 = sha256(buf);

    const looksHtml =
      contentType.includes('text/html') || buf.slice(0, 32).toString('utf8').includes('<html');
    if (looksHtml && !url.endsWith('.html')) {
      entry.error = `WAF or HTML block (HTTP ${res.status})`;
      resources.push(entry);
      console.warn(`! ${url} → ${entry.error}`);
      return;
    }
    if (!res.ok) {
      entry.error = `HTTP ${res.status}`;
      resources.push(entry);
      console.warn(`! ${url} → ${entry.error}`);
      return;
    }

    if (!args.dryRun) {
      const abs = join(CACHE_ROOT, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, buf);
    }

    const parsed = parseBody(buf, contentType);
    followParsed(kind, url, parsed.json);
    resources.push(entry);
    console.log(`✓ ${url} → cache/${path} (${entry.bytes} B)`);
  } catch (err) {
    entry.duration_ms = Date.now() - started;
    entry.error = err.message || String(err);
    resources.push(entry);
    console.warn(`! ${url} → ${entry.error}`);
  }
}

function followParsed(kind, url, json) {
  if (!json) return;

  if (kind === 'discovery' && json.endpoints) {
    for (const key of REGISTRY_ENDPOINT_KEYS) {
      if (json.endpoints[key]) {
        enqueue(json.endpoints[key], key === 'credential_catalog' ? 'catalog' : 'registry');
      }
    }
    if (withFederation) {
      for (const [key, value] of Object.entries(json.endpoints)) {
        if (key.startsWith('federation') && typeof value === 'string') {
          enqueue(value, 'federation');
        }
      }
    }
  }

  if (Array.isArray(json.schemas)) {
    for (const schema of json.schemas) {
      if (schema.schema_uri) enqueue(schema.schema_uri, 'schema-file');
    }
  }

  if (json.localization?.base_uri) {
    const base = json.localization.base_uri.endsWith('/')
      ? json.localization.base_uri
      : `${json.localization.base_uri}/`;
    for (const loc of json.localization.available_locales || ['it', 'en']) {
      enqueue(new URL(`${loc}.json`, base).href, 'l10n');
    }
  }

  if (withIssuerMetadata && Array.isArray(json.credentials)) {
    for (const cred of json.credentials) {
      for (const issuer of cred.issuers || []) {
        if (issuer.entity_id) {
          const id = issuer.entity_id.replace(/\/$/, '');
          enqueue(`${id}/.well-known/openid-credential-issuer`, 'issuer-metadata');
        }
      }
    }
  }

  if (kind === 'schema-file' || kind === 'l10n' || kind === 'issuer-metadata') return;

  const host = new URL(baseUrl).hostname;
  for (const found of collectHttpsUrls(json)) {
    try {
      if (new URL(found).hostname === host && found !== url) {
        if (found.endsWith('/')) continue;
        if (found.includes('/l10n/') && !found.endsWith('.json')) continue;
        if (found.includes('/schemas/') || found.includes('.well-known/')) {
          enqueue(found, found.includes('/schemas/') ? 'schema-file' : 'derived');
        }
      }
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  console.log(`Dump env=${env} base=${baseUrl}`);
  enqueue(`${baseUrl}/.well-known/it-wallet-registry`, 'discovery');

  while (queue.length) {
    const item = queue.shift();
    await dumpOne(item);
    await sleep(80);
  }

  const manifest = {
    manifest_version: 1,
    generated_at: new Date().toISOString(),
    env,
    base_url: baseUrl,
    tool: 'eid-wallet-it-attestations-registry-browser@0.2.0',
    flags: { withFederation, withIssuerMetadata },
    resources,
  };

  if (!args.dryRun) {
    await mkdir(CACHE_ROOT, { recursive: true });
    const envFile = join(CACHE_ROOT, envSpec.manifestFile);
    const body = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(envFile, body);
    if (env === 'pre') await writeFile(join(CACHE_ROOT, 'manifest.json'), body);
  }

  const ok = resources.filter((r) => !r.error).length;
  const fail = resources.length - ok;
  console.log(`Done. ${ok} ok, ${fail} errors. Manifest: cache/${envSpec.manifestFile}`);
  if (fail && ok === 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
