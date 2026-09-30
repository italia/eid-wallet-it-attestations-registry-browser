#!/usr/bin/env node
/**
 * Dump IT-Wallet Registry REST resources preserving URL path hierarchy.
 *
 * Bodies are stored byte-for-byte. JWT catalogs are not decoded on disk.
 * Usage:
 *   node scripts/dump-registry.mjs --env pre --with-issuer-metadata
 *   node scripts/dump-registry.mjs --env prod --with-federation
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRegistryEnv } from '../src/js/cache/environments.js';
import { acceptForKind, cachePathForUrl, followUpsFromParsed, looksLikeHtml, seedRegistryUrls } from '../src/js/cache/discover.js';
import pkg from '../package.json' with { type: 'json' };

const appVersion = pkg.version;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_ROOT = join(ROOT, 'cache');
const USER_AGENT =
  `eid-wallet-it-attestations-registry-browser/${appVersion} (+https://github.com/italia/eid-wallet-it-attestations-registry-browser)`;

const args = parseArgs(process.argv.slice(2));
const envSpec = resolveRegistryEnv(args.env || process.env.ITW_REGISTRY_ENV || 'pre');
const env = envSpec.id;
const baseUrl = (args.base || process.env.ITW_REGISTRY_BASE_URL || envSpec.baseUrl || '').replace(
  /\/$/,
  '',
);
const withFederation =
  args.withFederation || process.env.ITW_DUMP_FEDERATION === 'true';
const withIssuerMetadata = !(
  args.noIssuerMetadata || process.env.ITW_DUMP_ISSUER_METADATA === 'false'
);

if (!baseUrl) {
  console.error(`Unknown env "${env}". Use --env pre|prod or --base URL`);
  process.exit(1);
}

const resources = [];
const queued = new Set();
const queue = [];
const integrityByUrl = new Map();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--env') out.env = argv[++i];
    else if (a === '--base') out.base = argv[++i];
    else if (a === '--with-federation') out.withFederation = true;
    else if (a === '--with-issuer-metadata') out.withIssuerMetadata = true;
    else if (a === '--no-issuer-metadata') out.noIssuerMetadata = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

if (args.help) {
  console.log(`dump-registry.mjs --env pre|prod [--base URL] [--with-federation] [--with-issuer-metadata] [--no-issuer-metadata] [--dry-run]`);
  process.exit(0);
}

function cachePathFor(urlString) {
  return cachePathForUrl(urlString);
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchErrorCode(err) {
  let current = err;
  for (let i = 0; i < 5 && current; i += 1) {
    if (current.code) return String(current.code);
    current = current.cause;
  }
  return '';
}

function fetchErrorMessage(err) {
  const msg = err?.message || String(err);
  const code = fetchErrorCode(err);
  return code && !msg.includes(code) ? `${msg} (${code})` : msg;
}

const NON_RETRYABLE_FETCH_CODES = new Set(['ENOTFOUND', 'ENODATA', 'ERR_INVALID_URL']);

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
      if (NON_RETRYABLE_FETCH_CODES.has(fetchErrorCode(err))) throw err;
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
  const accept = acceptForKind(kind);

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

    const looksHtml = looksLikeHtml(buf.toString('utf8'), contentType);
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

    const sri = integrityByUrl.get(url);
    if (sri) {
      const actual = `sha256-${createHash('sha256').update(buf).digest('base64')}`;
      entry.integrity = actual === sri ? 'ok' : 'mismatch';
      entry.integrity_expected = sri;
      entry.integrity_actual = actual;
      if (entry.integrity === 'mismatch') {
        console.warn(`! ${url} → integrity mismatch (${sri})`);
      }
    }

    const parsed = parseBody(buf, contentType);
    followParsed(kind, url, parsed.json);
    resources.push(entry);
    console.log(`✓ ${url} → cache/${path} (${entry.bytes} B)`);
  } catch (err) {
    entry.duration_ms = Date.now() - started;
    entry.error = fetchErrorMessage(err);
    resources.push(entry);
    console.warn(`! ${url} → ${entry.error}`);
  }
}

function followParsed(kind, url, json) {
  const { followUps, integrity } = followUpsFromParsed({
    kind,
    url,
    json,
    options: {
      withFederation,
      withIssuerMetadata,
      sameHost: new URL(baseUrl).hostname,
    },
  });
  for (const row of integrity) integrityByUrl.set(row.url, row.sri);
  for (const item of followUps) enqueue(item.url, item.kind);
}

async function main() {
  console.log(`Dump env=${env} base=${baseUrl}`);
  for (const seed of seedRegistryUrls(baseUrl)) enqueue(seed.url, seed.kind);

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
    tool: `eid-wallet-it-attestations-registry-browser@${appVersion}`,
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
