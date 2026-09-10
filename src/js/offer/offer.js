/**
 * Build a by-value OpenID4VCI credential offer URI.
 * issuer_state is omitted unless the UI supplies an encrypted example
 * (urn:it-wallet:credential-offer:{as}:{dataset}[:{object}]).
 */

export function configurationIdsFor(credentialType, formats = []) {
  const ids = [];
  for (const format of formats) {
    if (format === 'dc+sd-jwt') ids.push(`dc_sd_jwt_${credentialType}`);
    else if (format === 'mso_mdoc') ids.push(`mso_mdoc_${credentialType}`);
  }
  if (!ids.length) ids.push(`dc_sd_jwt_${credentialType}`);
  return ids;
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

function bytesToB64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
