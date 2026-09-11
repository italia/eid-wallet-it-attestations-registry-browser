import { assignDump, cacheUrl, timedFetch } from './loader.js';
import { checkSri, jwksFromFederationPayload, parseRegistryBody, sha256Hex, verifyJwt } from './jwt.js';

const DB_NAME = 'itw-registry-live';
const STORE = 'resources';
const DB_VERSION = 1;

export function acceptForKind(kind) {
  if (kind === 'catalog' || kind === 'federation-entity') {
    return 'application/jwt, application/jose, application/entity-statement+jwt, application/json;q=0.5, */*;q=0.1';
  }
  return 'application/json, application/jwt;q=0.8, */*;q=0.1';
}

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

export async function fetchLiveResource(entry, fetchFn = fetch) {
  const url = entry.url;
  const result = await timedFetch(url, fetchFn, { headers: { Accept: acceptForKind(entry.kind) } });
  result.http.endpoint = url;
  result.http.source = 'live';
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

export async function overlayFromIdb(dump) {
  let changed = false;
  for (const entry of dump.manifest?.resources || []) {
    if (!entry.url) continue;
    const cached = await idbGet(entry.url);
    if (!cached?.text) continue;
    if (entry.sha256 && cached.sha256 === entry.sha256) continue;
    const generated = Date.parse(dump.manifest.generated_at || '') || 0;
    const fetched = Date.parse(cached.fetchedAt || '') || 0;
    if (generated && fetched && fetched < generated) continue;
    await applyLiveBody(dump, entry, cached.text, cached.contentType);
    changed = true;
  }
  return changed;
}

export async function refreshDumpLive(dump, { fetchFn = fetch, onCall, shouldAbort } = {}) {
  let changed = false;
  const httpCalls = [];
  for (const entry of dump.manifest?.resources || []) {
    if (shouldAbort?.()) break;
    if (!entry.url) continue;
    const result = await fetchLiveResource(entry, fetchFn);
    httpCalls.push(result.http);
    onCall?.(result.http, entry);
    if (!result.http.ok || result.text == null) continue;
    if (entry.sha256 && result.sha256 === entry.sha256) continue;
    await applyLiveBody(dump, entry, result.text, result.http.contentType);
    changed = true;
  }
  return { dump, changed, httpCalls };
}

export function dumpCacheUrl(entry) {
  return entry.path ? cacheUrl(entry.path) : '';
}
