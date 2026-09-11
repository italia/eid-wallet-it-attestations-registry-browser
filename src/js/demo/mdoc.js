/** ISO/IEC 18013-5 mdoc: DeviceResponse → Document → IssuerSigned + untagged COSE_Sign1. */

import { decodeSegmentBytes } from '../cache/jwt.js';
import { bytesToHex, cborEmbedded, cborTag, cborWrap, encodeCbor, toCborDiag } from './cbor.js';
import { DEMO_ISSUER_NAME, holderCnfPublicJwk, signPrivateJwk, signPublicJwk } from './material.js';

const PNG = decodeSegmentBytes(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
);

function utf8(text) {
  return new TextEncoder().encode(String(text));
}

function jwkXy(jwk) {
  return {
    x: decodeSegmentBytes(jwk.x),
    y: decodeSegmentBytes(jwk.y),
  };
}

function cddlChunks(text) {
  return String(text || '')
    .split(/(?=(?:^|\n)[A-Za-z][A-Za-z0-9_]*\s*=)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function parseChunk(chunk) {
  const head = chunk.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/);
  if (!head) return null;
  return { name: head[1], rhs: head[2].trim() };
}

function extractBracketLists(body) {
  const out = [];
  const re = /"([^"]+)"\s*:\s*\[/g;
  let match;
  while ((match = re.exec(body))) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < body.length && depth) {
      if (body[i] === '[') depth += 1;
      else if (body[i] === ']') depth -= 1;
      i += 1;
    }
    out.push({ name: match[1], items: body.slice(start, i - 1) });
  }
  return out;
}

export function parseCddlMdoc(cddl) {
  const text = String(cddl || '');
  const typeToId = new Map();
  const typeToValue = new Map();
  const typeBodies = new Map();
  let docType = '';
  let nsRhs = '';

  for (const chunk of cddlChunks(text)) {
    const parsed = parseChunk(chunk);
    if (!parsed) continue;
    const { name, rhs } = parsed;
    typeBodies.set(name, rhs);
    const id = rhs.match(/elementIdentifier:\s*DataElementIdentifier\s*\.enum\s*\("([^"]+)"\)/)?.[1];
    if (id) {
      const value = rhs
        .split(/elementValue:\s*/)[1]
        ?.replace(/\}+\s*$/g, '')
        .trim();
      typeToId.set(name, id);
      typeToValue.set(name, value || 'any');
    }
    const doc = rhs.match(/"docType"\s*:\s*tstr\s*\.enum\s*\("([^"]+)"\)/);
    if (doc) docType = doc[1];
    if (name === 'IssuerNameSpacesObjectBytes') nsRhs = rhs;
  }

  const namespaces = [];
  for (const ns of extractBracketLists(nsRhs)) {
    const items = [];
    for (const typeMatch of ns.items.matchAll(/#6\.24\(bstr\s*\.cbor\s+([A-Za-z0-9_]+)\)/g)) {
      const typeName = typeMatch[1];
      const id = typeToId.get(typeName);
      if (!id) continue;
      items.push({ id, typeName, valueSpec: typeToValue.get(typeName) || 'tstr' });
    }
    if (items.length) namespaces.push({ name: ns.name, items });
  }
  if (!namespaces.length) {
    const items = [...typeToId.entries()].map(([typeName, id]) => ({
      id,
      typeName,
      valueSpec: typeToValue.get(typeName) || 'tstr',
    }));
    if (items.length) namespaces.push({ name: docType || 'org.iso.18013.5.1', items });
  }
  return { docType: docType || 'org.iso.18013.5.1.mDL', namespaces, typeBodies };
}

function tdate(iso) {
  return cborTag(0, iso);
}

function exampleFromCddlMap(rhs, ctx, depth = 0) {
  if (depth > 4 || typeof rhs !== 'string') return {};
  const body = rhs.replace(/^\{\s*/, '').replace(/\}\s*$/, '');
  const obj = {};
  for (const line of body.split('\n')) {
    const field = line.match(/^\s*\??\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.+?)\s*,?\s*$/);
    if (!field) continue;
    const name = field[1];
    if (name === 'digestID' || name === 'random' || name === 'elementIdentifier' || name === 'elementValue') continue;
    obj[name] = mdocElementValue(name, field[2], ctx, depth + 1);
  }
  return obj;
}

