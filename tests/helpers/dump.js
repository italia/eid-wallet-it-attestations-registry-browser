import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRegistryBody } from '../../src/js/cache/jwt.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = join(ROOT, 'cache/pre.ta.wallet.ipzs.it');

function read(rel) {
  return readFileSync(join(CACHE, rel), 'utf8');
}

function parsedFile(rel, type) {
  return parseRegistryBody(read(rel), type);
}

function jsonFile(rel) {
  return parsedFile(rel, rel.endsWith('credential-catalog') ? 'application/jose' : 'application/json').json;
}

function resource(rel, kind, type = 'application/json') {
  const url = `https://pre.ta.wallet.ipzs.it/${rel}`;
  const parsed = parsedFile(rel, type);
  return {
    url,
    path: `pre.ta.wallet.ipzs.it/${rel}`,
    kind,
    content_type: type,
    json: parsed.json,
    jwt: parsed.jwt,
    header: parsed.header || null,
    raw: parsed.raw,
  };
}

function schemaFileResources(schemaRows) {
  const out = [];
  for (const row of schemaRows || []) {
    const uri = String(row.schema_uri || '');
    const rel = uri.replace(/^https:\/\/pre\.ta\.wallet\.ipzs\.it\//, '');
    if (!rel || rel === uri) continue;
    if (!existsSync(join(CACHE, rel))) continue;
    out.push(resource(rel, 'schema', rel.endsWith('.cddl') ? 'text/plain' : 'application/json'));
  }
  return out;
}

function extraCacheResource(rel, url, kind, type = 'application/json') {
  const file = join(ROOT, 'cache', rel);
  if (!existsSync(file)) return null;
  const parsed = parseRegistryBody(readFileSync(file, 'utf8'), type);
  return {
    url,
    path: rel,
    kind,
    content_type: type,
    json: parsed.json,
    jwt: parsed.jwt,
    header: parsed.header || null,
    raw: parsed.raw,
  };
}

export function loadDumpFromDisk() {
  const catalog = resource('.well-known/credential-catalog', 'catalog', 'application/jose');
  const schemas = resource('.well-known/schemas', 'registry');
  const schemaFiles = schemaFileResources(schemas.json.schemas);
  const issuerJson = extraCacheResource(
    'pre.issuer.wallet.ipzs.it/.well-known/openid-credential-issuer',
    'https://pre.issuer.wallet.ipzs.it/.well-known/openid-credential-issuer',
    'issuer-metadata',
    'application/json',
  );
  const issuerJwt = extraCacheResource(
    'pre.eid.wallet.ipzs.it/1-3/.well-known/openid-credential-issuer',
    'https://pre.eid.wallet.ipzs.it/1-3/.well-known/openid-credential-issuer',
    'issuer-metadata',
    'application/entity-statement+jwt;charset=UTF-8',
  );
  const issuerFedJson = extraCacheResource(
    'pre.issuer.wallet.ipzs.it/.well-known/openid-federation',
    'https://pre.issuer.wallet.ipzs.it/.well-known/openid-federation',
    'issuer-federation',
    'application/entity-statement+jwt',
  );
  const issuerFedJwt = extraCacheResource(
    'pre.eid.wallet.ipzs.it/1-3/.well-known/openid-federation',
    'https://pre.eid.wallet.ipzs.it/1-3/.well-known/openid-federation',
    'issuer-federation',
    'application/entity-statement+jwt;charset=UTF-8',
  );
  const issuerResources = [issuerJson, issuerJwt, issuerFedJson, issuerFedJwt].filter(Boolean);
  const issuerMetadata = {};
  const issuerFederation = {};
  for (const res of issuerResources) {
    if (res.kind === 'issuer-metadata') {
      const iss = res.json?.credential_issuer;
      if (iss) issuerMetadata[iss] = res.json;
    } else if (res.kind === 'issuer-federation') {
      const iss = res.json?.iss || res.json?.sub;
      if (iss) issuerFederation[iss] = res.json;
    }
  }
  return {
    discovery: jsonFile('.well-known/it-wallet-registry'),
    catalog: catalog.json,
    schemas: schemas.json.schemas,
    claims: jsonFile('.well-known/claims-registry').claims,
    authenticSources: jsonFile('.well-known/authentic-sources').authentic_sources,
    taxonomy: jsonFile('.well-known/credential-taxonomy'),
    issuerMetadata,
    issuerFederation,
    resources: [
      resource('.well-known/it-wallet-registry', 'discovery'),
      resource('.well-known/claims-registry', 'registry'),
      resource('.well-known/authentic-sources', 'registry'),
      catalog,
      resource('.well-known/credential-taxonomy', 'registry'),
      schemas,
      ...schemaFiles,
      ...issuerResources,
    ],
    l10n: {
      catalog: {
        it: JSON.parse(read('.well-known/l10n/credential-catalog/it.json')),
        en: JSON.parse(read('.well-known/l10n/credential-catalog/en.json')),
      },
      authenticSources: {
        it: JSON.parse(read('.well-known/l10n/authentic-sources/it.json')),
        en: JSON.parse(read('.well-known/l10n/authentic-sources/en.json')),
      },
      taxonomy: {
        it: JSON.parse(read('.well-known/l10n/credential-taxonomy/it.json')),
        en: JSON.parse(read('.well-known/l10n/credential-taxonomy/en.json')),
      },
      claims: {
        it: JSON.parse(read('.well-known/l10n/claims/it.json')),
        en: JSON.parse(read('.well-known/l10n/claims/en.json')),
      },
    },
  };
}
