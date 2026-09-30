/** Shared Trust Anchor discovery: dump crawler and browser live refresh. */

import { canonicalizeIssuerEntityId, issuerWellKnownUrl } from '../issuers/entity-id.js';

export function acceptForKind(kind) {
  if (kind === 'catalog' || kind === 'federation-entity' || kind === 'issuer-federation') {
    return 'application/jwt, application/jose, application/entity-statement+jwt, application/json;q=0.5, */*;q=0.1';
  }
  if (kind === 'federation-list') return 'application/json, */*;q=0.1';
  return 'application/json, application/jwt;q=0.8, */*;q=0.1';
}

export function cachePathForUrl(urlString) {
  const u = new URL(urlString);
  let pathname = u.pathname;
  if (pathname.endsWith('/')) pathname = `${pathname}index`;
  return `${u.hostname}/${pathname.replace(/^\//, '')}`;
}

export function seedRegistryUrls(baseUrl) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base) return [];
  return [
    { url: `${base}/.well-known/it-wallet-registry`, kind: 'discovery' },
    { url: `${base}/.well-known/openid-federation`, kind: 'federation-entity' },
  ];
}

export function looksLikeHtml(text, contentType = '') {
  if (/text\/html/i.test(String(contentType))) return true;
  const head = String(text || '')
    .slice(0, 256)
    .trimStart();
  return /^<!DOCTYPE html/i.test(head) || /^<html/i.test(head);
}

export function stripUrlHash(url) {
  return String(url || '').split('#')[0];
}

export function kindFromUrl(url, baseUrl = '') {
  const raw = String(url || '');
  if (raw.includes('it-wallet-registry')) return 'discovery';
  if (raw.includes('openid-credential-issuer')) return 'issuer-metadata';
  if (raw.includes('/l10n/')) return 'l10n';
  if (/\/schemas\/[^/]+$/.test(raw) && !raw.includes('.well-known/schemas')) return 'schema-file';
  if (raw.includes('credential-catalog') && !raw.includes('/l10n/')) return 'catalog';
  if (raw.includes('openid-federation')) {
    const baseFed = `${String(baseUrl || '').replace(/\/$/, '')}/.well-known/openid-federation`;
    if (baseUrl && stripUrlHash(raw).replace(/\/$/, '') === baseFed) return 'federation-entity';
    try {
      const parsed = new URL(raw);
      if (/(^|\.)ta\.wallet\.ipzs\.it$/.test(parsed.hostname) && parsed.pathname === '/.well-known/openid-federation') {
        return 'federation-entity';
      }
    } catch {
      /* ignore */
    }
    return 'issuer-federation';
  }
  if (/\/list\/?$/.test(raw)) return 'federation-list';
  return 'registry';
}

export function collectHttpsUrls(value, acc = []) {
  if (typeof value === 'string' && /^https:\/\//i.test(value)) acc.push(value.split('#')[0]);
  else if (Array.isArray(value)) value.forEach((v) => collectHttpsUrls(v, acc));
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectHttpsUrls(v, acc);
  }
  return acc;
}

export function isWalletIpzsCredentialIssuer(entityId) {
  try {
    const host = new URL(entityId).hostname;
    if (host.startsWith('verifier.')) return false;
    return host.endsWith('.wallet.ipzs.it') || host === 'wallet.ipzs.it';
  } catch {
    return false;
  }
}

export function issuerWellKnownFollowUps(entity, { fromFederationList = false } = {}) {
  const id = canonicalizeIssuerEntityId(entity);
  if (!id) return [];
  if (fromFederationList && !isWalletIpzsCredentialIssuer(id)) return [];
  return [
    { url: issuerWellKnownUrl(id, 'openid-credential-issuer'), kind: 'issuer-metadata' },
    { url: issuerWellKnownUrl(id, 'openid-federation'), kind: 'issuer-federation' },
  ];
}

