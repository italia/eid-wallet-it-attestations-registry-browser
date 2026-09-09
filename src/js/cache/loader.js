import { parseRegistryBody } from './jwt.js';
import { resolveRegistryEnv } from './environments.js';

export function cacheRoot(dir = 'cache') {
  const base = import.meta.env?.BASE_URL || './';
  return `${base}${dir}/`;
}

export function cacheUrl(path, base = cacheRoot()) {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function manifestUrlsFor(env) {
  const spec = resolveRegistryEnv(env);
  const files = [spec.manifestFile];
  if (spec.id === 'pre') files.push('manifest.json');
  const urls = [];
  for (const file of files) {
    urls.push(`${cacheRoot()}${file}`, `${cacheRoot('public/cache')}${file}`);
  }
  return urls;
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function pickApplicationType(...types) {
  for (const raw of types) {
    const value = String(raw || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (value && value !== 'application/octet-stream') return raw.split(';')[0].trim();
  }
  return String(types.find(Boolean) || '')
    .split(';')[0]
    .trim();
}

export async function timedFetch(url, fetchFn = fetch) {
  const started = nowMs();
  try {
    const res = await fetchFn(url);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    return {
      http: {
        method: 'GET',
        endpoint: url,
        requestUrl: url,
        status: res.status,
        ok: res.ok,
        durationMs: Math.max(0, Math.round(nowMs() - started)),
        contentType,
        applicationType: pickApplicationType(contentType),
        error: res.ok ? null : `HTTP ${res.status}`,
      },
      text,
    };
  } catch (err) {
    return {
      http: {
        method: 'GET',
        endpoint: url,
        requestUrl: url,
        status: 0,
        ok: false,
        durationMs: Math.max(0, Math.round(nowMs() - started)),
        contentType: '',
        applicationType: '',
        error: err.message || String(err),
      },
      text: null,
    };
  }
}

export async function loadDumpManifest(env = 'pre', fetchFn = fetch, onProgress) {
  const urls = manifestUrlsFor(env);
  const httpCalls = [];
  let lastErr;
  onProgress?.({ phase: 'manifest', current: 0, total: 0, httpCalls });
  for (const url of urls) {
    const result = await timedFetch(url, fetchFn);
    httpCalls.push({
      ...result.http,
      endpoint: url,
    });
    onProgress?.({ phase: 'manifest', current: httpCalls.length, total: 0, httpCalls });
    if (!result.http.ok || result.text == null) {
      lastErr = new Error(result.http.error || `HTTP ${result.http.status} ${url}`);
      continue;
    }
    try {
      return { manifest: JSON.parse(result.text), httpCalls };
    } catch (err) {
      lastErr = err;
    }
  }
  const error = lastErr || new Error(`${resolveRegistryEnv(env).manifestFile} not found`);
  error.httpCalls = httpCalls;
  throw error;
}

export async function loadDump(manifest, { fetchFn = fetch, cacheBase = cacheRoot(), httpCalls = [], onProgress } = {}) {
  const dump = {
    manifest,
    discovery: null,
    catalog: null,
    schemas: [],
    claims: {},
    authenticSources: [],
    taxonomy: null,
    l10n: { catalog: {}, claims: {}, authenticSources: {}, taxonomy: {} },
    resources: [],
    httpCalls: [...httpCalls],
  };

  const entries = manifest.resources || [];
  const total = entries.length;
  onProgress?.({ phase: 'resources', current: 0, total, httpCalls: dump.httpCalls });

  for (const entry of entries) {
    try {
      if (entry.error || !entry.path) {
        dump.resources.push({ ...entry, json: null });
        dump.httpCalls.push({
          method: 'GET',
          endpoint: entry.url || entry.path,
          requestUrl: entry.path ? cacheUrl(entry.path, cacheBase) : '',
          status: entry.status || 0,
          ok: false,
          durationMs: entry.duration_ms ?? null,
          contentType: entry.content_type || '',
          applicationType: pickApplicationType(entry.content_type),
          error: entry.error || 'missing path',
        });
        continue;
      }
      const requestUrl = cacheUrl(entry.path, cacheBase);
      const result = await timedFetch(requestUrl, fetchFn);
      const applicationType = pickApplicationType(entry.content_type, result.http.contentType);
      dump.httpCalls.push({
        ...result.http,
        endpoint: entry.url || requestUrl,
        requestUrl,
        applicationType,
        dumpStatus: entry.status,
        dumpDurationMs: entry.duration_ms ?? null,
      });
      if (!result.http.ok || result.text == null) {
        dump.resources.push({
          ...entry,
          error: result.http.error || `HTTP ${result.http.status} ${requestUrl}`,
          json: null,
        });
        continue;
      }
      const parsed = parseRegistryBody(result.text, applicationType || result.http.contentType);
      dump.resources.push({
        ...entry,
        json: parsed.json,
        jwt: parsed.jwt,
        header: parsed.header || null,
        raw: parsed.raw ?? result.text,
      });
      assignDump(dump, entry, parsed.json);
    } finally {
      onProgress?.({ phase: 'resources', current: dump.resources.length, total, httpCalls: dump.httpCalls });
    }
  }
  return dump;
}

function assignDump(dump, entry, json) {
  if (!json) return;
  const path = entry.path || '';
  if (path.endsWith('/it-wallet-registry') || entry.kind === 'discovery') dump.discovery = json;
  if (path.includes('/credential-catalog') && !path.includes('/l10n/')) dump.catalog = json;
  if (path.endsWith('/schemas') || path.endsWith('.well-known/schemas')) dump.schemas = json.schemas || [];
  if (path.includes('claims-registry') && !path.includes('/l10n/')) dump.claims = json.claims || {};
  if (path.includes('authentic-sources') && !path.includes('/l10n/')) {
    dump.authenticSources = json.authentic_sources || [];
  }
  if (path.includes('credential-taxonomy') && !path.includes('/l10n/')) dump.taxonomy = json;
  const loc = path.match(/\/l10n\/([^/]+)\/(it|en)\.json$/);
  if (loc) {
    const [, kind, lang] = loc;
    const bucket =
      kind === 'credential-catalog'
        ? 'catalog'
        : kind === 'authentic-sources'
          ? 'authenticSources'
          : kind === 'credential-taxonomy'
            ? 'taxonomy'
            : kind === 'claims'
              ? 'claims'
              : null;
    if (bucket) dump.l10n[bucket][lang] = json;
  }
}
