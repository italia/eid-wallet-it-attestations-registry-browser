/** Build signed demo credentials from registry schemas (fake issuer + published keys). */

import { bytesToB64url, signEs256Jwt, verifyJwt } from '../cache/jwt.js';
import { tryParseJson } from '../artifacts/json-tree.js';
import {
  DEMO_ISSUER,
  DEMO_ISSUER_NAME,
  DEMO_VERIFIER,
  holderCnfPublicJwk,
  holderPrivateJwk,
  signPrivateJwk,
  signPublicJwk,
} from './material.js';
import { buildMdoc } from './mdoc.js';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const JWT_KEEP = new Set([
  'iss',
  'sub',
  'iat',
  'exp',
  'nbf',
  'vct',
  'vct#integrity',
  'cnf',
  'status',
  'verification',
  'issuing_authority',
  'issuing_country',
  'issuance_date',
  'date_of_expiry',
  '_sd',
  '_sd_alg',
]);

function resourceByUrl(dump, url) {
  if (!url) return null;
  const clean = String(url).split('#')[0];
  return (
    (dump?.resources || []).find((r) => r.url === clean || (r.path && clean.endsWith(r.path.replace(/^\//, '')))) || null
  );
}

function uuidV4() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requiredKeys(schema) {
  const keys = new Set(schema?.required || []);
  const alt = schema?.anyOf || schema?.oneOf;
  if (alt?.[0]?.required) {
    for (const key of alt[0].required) keys.add(key);
  }
  return [...keys];
}

export function exampleFromSchema(schema, ctx, key = '') {
  if (!schema || typeof schema !== 'object') return ctx.fallback || 'demo';
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  if (key === 'iss') return ctx.issuer;
  if (key === 'sub') return ctx.sub;
  if (key === 'vct') return ctx.vct;
  if (key === 'cnf') return { jwk: ctx.holderJwk };
  if (key === 'issuing_authority' || key === 'document_iss_authority') return ctx.issuerName;
  if (key === 'iat' || key === 'nbf') return ctx.now;
  if (key === 'exp') return ctx.exp;

  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;

  if (schema.format === 'date') return key === 'date_of_expiry' || key === 'expiry_date' ? '2030-12-31' : '1990-01-15';
  if (schema.format === 'date-time') return '2024-03-15T10:00:00Z';
  if (schema.format === 'uri') {
    if (key === 'iss') return ctx.issuer;
    return `${ctx.issuer}/status/demo`;
  }
  if (typeof schema.pattern === 'string') {
    if (schema.pattern.includes('data:image')) return TINY_PNG;
    if (schema.pattern.includes('[A-Z]{2}')) return 'IT';
    if (schema.pattern.includes('a-f0-9') && schema.pattern.includes('{8}')) return ctx.sub;
  }

  if (type === 'object' || schema.properties) {
    const obj = {};
    const keys = requiredKeys(schema);
    const props = schema.properties || {};
    const names = keys.length ? keys : Object.keys(props);
    for (const name of names) {
      if (name === '_sd' || name === '_sd_alg') continue;
      if (!props[name]) continue;
      obj[name] = exampleFromSchema(props[name], ctx, name);
    }
    return obj;
  }

  if (type === 'array') {
    const min = schema.minItems > 0 ? schema.minItems : 1;
    const item = exampleFromSchema(schema.items || {}, ctx, key);
    return Array.from({ length: min }, () => item);
  }

  if (type === 'integer' || type === 'number') return schema.minimum ?? 0;
  if (type === 'boolean') return true;

  if (key === 'given_name') return 'Mario';
  if (key === 'family_name') return 'Rossi';
  if (key === 'tax_id_code') return 'RSSMRA80A01H501U';
  if (key === 'personal_administrative_number') return 'DEMO-123456';
  if (key === 'document_number') return 'IT-DEMO-0001';
  if (key === 'place_of_birth') return 'Roma';
  if (key === 'vehicle_category_code') return 'B';
  if (key === 'code') return '01';
  if (key === 'un_distinguishing_sign') return 'I';
  return `demo-${key || 'value'}`;
}

export function claimsFromCddl(cddl, ctx) {
  const claims = {
    iss: ctx.issuer,
    sub: ctx.sub,
    iat: ctx.now,
    exp: ctx.exp,
    vct: ctx.vct,
    issuing_country: 'IT',
    issuing_authority: ctx.issuerName,
    cnf: { jwk: ctx.holderJwk },
  };
  const docType = String(cddl || '').match(/"docType"\s*:\s*tstr\s*\.enum\s*\("([^"]+)"\)/);
  if (docType) claims.docType = docType[1];
  for (const match of String(cddl || '').matchAll(/elementIdentifier:\s*DataElementIdentifier\s*\.enum\s*\("([^"]+)"\)/g)) {
    const name = match[1];
    if (claims[name] != null) continue;
    if (name === 'age_over_18' || name.startsWith('age_over_')) claims[name] = true;
    else if (name === 'sub') claims.sub = ctx.sub;
    else if (name === 'issuing_country') claims.issuing_country = 'IT';
    else if (name === 'issuing_authority') claims.issuing_authority = ctx.issuerName;
    else if (name === 'verification') {
      claims.verification = {
        trust_framework: 'it_wallet',
        assurance_level: 'https://ta.wallet.ipzs.it/loa/high',
      };
    } else claims[name] = exampleFromSchema({ type: 'string' }, ctx, name);
  }
  return claims;
}

function schemaRowsFor(node, dump) {
  return (dump?.schemas || []).filter((row) => row.credential_type === node.credential_type);
}

function schemaBody(dump, row) {
  const res = resourceByUrl(dump, row?.schema_uri);
  if (!res) return { json: null, raw: '', res: null };
  if (res.json && typeof res.json === 'object') return { json: res.json, raw: res.raw || '', res };
  const parsed = tryParseJson(res.raw);
  return { json: parsed.ok ? parsed.value : null, raw: res.raw || '', res };
}

export function demoContext(node, dump, schemaRow) {
  const now = Math.floor(Date.now() / 1000);
  return {
    issuer: DEMO_ISSUER,
    issuerName: DEMO_ISSUER_NAME,
    sub: uuidV4(),
    now,
    exp: now + 365 * 24 * 60 * 60,
    vct: schemaRow?.vct || schemaRow?.docType || `urn:it-wallet:${node.credential_type}:1`,
    holderJwk: holderCnfPublicJwk(),
    type: node.credential_type,
  };
}

async function disclosureDigest(encoded) {
  return bytesToB64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded))));
}

