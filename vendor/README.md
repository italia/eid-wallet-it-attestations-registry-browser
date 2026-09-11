Vendored official IT-Wallet UI assets (Bootstrap Italia sprites, logos, `header-lang-dropdown.js`, optional `style.css`) should be copied here from:

`eidas-it-wallet-docs/official_resources/shared-ui/`

The small header mark on the slim `bg-primary` bar is the official **IT-Wallet Symbol** (negative white), copied from:

`official_resources/IT-Wallet-Symbol/IT-Wallet-Symbol-Negative-White.svg`

It lives in `vendor/img/` and is served from `public/img/` (Vite `publicDir`). Do not invent a substitute: the ST brand identity requires this SVG (`application/svg+xml`).

See docs/ACCESSIBILITY.md. Until the rest of shared-ui lands, `index.html` uses the Bootstrap Italia CDN for the shell.
