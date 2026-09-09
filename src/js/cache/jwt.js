/** Decode JOSE compact serialization. Signature verify is phase 2 (JWKS). */
export function decodeJwt(token) {
  const parts = String(token).trim().split('.');
  if (parts.length < 2) return null;
  const json = (segment) => JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/')));
  return { header: json(parts[0]), payload: json(parts[1]) };
}
