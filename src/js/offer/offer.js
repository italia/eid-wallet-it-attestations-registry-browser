/**
 * Build a by-value OpenID4VCI credential offer URI.
 * issuer_state is omitted unless the UI supplies an encrypted example
 * (urn:it-wallet:credential-offer:{as}:{dataset}[:{object}]).
 */

import { bytesToB64url, decodeSegmentBytes } from '../cache/jwt.js';

export function configurationIdsFor(credentialType, formats = [], metadata) {
  const fromMeta = configurationIdsFromMetadata(metadata, credentialType, formats);
  if (fromMeta.ids.length) return fromMeta;
  const ids = [];
  for (const format of formats) {
    if (format === 'dc+sd-jwt') ids.push(`dc_sd_jwt_${credentialType}`);
    else if (format === 'mso_mdoc') ids.push(`mso_mdoc_${credentialType}`);
  }
  if (!ids.length) ids.push(`dc_sd_jwt_${credentialType}`);
  return { ids, derived: true };
}

export function configurationIdsFromMetadata(metadata, credentialType, formats = []) {
  const configs = metadata?.credential_configurations_supported;
  if (!configs || typeof configs !== 'object') return { ids: [], derived: false };
  const type = String(credentialType || '');
  const wantedFormats = new Set(formats.filter(Boolean));
  const ids = [];
  for (const [id, cfg] of Object.entries(configs)) {
    const format = cfg?.format || '';
    const scope = cfg?.scope || '';
    const schemaId = cfg?.schema_id || '';
    const matchesType =
      id.endsWith(`_${type}`) ||
      scope === type ||
      String(schemaId).startsWith(`${type}+`) ||
      String(cfg?.vct || '').includes(type);
    if (!matchesType) continue;
    if (wantedFormats.size && format && !wantedFormats.has(format)) continue;
    ids.push(id);
  }
  return { ids, derived: false };
}

export function issuerStateUrn({ authenticSourceId, datasetId, objectId } = {}) {
  const as = String(authenticSourceId || '').trim();
  const dataset = String(datasetId || '').trim();
  if (!as || !dataset) return '';
  const object = String(objectId || '').trim();
  if (object) return `urn:it-wallet:credential-offer:${as}:${dataset}:${object}`;
  return `urn:it-wallet:credential-offer:${as}:${dataset}`;
}

export function credentialOfferObject({ credentialIssuer, configurationIds, issuerState } = {}) {
  const grants = { authorization_code: {} };
  if (issuerState) grants.authorization_code.issuer_state = issuerState;
  return {
    credential_issuer: credentialIssuer,
    credential_configuration_ids: configurationIds,
    grants,
  };
}

export function credentialOfferHref({
  credentialIssuer,
  configurationIds,
  scheme = 'openid-credential-offer',
  issuerState,
  body,
} = {}) {
  const json = body || credentialOfferObject({ credentialIssuer, configurationIds, issuerState });
  const param = encodeURIComponent(JSON.stringify(json));
  return `${scheme}://?credential_offer=${param}`;
}

async function importRsaOaepPublicKey(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) throw new Error('missing public key');
  if (trimmed.startsWith('{')) {
    const jwk = JSON.parse(trimmed);
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  }
  const pem = trimmed.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('spki', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

/** Compact JWE (RSA-OAEP-256 / A256GCM) of the issuer_state URN. Exemplificativo. */
export async function encryptIssuerState(urn, publicKeyInput) {
  const key = await importRsaOaepPublicKey(publicKeyInput);
  const header = { alg: 'RSA-OAEP-256', enc: 'A256GCM' };
  const headerB64 = bytesToB64url(new TextEncoder().encode(JSON.stringify(header)));
  const cek = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const packed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(headerB64), tagLength: 128 },
      aesKey,
      new TextEncoder().encode(urn),
    ),
  );
  const ciphertext = packed.slice(0, packed.length - 16);
  const tag = packed.slice(packed.length - 16);
  const encryptedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, cek);
  return [headerB64, bytesToB64url(encryptedKey), bytesToB64url(iv), bytesToB64url(ciphertext), bytesToB64url(tag)].join(
    '.',
  );
}

async function importRsaOaepPrivateKey(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) throw new Error('missing private key');
  if (trimmed.startsWith('{')) {
    const jwk = JSON.parse(trimmed);
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  }
  const pem = trimmed.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
}

/** Decrypt a compact JWE issuer_state produced by encryptIssuerState. Exemplificativo. */
export async function decryptIssuerState(jwe, privateKeyInput) {
  const parts = String(jwe || '').trim().split('.');
  if (parts.length !== 5) throw new Error('not a compact JWE');
  const key = await importRsaOaepPrivateKey(privateKeyInput);
  const headerB64 = parts[0];
  const cek = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, decodeSegmentBytes(parts[1])));
  const iv = decodeSegmentBytes(parts[2]);
  const ciphertext = decodeSegmentBytes(parts[3]);
  const tag = decodeSegmentBytes(parts[4]);
  const packed = new Uint8Array(ciphertext.length + tag.length);
  packed.set(ciphertext, 0);
  packed.set(tag, ciphertext.length);
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(headerB64), tagLength: 128 },
    aesKey,
    packed,
  );
  return new TextDecoder().decode(plain);
}
