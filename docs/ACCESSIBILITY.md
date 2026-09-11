# Accessibility and official templates

References to copy (do not reinvent):

- `eidas-it-wallet-docs/official_resources/discovery-page/disco.html`
- `eidas-it-wallet-docs/official_resources/it-wallet-selection-page/it-wallet.html`
- `eidas-it-wallet-docs/official_resources/shared-ui/`
- Bootstrap Italia, WCAG 2.1 level AA (as declared in those pages’ READMEs)

## 1. Structure mapping

| Official element | Explorer |
|------------------|----------|
| `nav.it-skip-links` → `#main-content`, `#page-footer` | Same + skip to `#registry-graph` and `#message-board` |
| Slim header `bg-primary` + brand | IT-Wallet Negative White symbol (`#header-it-wallet-logo`, `aria-hidden`) + brand “IT-Wallet Attestations” / “Attestati IT-Wallet” (i18n) |
| ITA/EN language dropdown (`menuitemradio`) | `disco.html` markup and CSS: `nav-link.dropdown-toggle`, `it-expand` icon, `link-list-wrapper`, 24 px Popper offset, `ITA`/`EN` label (NF-07) |
| Slim right zone | **Board bell** (`button.nav-link`) **then** language dropdown, same row |
| `header-title-section` + logo | Page title; the small symbol is already in the slim header (do not repeat the wordmark) |
| CORS live-fetch warning | `alert alert-warning` `#cors-fault-alert` (`role="alert"`, 14 px, `alert-link` “Read more”) — same pattern as openid-federation-browser; GitHub docs for details |
| Demo credential warning | `alert alert-warning` `#example-warning` (`role="alert"`); `demo/keys/` link to GitHub |
| Credential demo UI | `#example-cards` smartcard (`article.demo-card`); claim `<dl>` with labels from issuer metadata |
| Result kind icon | Bootstrap Italia sprite to the left of each `#results-list` button (`aria-hidden` SVG + visually hidden kind label) |
| Credential issuer metadata | `#credential-issuer`; `openid-credential-issuer` and `openid-federation` (original JWT/JSON, decoded JSON tree, excerpt of matching `credential_configuration_id`); `#issuer-mismatch-*` (`alert alert-warning`, `role="alert"`) when the two documents diverge |
| `main#main-content` | h1 + search + list/graph split |
| Legal footer Notes / Accessibility | Links to project pages (legal notes, requirements, accessibility, GitHub) |
| `noscript` | i18n message |
| i18n from JSON | `src/locales/it.json`, `en.json` (module `src/js/i18n/`) |

## 2. Message board (NF-02, F-06, F-07, A-24)

- Trigger: `button.nav-link` in `.it-header-slim-right-zone`, **before** the language dropdown, same row (slim `disco.html` style, not `btn btn-link`).
- Container: Bootstrap Italia Offcanvas `placement="end"`.
- List `role="log"` `aria-live="polite"`: **one entry per GET** (endpoint, HTTP status, duration ms, application type).
- Errors: reason text + Retry `button`.
- Badge: `aria-label` “N errors on the board”.
- Focus: on close, focus returns to the icon button (like official dropdowns).
- CORS: when live TA requests fail, the board also shows a short note and the same GitHub “Read more” link as `#cors-fault-alert`.

## 3. Graph

A Cytoscape canvas is not enough for AA:

- twin list/table with the same visible nodes
- textual caption of the filter (“12 nodes visible of 40, query …”)
- zoom controls as icon `button`s (`it-zoom-in` / `it-zoom-out` / `it-maximize`) with visually hidden text
- node/text contrast ≥ 4.5:1 (Italia palette, not default Cytoscape)

## 4. Search and offer

- `it-wallet.html` search pattern (clear, `aria-invalid` on parse error)
- Facets and environment: visible headings (`h2`/`h3` + `label`) for Environment, search, `legal_type`, issuer, authentic source, claim; Trust Anchor as a text link
- QR: `alt` = URI; the text link is always present (the QR is not the only path)
- Demo mdoc credential: Original (hex), CBOR diagnostic notation (`<pre>`), decoded structure tabs
- Detail modals: Bootstrap Italia focus trap

## 5. Assets to vendor

Copy from `official_resources/shared-ui/` (with attribution in NOTICE):

- `css/bootstrap-italia.min.css` **or** the npm package (same visual family)
- `css/style.css` (slim header, skip-link, footer)
- `js/bootstrap-italia.bundle.min.js`
- `js/header-lang-dropdown.js`
- `svg/sprites.svg`
- logos `img/IT-Wallet-Logo-Primary-BlueItalia.svg` (wordmark on a light background)
- small symbol `IT-Wallet-Symbol-Negative-White.svg` (slim header `bg-primary`; already in `public/img/` and `vendor/img/`)
- Titillium / Lora / Roboto Mono fonts if the official CSS is vendored

Until the rest of shared-ui is copied, `index.html` may point at the Bootstrap Italia jsDelivr CDN. The Pages build SHOULD become self-contained; today the shell still loads CSS/JS from that CDN.
