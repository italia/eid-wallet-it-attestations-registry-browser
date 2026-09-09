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

function decodeSegment(segment) {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function parseRegistryBody(text, contentType = '') {
  const raw = String(text ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return { json: null, jwt: false, header: null, raw };
  if (trimmed.startsWith('<')) return { json: null, jwt: false, header: null, html: true, raw };
  const looksJwt = trimmed.split('.').length === 3 && /^[A-Za-z0-9_-]+\./.test(trimmed);
  if (looksJwt || /jose|jwt/i.test(contentType)) {
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
