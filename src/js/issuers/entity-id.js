/** Catalog issuer identifiers and well-known URLs. */

export function canonicalizeIssuerEntityId(id) {
  const raw = String(id || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const parts = u.pathname.split('/').filter(Boolean);
    while (parts.length >= 2 && parts[parts.length - 1] === parts[parts.length - 2]) {
      parts.pop();
    }
    u.pathname = parts.length ? `/${parts.join('/')}` : '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
}

export function issuerIdOf(issuer) {
  return canonicalizeIssuerEntityId(
    issuer?.id || issuer?.entity_id || issuer?.organization_code || '',
  );
}

export function issuerWellKnownUrl(issuerId, name) {
  const id = canonicalizeIssuerEntityId(issuerId);
  return id ? `${id}/.well-known/${name}` : '';
}

/** Hostname plus path of an issuer entity_id, e.g. pre.eid.wallet.ipzs.it/1-3. */
export function issuerNodeName(issuerId) {
  const id = canonicalizeIssuerEntityId(issuerId);
  if (!id) return '';
  try {
    const u = new URL(id);
    const path = u.pathname.replace(/\/$/, '');
    return path ? `${u.hostname}${path}` : u.hostname;
  } catch {
    return id.replace(/^https?:\/\//i, '');
  }
}

export function issuerOptionLabel(orgLabel, issuerId) {
  const node = issuerNodeName(issuerId);
  const label = String(orgLabel || '').trim();
  if (!node) return label || String(issuerId || '');
  if (!label || label === issuerId || label === node) return node;
  if (label.includes(node)) return label;
  return `${label} (${node})`;
}