export async function buildSdJwtVc(claims, ctx = {}) {
  const jwtPayload = {};
  const disclosures = [];
  for (const [name, value] of Object.entries(claims)) {
    if (name === '_sd' || name === '_sd_alg') continue;
    if (JWT_KEEP.has(name)) {
      jwtPayload[name] = value;
      continue;
    }
    const salt = bytesToB64url(crypto.getRandomValues(new Uint8Array(16)));
    const json = [salt, name, value];
    const encoded = bytesToB64url(new TextEncoder().encode(JSON.stringify(json)));
    disclosures.push({ name, value, json, encoded });
    jwtPayload._sd = jwtPayload._sd || [];
    jwtPayload._sd.push(await disclosureDigest(encoded));
  }
  if (!jwtPayload._sd?.length) {
    const salt = bytesToB64url(crypto.getRandomValues(new Uint8Array(16)));
    const json = [salt, 'given_name', claims.given_name || 'Mario'];
    const encoded = bytesToB64url(new TextEncoder().encode(JSON.stringify(json)));
    disclosures.push({ name: 'given_name', value: json[2], json, encoded });
    jwtPayload._sd = [await disclosureDigest(encoded)];
  }
  jwtPayload._sd_alg = 'sha-256';
  if (!jwtPayload.cnf) jwtPayload.cnf = { jwk: ctx.holderJwk || holderCnfPublicJwk() };

  const signed = await signEs256Jwt(jwtPayload, signPrivateJwk, { typ: 'dc+sd-jwt', kid: signPrivateJwk.kid });
  const presentation = `${signed.token}~${disclosures.map((d) => d.encoded).join('~')}~`;
  const sdHash = bytesToB64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(presentation))));
  const kbPayload = {
    iat: ctx.now || Math.floor(Date.now() / 1000),
    aud: DEMO_VERIFIER,
    nonce: 'itw-demo-kb-nonce',
    sd_hash: sdHash,
  };
  const kb = await signEs256Jwt(kbPayload, holderPrivateJwk, { typ: 'kb+jwt', kid: holderPrivateJwk.kid });
  const sdJwt = `${presentation}${kb.token}`;

  const reconstructed = { ...jwtPayload };
  delete reconstructed._sd;
  delete reconstructed._sd_alg;
  for (const disc of disclosures) reconstructed[disc.name] = disc.value;

  const issuerOk = await verifyJwt(signed.token, [signPublicJwk]);
  const kbOk = await verifyJwt(kb.token, [holderCnfPublicJwk()]);
  const verified = Boolean(issuerOk.ok && kbOk.ok);

  return {
    format: 'dc+sd-jwt',
    sdJwt,
    token: signed.token,
    header: signed.header,
    payload: signed.payload,
    disclosures,
    keyBinding: { jwt: kb.token, header: kb.header, payload: kb.payload, verified: Boolean(kbOk.ok) },
    reconstructed,
    verified,
    verifyError: issuerOk.error || kbOk.error || null,
    artifact: {
      title: 'demo credential (SD-JWT VC)',
      url: '',
      path: '',
      contentType: 'application/dc+sd-jwt',
      jwt: true,
      raw: sdJwt,
      header: signed.header,
      payload: signed.payload,
      excerpt: {
        issuer: DEMO_ISSUER,
        format: 'dc+sd-jwt',
        verified,
        keys: {
          sign_public: 'demo/keys/issuer-sign.public.jwk.json',
          sign_private: 'demo/keys/issuer-sign.private.jwk.json',
          holder_cnf: 'demo/keys/holder-cnf.public.jwk.json',
          holder_private: 'demo/keys/holder-cnf.private.jwk.json',
        },
        disclosures: disclosures.map((d) => d.json),
        key_binding: { typ: 'kb+jwt', header: kb.header, payload: kb.payload, jwt: kb.token },
        claims: reconstructed,
      },
      excerptTitle: ctx.type || '',
    },
  };
}