export function mdocElementValue(id, spec, ctx, depth = 0) {
  const hint = String(spec || '');
  const arrType = hint.match(/\[\s*1\*\s*([A-Za-z0-9_]+)\s*\]/);
  if (arrType && ctx?.typeBodies?.has(arrType[1]) && depth < 4) {
    return [exampleFromCddlMap(ctx.typeBodies.get(arrType[1]), ctx, depth + 1)];
  }
  if (id === 'age_over_18' || id.startsWith('age_over_') || /\bbool\b/.test(hint)) return true;
  if (id === 'portrait' || id === 'content' || /(^|\s)bstr(\s|$)/.test(hint)) return PNG;
  if (id === 'given_name') return 'Mario';
  if (id === 'family_name') return 'Rossi';
  if (id === 'tax_id_code') return 'RSSMRA80A01H501U';
  if (id === 'birth_place' || id === 'place_of_birth') return 'Roma';
  if (id === 'document_number') return 'IT-DEMO-0001';
  if (id === 'un_distinguishing_sign') return 'I';
  if (id === 'issuing_country' || id === 'document_iss_country') return 'IT';
  if (id === 'issuing_authority' || id === 'document_iss_authority') return ctx.issuerName || DEMO_ISSUER_NAME;
  if (id === 'sub') return ctx.sub;
  if (id === 'verification' || /VerificationValue/.test(hint)) {
    return {
      trust_framework: 'it_wallet',
      assurance_level: 'https://ta.wallet.ipzs.it/loa/high',
    };
  }
  if (id === 'driving_privileges' || /DrivingPrivilege/.test(hint)) {
    return [
      {
        vehicle_category_code: 'B',
        issue_date: tdate('2020-01-15T00:00:00Z'),
        expiry_date: tdate('2030-12-31T00:00:00Z'),
      },
    ];
  }
  if (/tdate/.test(hint) || /_date$/.test(id) || id === 'expiry_date' || id === 'issue_date' || id === 'birth_date') {
    if (id.includes('expir')) return tdate('2030-12-31T00:00:00Z');
    if (id.includes('issue') || id.includes('effective')) return tdate('2020-01-15T00:00:00Z');
    return tdate('1990-01-15T00:00:00Z');
  }
  return `demo-${id}`;
}

function coseKeyFromJwk(jwk) {
  const { x, y } = jwkXy(jwk);
  return new Map([
    [1, 2],
    [-1, 1],
    [-2, x],
    [-3, y],
  ]);
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

async function signCoseEs256(payload, privateJwk, kid) {
  const protectedBytes = encodeCbor(new Map([[1, -7]]));
  const unprotected = new Map([[4, utf8(kid || privateJwk.kid || 'itw-demo-sig-1')]]);
  const sigStructure = encodeCbor(['Signature1', protectedBytes, new Uint8Array(0), payload]);
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: privateJwk.crv || 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, sigStructure));
  return [protectedBytes, unprotected, payload, signature];
}

