import { assignDump, cacheUrl, timedFetch } from './loader.js';
import { checkSri, jwksFromFederationPayload, parseRegistryBody, sha256Hex, verifyJwt } from './jwt.js';
import {
  acceptForKind,
  cachePathForUrl,
  dumpFallbackBody,
  followUpsFromParsed,
  kindFromUrl,
  looksLikeHtml,
  seedRegistryUrls,
} from './discover.js';

export { acceptForKind } from './discover.js';

const DB_NAME = 'itw-registry-live';
const STORE = 'resources';
const DB_VERSION = 1;

export function isCorsFailure(http) {
  if (!http || http.ok) return false;
  const err = String(http.error || '').toLowerCase();
  if (http.status !== 0) return /cors|access-control/.test(err);
  return (
    !err ||
    err.includes('failed to fetch') ||
    err.includes('network') ||
    err.includes('cors') ||
    err.includes('access-control') ||
    err.includes('load failed')
  );
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'url' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbPut(record) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export async function idbGet(url) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(url);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export async function idbGetAll() {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

export function schemaIntegrityMap(dump) {
  const map = new Map();
  for (const schema of dump?.schemas || []) {
    const url = String(schema.schema_uri || '').split('#')[0];
    if (url) map.set(url, schema['schema_uri#integrity'] || '');
  }
  return map;
}

export async function annotateDumpTrust(dump) {
  dump.issuerMetadata = dump.issuerMetadata || {};
  dump.issuerFederation = dump.issuerFederation || {};
  const keys = jwksFromFederationPayload(dump.federationEntity || {});
  dump.jwks = keys;
  const catalogRes = (dump.resources || []).find((r) => r.jwt && (r.path || '').includes('credential-catalog'));
  if (catalogRes?.raw && keys.length) {
    dump.catalogSignature = await verifyJwt(catalogRes.raw, keys);
  } else if (catalogRes?.jwt && keys.length) {
    dump.catalogSignature = { ok: false, error: 'catalog JWT missing' };
  } else {
    dump.catalogSignature = { skipped: true, ok: true };
  }

  const integrityByUrl = schemaIntegrityMap(dump);
  dump.integrity = [];
  for (const res of dump.resources || []) {
    const url = res.url || '';
    const expected = integrityByUrl.get(url);
    if (!expected || res.raw == null) continue;
    const check = await checkSri(res.raw, expected);
    res.integrity = check;
    dump.integrity.push({ url, ...check });
  }
  return dump;
}

function replaceResource(dump, entry, parsed, raw, extra = {}) {
  const idx = dump.resources.findIndex((r) => r.url === entry.url || r.path === entry.path);
  const next = {
    ...entry,
    ...extra,
    json: parsed.json,
    jwt: parsed.jwt,
    header: parsed.header || null,
    raw: parsed.raw ?? raw,
    error: null,
  };
  if (idx >= 0) dump.resources[idx] = next;
  else dump.resources.push(next);
  assignDump(dump, next, parsed.json);
}

export async function applyLiveBody(dump, entry, text, contentType) {
  const parsed = parseRegistryBody(text, contentType);
  replaceResource(dump, entry, parsed, text, { content_type: contentType, live: true });
  await annotateDumpTrust(dump);
  return dump;
}

function markUnusableLive(result, reason) {
  result.http.ok = false;
  result.http.error = reason;
  return result;
}

export async function fetchLiveResource(entry, fetchFn = fetch) {
  const url = entry.url;
  const result = await timedFetch(url, fetchFn, { headers: { Accept: acceptForKind(entry.kind) } });
  result.http.endpoint = url;
  result.http.source = 'live';
  if (result.http.ok && result.text != null && looksLikeHtml(result.text, result.http.contentType)) {
    return markUnusableLive(result, `WAF or HTML block (HTTP ${result.http.status})`);
  }
  if (result.http.ok && result.text != null) {
    result.sha256 = await sha256Hex(result.text);
    await idbPut({
      url,
      text: result.text,
      contentType: result.http.contentType,
      sha256: result.sha256,
      fetchedAt: new Date().toISOString(),
    });
  }
  return result;
}

function overlayAllowed(cachedUrl, dump) {
  if ((dump.resources || []).some((r) => r.url === cachedUrl)) return true;
  const base = dump.manifest?.base_url;
  if (!base) return false;
  try {
    return new URL(cachedUrl).hostname === new URL(base).hostname;
  } catch {
    return false;
  }
}

export async function overlayFromIdb(dump) {
  let changed = false;
  const records = await idbGetAll();
  const dumpByUrl = new Map((dump.resources || []).map((r) => [r.url, r]));
  const generated = Date.parse(dump.manifest?.generated_at || '') || 0;
  for (const cached of records) {
    if (!cached?.url || !cached?.text) continue;
    if (!overlayAllowed(cached.url, dump)) continue;
    if (looksLikeHtml(cached.text, cached.contentType)) continue;
    const dumpEntry = dumpByUrl.get(cached.url);
    if (dumpEntry?.sha256 && cached.sha256 === dumpEntry.sha256) continue;
    const fetched = Date.parse(cached.fetchedAt || '') || 0;
    if (generated && fetched && fetched < generated) continue;
    const entry = dumpEntry || {
      url: cached.url,
      path: cachePathForUrl(cached.url),
      kind: kindFromUrl(cached.url, dump.manifest?.base_url),
    };
    await applyLiveBody(dump, entry, cached.text, cached.contentType);
    dumpByUrl.set(cached.url, dump.resources.find((r) => r.url === cached.url));
    changed = true;
  }
  return changed;
}

function discoveryOptions(dump, baseUrl) {
  let sameHost = '';
  try {
    sameHost = new URL(baseUrl).hostname;
  } catch {
    sameHost = '';
  }
  return {
    withFederation: Boolean(dump.manifest?.flags?.withFederation),
    withIssuerMetadata: dump.manifest?.flags?.withIssuerMetadata !== false,
    sameHost,
  };
}

function enqueueDiscovery(queue, queued, url, kind, baseUrl) {
  const clean = String(url || '').split('#')[0];
  if (!clean || queued.has(clean)) return;
  try {
    if (new URL(clean).protocol !== 'https:') return;
  } catch {
    return;
  }
  queued.add(clean);
  queue.push({ url: clean, kind: kind || kindFromUrl(clean, baseUrl) });
}

function resourceEntryFor(dumpByUrl, item, baseUrl) {
  const dumpEntry = dumpByUrl.get(item.url);
  return {
    url: item.url,
    path: dumpEntry?.path || cachePathForUrl(item.url),
    kind: item.kind || dumpEntry?.kind || kindFromUrl(item.url, baseUrl),
    sha256: dumpEntry?.sha256,
    content_type: dumpEntry?.content_type,
  };
}

export function findDumpResource(dump, call) {
  const endpoint = call?.endpoint || call?.url || '';
  const req = call?.requestUrl || call?.endpoint || '';
  const match = (r) => r.url === endpoint || (r.path && req.includes(r.path));
  return (dump?.resources || []).find(match) || (dump?.manifest?.resources || []).find(match) || null;
}

export async function refreshDumpLive(dump, { fetchFn = fetch, onCall, shouldAbort } = {}) {
  let changed = false;
  const httpCalls = [];
  const baseUrl = String(dump.manifest?.base_url || '').replace(/\/$/, '');
  if (!baseUrl) return { dump, changed, httpCalls };

  dump.resources = dump.resources || [];
  const dumpByUrl = new Map(dump.resources.map((r) => [r.url, r]));
  const queued = new Set();
  const queue = [];
  const options = discoveryOptions(dump, baseUrl);

  for (const seed of seedRegistryUrls(baseUrl)) {
    enqueueDiscovery(queue, queued, seed.url, seed.kind, baseUrl);
  }

  while (queue.length) {
    if (shouldAbort?.()) break;
    const item = queue.shift();
    const entry = resourceEntryFor(dumpByUrl, item, baseUrl);
    const dumpEntry = dumpByUrl.get(item.url);
    const result = await fetchLiveResource(entry, fetchFn);
    const liveUsable = Boolean(result.http.ok && result.text != null);
    httpCalls.push(result.http);
    onCall?.(result.http, entry);

    let text = liveUsable ? result.text : null;
    let contentType = result.http.contentType || '';
    if (!liveUsable) {
      const fallback = dumpFallbackBody(dumpEntry);
      if (fallback) {
        text = fallback.text;
        contentType = fallback.contentType || contentType;
      } else if (!dumpEntry) {
        dump.resources.push({
          ...entry,
          json: null,
          error: result.http.error || `HTTP ${result.http.status}`,
        });
        dumpByUrl.set(entry.url, dump.resources[dump.resources.length - 1]);
      }
    }

    if (text == null) continue;

    const parsed = parseRegistryBody(text, contentType);
    if (liveUsable) {
      const existing = dump.resources.find((r) => r.url === entry.url);
      if (existing?.raw !== text) {
        await applyLiveBody(dump, entry, text, contentType);
        dumpByUrl.set(entry.url, dump.resources.find((r) => r.url === entry.url));
        changed = true;
      }
    }

    const json = parsed.json ?? dumpEntry?.json ?? null;
    const { followUps } = followUpsFromParsed({
      kind: entry.kind,
      url: entry.url,
      json,
      options,
    });
    for (const next of followUps) enqueueDiscovery(queue, queued, next.url, next.kind, baseUrl);
  }

  return { dump, changed, httpCalls };
}

export function dumpCacheUrl(entry) {
  return entry.path ? cacheUrl(entry.path) : '';
}