export async function buildSdJwt(claims, options) {
  return buildSdJwtVc(claims, options);
}

function mdocArtifact(built, credentialType) {
  return {
    title: 'demo credential (mso_mdoc)',
    url: '',
    path: '',
    contentType: 'application/cbor',
    jwt: false,
    raw: built.hex,
    json: null,
    diagnostic: built.diagnostic,
    excerpt: built.decoded,
    excerptTitle: credentialType,
  };
}

export async function buildDemoCredentials(node, dump) {
  if (!node || node.kind !== 'credential') return [];
  const rows = schemaRowsFor(node, dump);
  const jsonRow = rows.find((row) => row.format === 'dc+sd-jwt' || String(row.schema_uri || '').endsWith('.json'));
  const cddlRow = rows.find((row) => row.format === 'mso_mdoc' || String(row.schema_uri || '').endsWith('.cddl'));
  const jsonBody = jsonRow ? schemaBody(dump, jsonRow) : { json: null, raw: '' };
  const cddlBody = cddlRow ? schemaBody(dump, cddlRow) : { json: null, raw: '' };
  const ctx = demoContext(node, dump, jsonRow || cddlRow);
  const out = [];

  if (jsonBody.json) {
    const claims = exampleFromSchema(jsonBody.json, ctx);
    out.push(await buildSdJwtVc(claims, { ...ctx, type: node.credential_type }));
  }

  const cddlText = cddlBody.raw && !tryParseJson(cddlBody.raw).ok ? cddlBody.raw : '';
  if (cddlText) {
    const mdoc = await buildMdoc(cddlText, ctx);
    mdoc.artifact = mdocArtifact(mdoc, node.credential_type);
    out.push(mdoc);
  }

  return out;
}

export async function buildDemoCredential(node, dump) {
  const items = await buildDemoCredentials(node, dump);
  return items[0] || null;
}