export async function verifyCoseEs256(issuerAuth, publicJwk) {
  const arr = issuerAuth?.$cborTag === 18 ? issuerAuth.value : issuerAuth;
  if (!Array.isArray(arr) || arr.length !== 4) return { ok: false, error: 'not COSE_Sign1' };
  const [protectedBytes, , payload, signature] = arr;
  const sigStructure = encodeCbor(['Signature1', protectedBytes, new Uint8Array(0), payload]);
  const pub = { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y };
  const key = await crypto.subtle.importKey(
    'jwk',
    pub,
    { name: 'ECDSA', namedCurve: publicJwk.crv || 'P-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, sigStructure);
  return { ok, error: ok ? null : 'signature mismatch' };
}

export function jsonSafe(value) {
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (value && Number.isInteger(value.$cborTag)) {
    if (value.$cborTag === 0) return { tdate: value.value };
    return { tagged: value.$cborTag, value: jsonSafe(value.value) };
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value instanceof Map) {
    const out = {};
    for (const [k, v] of value) out[String(k)] = jsonSafe(v);
    return out;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

export async function buildMdoc(cddl, ctx) {
  const parsed = parseCddlMdoc(cddl);
  const holder = ctx.holderJwk || holderCnfPublicJwk();
  const signed = new Date(ctx.now * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  const validFrom = signed;
  const validUntil = new Date(ctx.exp * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  const valueCtx = { ...ctx, typeBodies: parsed.typeBodies };

  const nameSpaces = {};
  const nameSpaceItems = {};
  const valueDigests = {};
  const claims = {};
  const disclosed = {};
  let digestId = 0;
  for (const ns of parsed.namespaces) {
    const items = [];
    const plainItems = [];
    const decodedItems = [];
    const digests = new Map();
    for (const el of ns.items) {
      const elementValue = mdocElementValue(el.id, el.valueSpec, valueCtx);
      const item = {
        digestID: digestId,
        random: crypto.getRandomValues(new Uint8Array(16)),
        elementIdentifier: el.id,
        elementValue,
      };
      const itemBytes = encodeCbor(item);
      const tagged = encodeCbor(cborTag(24, itemBytes));
      items.push(cborTag(24, itemBytes));
      plainItems.push(item);
      digests.set(digestId, await sha256(tagged));
      claims[el.id] = jsonSafe(elementValue);
      decodedItems.push({
        digestID: digestId,
        random: bytesToHex(item.random),
        elementIdentifier: el.id,
        elementValue: jsonSafe(elementValue),
      });
      digestId += 1;
    }
    nameSpaces[ns.name] = items;
    nameSpaceItems[ns.name] = plainItems;
    valueDigests[ns.name] = digests;
    disclosed[ns.name] = decodedItems;
  }

  const mso = {
    version: '1.0',
    digestAlgorithm: 'SHA-256',
    valueDigests,
    deviceKeyInfo: { deviceKey: coseKeyFromJwk(holder) },
    docType: parsed.docType,
    validityInfo: {
      signed: tdate(signed),
      validFrom: tdate(validFrom),
      validUntil: tdate(validUntil),
    },
  };
  const msoBytes = encodeCbor(mso);
  const payload = encodeCbor(cborTag(24, msoBytes));
  const issuerAuth = await signCoseEs256(payload, signPrivateJwk, signPrivateJwk.kid);
  const verified = await verifyCoseEs256(issuerAuth, signPublicJwk);

  const document = {
    docType: parsed.docType,
    issuerSigned: { nameSpaces, issuerAuth },
  };
  const deviceResponse = {
    version: '1.0',
    documents: [document],
    status: 0,
  };
  const cbor = encodeCbor(deviceResponse);
  const diagnostic = toCborDiag({
    version: '1.0',
    documents: [
      {
        docType: parsed.docType,
        issuerSigned: {
          nameSpaces: Object.fromEntries(
            Object.entries(nameSpaceItems).map(([name, items]) => [name, items.map((item) => cborEmbedded(item))]),
          ),
          issuerAuth: [
            cborWrap(new Map([[1, -7]])),
            issuerAuth[1],
            cborWrap(cborEmbedded(mso)),
            issuerAuth[3],
          ],
        },
      },
    ],
    status: 0,
  });
  const decoded = {
    version: '1.0',
    documents: [
      {
        docType: parsed.docType,
        issuerSigned: {
          nameSpaces: disclosed,
          issuerAuth: {
            protected: { '1': -7 },
            unprotected: { '4': signPrivateJwk.kid || 'itw-demo-sig-1' },
            payload: jsonSafe(mso),
            signature: bytesToHex(issuerAuth[3]),
          },
        },
      },
    ],
    status: 0,
  };
  return {
    format: 'mso_mdoc',
    docType: parsed.docType,
    cbor,
    hex: bytesToHex(cbor),
    diagnostic,
    claims,
    namespaces: parsed.namespaces.map((ns) => ns.name),
    decoded,
    verified: Boolean(verified.ok),
    verifyError: verified.error || null,
  };
}
