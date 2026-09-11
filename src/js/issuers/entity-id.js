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
