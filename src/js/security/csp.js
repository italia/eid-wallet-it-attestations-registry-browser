/**
 * Production Content-Security-Policy (A-20).
 * Applied as `<meta http-equiv>` by Vite on `vite build` only.
 * Dev / Playwright keep Vite HMR (eval + inline) without this policy.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.ipzs.it",
  "worker-src 'self'",
].join('; ');