export function followUpsFromParsed({ kind, url, json, options = {} } = {}) {
  const withFederation = Boolean(options.withFederation);
  const withIssuerMetadata = options.withIssuerMetadata !== false;
  const sameHost = options.sameHost || '';
  const followUps = [];
  const integrity = [];
  const seen = new Set();

  const add = (nextUrl, nextKind) => {
    const clean = stripUrlHash(nextUrl);
    if (!clean) return;
    const key = `${clean}\0${nextKind}`;
    if (seen.has(key)) return;
    try {
      if (new URL(clean).protocol !== 'https:') return;
    } catch {
      return;
    }
    seen.add(key);
    followUps.push({ url: clean, kind: nextKind });
  };

  if (!json) return { followUps, integrity };

  if (kind === 'federation-list') {
    if (withIssuerMetadata && Array.isArray(json)) {
      for (const entity of json) {
        if (typeof entity === 'string') {
          for (const item of issuerWellKnownFollowUps(entity, { fromFederationList: true })) {
            add(item.url, item.kind);
          }
        }
      }
    }
    return { followUps, integrity };
  }

  if (kind === 'federation-entity' && withIssuerMetadata) {
    const list = json.metadata?.federation_entity?.federation_list_endpoint;
    if (list) add(list, 'federation-list');
  }

  if (kind === 'discovery' && json.endpoints) {
    for (const [key, value] of Object.entries(json.endpoints)) {
      if (typeof value !== 'string') continue;
      if (key.startsWith('federation') && !withFederation) continue;
      const catalog = key === 'credential_catalog' || /credential-catalog/.test(value);
      add(value, catalog ? 'catalog' : key.startsWith('federation') ? 'federation' : 'registry');
    }
  }

  if (Array.isArray(json.schemas)) {
    for (const schema of json.schemas) {
      if (!schema?.schema_uri) continue;
      const clean = stripUrlHash(schema.schema_uri);
      if (schema['schema_uri#integrity']) integrity.push({ url: clean, sri: schema['schema_uri#integrity'] });
      add(schema.schema_uri, 'schema-file');
    }
  }

  if (json.localization?.base_uri) {
    const base = json.localization.base_uri.endsWith('/')
      ? json.localization.base_uri
      : `${json.localization.base_uri}/`;
    for (const loc of json.localization.available_locales || ['it', 'en']) {
      add(new URL(`${loc}.json`, base).href, 'l10n');
    }
  }

  if (withIssuerMetadata && Array.isArray(json.credentials)) {
    for (const cred of json.credentials) {
      for (const issuer of cred.issuers || []) {
        const entity = issuer.entity_id || issuer.id;
        if (!entity) continue;
        for (const item of issuerWellKnownFollowUps(entity)) add(item.url, item.kind);
      }
    }
  }

  const skipCollect =
    kind === 'schema-file' ||
    kind === 'l10n' ||
    kind === 'issuer-metadata' ||
    kind === 'issuer-federation' ||
    kind === 'federation-entity' ||
    kind === 'federation-list';

  if (!skipCollect && sameHost) {
    const self = stripUrlHash(url);
    for (const found of collectHttpsUrls(json)) {
      try {
        if (new URL(found).hostname !== sameHost || found === self) continue;
        if (found.endsWith('/')) continue;
        if (found.includes('/l10n/') && !found.endsWith('.json')) continue;
        if (found.includes('/schemas/') || found.includes('.well-known/')) {
          add(found, found.includes('/schemas/') ? 'schema-file' : 'derived');
        }
      } catch {
        /* ignore */
      }
    }
  }

  return { followUps, integrity };
}

export function dumpFallbackBody(entry) {
  if (!entry) return null;
  if (entry.raw) return { text: entry.raw, contentType: entry.content_type || '' };
  if (entry.json && !entry.jwt) {
    try {
      return { text: JSON.stringify(entry.json), contentType: entry.content_type || 'application/json' };
    } catch {
      return null;
    }
  }
  return null;
}
