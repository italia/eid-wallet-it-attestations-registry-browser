/** Decode JOSE compact serialization (base64url, with padding). */
export function decodeJwt(token) {
  const parts = String(token).trim().split('.');
  if (parts.length < 2) return null;
  try {
    return { header: decodeSegment(parts[0]), payload: decodeSegment(parts[1]) };
  } catch {
    return null;
  }
}

export function decodeSegmentBytes(segment) {
  const b64 = String(segment).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeSegment(segment) {
  return JSON.parse(new TextDecoder().decode(decodeSegmentBytes(segment)));
}

export function jwksFromFederationPayload(payload) {
  const keys = [];
  const seen = new Set();
  const push = (list) => {
    for (const key of list || []) {
      if (!key?.kid || seen.has(key.kid)) continue;
      seen.add(key.kid);
      keys.push(key);
    }
  };
  push(payload?.jwks?.keys);
  push(payload?.metadata?.federation_entity?.jwks?.keys);
  return keys;
}

function jwkToImport(jwk) {
  const { d, p, q, dp, dq, qi, ...pub } = jwk;
  return pub;
}

export async function verifyJwt(token, keys) {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3) return { ok: false, error: 'not a compact JWT' };
  const decoded = decodeJwt(token);
  if (!decoded?.header) return { ok: false, error: 'JWT header not decodable' };
  const { alg, kid } = decoded.header;
  if (alg !== 'ES256') {
    return { ok: false, error: `unsupported alg ${alg || '(none)'}`, header: decoded.header };
  }
  const key = (keys || []).find((k) => k.kid === kid) || (keys || []).find((k) => k.kty === 'EC');
  if (!key) {
    return { ok: false, error: kid ? `no JWKS key for kid ${kid}` : 'no JWKS key', header: decoded.header };
  }
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwkToImport(key),
      { name: 'ECDSA', namedCurve: key.crv || 'P-256' },
      false,
      ['verify'],
    );
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      decodeSegmentBytes(parts[2]),
      data,
    );
    return { ok, alg, kid: key.kid, header: decoded.header, error: ok ? null : 'signature mismatch' };
  } catch (err) {
    return { ok: false, alg, kid: key.kid, header: decoded.header, error: err.message || String(err) };
  }
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Sri(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `sha256-${btoa(bin)}`;
}

export async function checkSri(text, expected) {
  const want = String(expected || '').trim();
  if (!want) return { skipped: true, ok: true, expected: '', actual: '' };
  const actual = want.startsWith('sha256-') ? await sha256Sri(text) : await sha256Hex(text);
  const ok = actual === want;
  return { skipped: false, ok, expected: want, actual, error: ok ? null : 'integrity mismatch' };
}

export function bytesToB64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signEs256Jwt(payload, privateJwk, extraHeader = {}) {
  const header = { alg: 'ES256', typ: extraHeader.typ || 'JWT', ...extraHeader };
  if (privateJwk?.kid && header.kid == null) header.kid = privateJwk.kid;
  const headerB64 = bytesToB64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: privateJwk.crv || 'P-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  return { token: `${headerB64}.${payloadB64}.${bytesToB64url(sig)}`, header, payload };
}

export function parseRegistryBody(text, contentType = '') {
  const raw = String(text ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return { json: null, jwt: false, header: null, raw };
  if (trimmed.startsWith('<')) return { json: null, jwt: false, header: null, html: true, raw };
  const looksJwt = trimmed.split('.').length === 3 && /^[A-Za-z0-9_-]+\./.test(trimmed);
  if (looksJwt || /jose|jwt|entity-statement/i.test(contentType)) {
    const decoded = decodeJwt(trimmed);
    return { json: decoded?.payload ?? null, header: decoded?.header ?? null, jwt: true, raw: trimmed };
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || /json/i.test(contentType)) {
    try {
      return { json: JSON.parse(trimmed), jwt: false, header: null, raw: trimmed };
    } catch {
      return { json: null, jwt: false, header: null, raw };
    }
  }
  return { json: null, jwt: false, header: null, raw };
}
