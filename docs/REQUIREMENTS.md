# Requirements — IT-Wallet Attestations Explorer and Demo

Requirements version: **0.6.0**  
Source: project request + review of the [registry handbook](EVALUATION_HANDBOOK.md) + IT-Wallet Technical Specifications v1.4.6 + UI updates (search facets, `disco.html` header, Trust Anchor switch, HTTP traces on the message board).

Priority: **MUST** / **SHOULD** / **MAY** (RFC 2119).

Changelog 0.6.0: page title **IT-Wallet Attestations Explorer and Demo**; node detail is one nested accordion (dump artifacts, **Credential issuer**, **Credential demo**, **Credential offer**, collapsed by default); issuer well-knowns from the dump also appear as artifacts on issuer nodes.  
Changelog 0.5.0: on each `credential` result, a Credential issuer section with `{issuer_id}/.well-known/openid-credential-issuer` and `{issuer_id}/.well-known/openid-federation` (original JWT/JSON, decoded JSON, matching `credential_configuration_id` excerpt), and a warning when the OpenID4VCI contents diverge; a **Credential demo UI** smartcard that uses `credential_configuration` display metadata (name, colours, claim labels) when present; each search result has a Bootstrap Italia kind icon (`it-card` for credentials).  
Changelog 0.4.0: on the `credential` node, data model (JSON Schema / CDDL) and demo credential (`dc+sd-jwt` and `mso_mdoc` ISO 18013-5 DeviceResponse as BINASCII hex + diagnostic notation, claims from the CDDL) with an illustration-only warning and link to `demo/keys/`; offer form pre-filled with the demo RSA key; IT-Wallet symbol (Negative White) in the slim header; page-level CORS warning (openid-federation-browser pattern) when live Trust Anchor HTTP requests fail.  
Changelog 0.3.0: F-05 live refresh + IndexedDB, F-07 per-resource retry, A-03 `?node=`, F-02 OR/()/wildcard/boost, A-05/A-06 JWT and SRI verification, A-10 `issuers[].id`, nightly prod, CORS guidance.  
Changelog 0.2.0: F-01 HTML facets, F-06 per-call traces, F-08 `ITA`/`EN` labels, F-12 environment/TA, NF-07 `disco.html` header identity, A-01/A-03/A-17 aligned with the implementation. A-20 (CSP) remains SHOULD and is not in `index.html`.

---

## 1. Goal

Let lawyers, public-sector technicians and developers **navigate graphically** the public metadata of the IT-Wallet Registry (catalog, schemas, claims, authentic sources, taxonomy), with a **human search engine** and a **cache** fed by faithful REST dumps.

The tool is static, open source, served from the GitHub Pages CDN.

---

## 2. Functional requirements (required)

### F-01 Search engine

The engine MUST index and filter at least:

| Dimension | Source fields |
|-----------|----------------|
| Credential / attestation type | `credentials[].credential_type`, `schemas[].credential_type`, taxonomy nodes |
| Legal type | `credentials[].legal_type` and `credentials[].issuers[].legal_type` (`pub-eaa`, `qeaa`, `eaa`) |
| Attribute / claim | claims-registry keys, `available_claims`, schema fields |
| Issuer | `credentials[].issuers[]` (`entity_id`, `organization_name*`, `organization_code`) |
| Authentic source | authentic-source registry and `credentials[].authentic_sources[]` |

MUST be possible to combine dimensions (text query + UI facets). Each result row MUST show a Bootstrap Italia icon on the left for the node kind: credentials use `it-card` (smartcard); issuers `it-pa`; authentic sources `it-inbox`; schemas `it-file`; claims `it-list`; taxonomy domains `it-folder`.

The search form MUST expose labelled HTML `<select>` controls populated from the dump:

| Control | Values | Effect |
|---------|--------|--------|
| `legal_type` | always `pub-eaa`, `qeaa`, `eaa` (+ empty = all) | writes `legal_type:` into the query |
| Issuer | real catalog issuers | writes `issuer:` |
| Authentic source | real authentic sources | writes `as:` |
| Attribute / claim | claims used by authentic sources | writes `claim:` |

The menus MUST **write into the same** Lucene-lite query (`legal_type:pub-eaa`, `issuer:"…"`, `as:"…"`, `claim:family_name`), not a second engine. Detail: [SEARCH.md](SEARCH.md).

### F-02 Query syntax

The engine MUST accept the notations in [SEARCH.md](SEARCH.md):

- implicit AND of terms
- `+term` (required), `-term` (exclusion)
- `"exact phrase"`
- `field:value` (e.g. `legal_type:pub-eaa`, `issuer:ipzs`, `claim:family_name`)
- `*` / `?` (wildcard)
- `term^2` (boost)
- grouping with `()`

SHOULD provide a natural-language summary of the interpreted query (`query.understood`).

### F-03 REST dump cache, faithful hierarchy

A script MUST download registry REST resources **without transforming bodies**, storing them under `cache/<host>/<path>` as in [CACHE-AND-CI.md](CACHE-AND-CI.md).

MUST start from `/.well-known/it-wallet-registry` and follow `endpoints.*` and derived URIs (`schema_uri`, l10n bundles if reachable).

MUST record every fetch in the dump indexes (URL, status, content-type / application type, hash, timestamp, `duration_ms`, error).

MUST write `cache/manifest-pre.json` and `cache/manifest-prod.json` (one index per Trust Anchor). `cache/manifest.json` MUST remain the default pre-production (`pre`) dump for compatibility.

### F-04 GitHub Pages CI with two CD pipelines

1. **Nightly CD** MUST update the cache in the repository (cron + `workflow_dispatch`).
2. **Cache CD** MUST publish GitHub Pages when the cache (or the app) changes.

Detail: [CACHE-AND-CI.md](CACHE-AND-CI.md).

### F-05 Browser cache refresh on startup

On load the app MUST:

1. Show dump data served with the app (repo / Pages) immediately.
2. In the background try a Trust Anchor refresh into the **browser** cache (Cache API + IndexedDB), without blocking the UI.
3. If live data differs from the dump, update index, graph and message board.
4. If CORS/network fails, stay on the dump, record the failed GETs on the board, and show a page-level warning (`alert alert-warning`, openid-federation-browser pattern) with a GitHub link to CORS instructions ([CACHE-AND-CI.md](CACHE-AND-CI.md#cors-and-waf)).

### F-06 Message board

A message board MUST exist (Bootstrap Italia drawer/offcanvas) with:

- **one row per HTTP call** (manifest + every dump resource, failed attempts included)
- for each row: **endpoint** (Trust Anchor URL or requested URL), **method**, **status code**, **response time** (`duration_ms`), **application type** (`Content-Type` / media type, e.g. `application/json`, `application/jose`)
- errors with a **reason** (HTTP status, CORS, undecodable JWT, integrity mismatch, production 404, WAF HTML) and a Retry button
- `pending` state for in-flight refreshes (SHOULD)
- `role="log"` and `aria-live` for announcements

MUST have an **icon in the top-right navbar**, with a badge of open errors.

The board MUST NOT summarise the load as a single “N resources loaded” row instead of per-call detail.

### F-07 Retry

Every error MUST show a **Retry** button that re-runs only that resource (or its dependent group) and updates the board row.

### F-08 Multilingual UI

MUST Italian and English, files `src/locales/it.json` and `src/locales/en.json`, **ITA** / **EN** dropdown in the slim header (`disco.html` markup, NF-07). `document.documentElement.lang` MUST follow the selected language.

SHOULD use registry `localization` bundles when available; fall back to technical keys (`credential_type`, `l10n_id`).

### F-09 Vertical hierarchical graph

MUST render nodes with a **top-down** layout (root at the top):

```text
IT-Wallet Registry
 ├── Catalog
 │    ├── <credential_type>
 │    │     ├── Issuer(s)
 │    │     └── Authentic source(s)
 ├── Schemas
 ├── Claims
 ├── Authentic sources
 └── Taxonomy
```

Attestations and credentials MUST be linked to **one or more** credential issuers and/or authentic sources when the catalog declares them.

### F-10 Graph filter from search results

The same query MUST filter the graph: only matching nodes remain visible, **plus hierarchical ancestors** (up to the root) **plus the edges** that connect them (issuer, authentic source, schema of that type). Non-matching nodes MUST be hidden, not merely faded, except for a SHOULD “show context” toggle.

### F-11 Credential Offer per attestation

Every attestation/credential MUST offer:

- `openid-credential-offer://` href (and SHOULD `haip-vci://` as an alias; the alias MAY be visually hidden if the primary link and QR are present)
- equivalent QR code

aligned with the Technical Specifications, with the limits in [CREDENTIAL_OFFER.md](CREDENTIAL_OFFER.md) (discovery offer, `grants.authorization_code` without a PDND-encrypted `issuer_state`).

### F-12 Pre-production / production switch and Trust Anchor

The search form MUST include an **Environment** `<select>` with at least:

| Value | Label (en) | Trust Anchor |
|-------|------------|--------------|
| `pre` | Pre-production | `https://pre.ta.wallet.ipzs.it` |
| `prod` | Production | `https://ta.wallet.ipzs.it` |

The UI MUST **show the Trust Anchor** of the active environment (visible, linkable URL). Changing environment MUST reload the matching dump (`manifest-pre.json` / `manifest-prod.json`) and MUST update the permalink `?env=pre|prod`. It is not a Lucene query token.

Production MAY have an incomplete or missing catalog: the app MUST not crash; errors stay on the board (F-06, F-07).

### F-13 Demo credential

On the `credential` node MUST show a demo credential for **each format** declared in the schema (`dc+sd-jwt`, `mso_mdoc`), signed with the fake keys in [`demo/keys/`](../demo/README.md):

- `dc+sd-jwt`: compact SD-JWT VC, JSON disclosure `[salt, name, value]`, example KB-JWT
- `mso_mdoc`: ISO 18013-5 **DeviceResponse** (`documents[].issuerSigned` + COSE_Sign1), BINASCII hex and diagnostic notation (`24(<< >>)`, `h'…'`); claims MUST match the CDDL (e.g. `age_over_18` on AV)

A visible warning (`role="alert"`) MUST state that the example is illustration only and **must not be treated as usable** (Wallet, production, or verification). MUST NOT be a real issuance.

When issuer metadata is in the dump (A-10), the same section MUST also show a **Credential demo UI** smartcard per dumped format:

- `credential_metadata.display` (or legacy `display`) for the matching `credential_configuration_id`: `name`, `description`, `locale`, and — **if present** — `background_color`, `text_color`, `background_image`, `logo`
- claim labels from `credential_metadata.claims[].display` (path → demo value)
- issuer `display.logo` / `display.name` when the credential display has no logo

MUST NOT invent colours or logos as if they came from metadata. If display colours are absent, the card MAY use a documented fallback style (IT-Wallet primary blue). Technical JWT/mdoc fields (`iss`, `cnf`, `status`, `_sd`, …) MUST NOT appear as card claims.

### F-14 Credential issuer metadata

On each `credential` result the UI MUST show a **Credential issuer** section for every issuer declared on that credential type:

- metadata URL `{issuer_id}/.well-known/openid-credential-issuer` as a link
- **original** OpenID4VCI metadata as dumped: compact signed JWT (including embedded JWKS) **or** JSON
- **decoded JSON** (JOSE payload for JWT; parsed object for JSON)
- **excerpt** of `credential_configurations_supported` limited to the `credential_configuration_id` values that match this credential type (and its schema formats)
- in addition, `{issuer_id}/.well-known/openid-federation` as a link, with original entity configuration (typically a signed JWT), decoded JSON, and the same configuration excerpt taken from `metadata.openid_credential_issuer`
- a visible warning (`role="alert"`) when the two documents are **divergent**: missing counterpart, missing `metadata.openid_credential_issuer`, `iss`/`sub` vs `credential_issuer`, or differing OpenID4VCI fields (JWT `iat`/`exp`/`nbf`/`jti` on the credential-issuer document MUST NOT count as a mismatch)

If the dump has no issuer metadata (A-10), the section MUST still appear and explain that the metadata is missing. MUST NOT invent configuration objects.

---

## 3. Non-functional requirements (required)

### NF-01 Templates and accessibility

MUST reuse structure and patterns from:

- `official_resources/discovery-page/disco.html`
- `official_resources/it-wallet-selection-page/it-wallet.html`

including: skip-link, `role="banner"` / `contentinfo`, slim header + language, labelled `main`, legal footer (notes, requirements, accessibility, GitHub), visible focus, keyboard navigation, Bootstrap Italia contrast. See [ACCESSIBILITY.md](ACCESSIBILITY.md).

### NF-02 Board icon in the navbar

The board icon MUST sit in the **right zone of the slim header** (next to the language selector), not in the page title. MUST use the same slim-header `nav-link` pattern (not a generic Bootstrap `btn btn-link`).

### NF-03 JavaScript stack

MUST be JavaScript (ESM). No runtime backend. GitHub Actions MAY use Node only for dump and build.

### NF-04 Served from the GitHub CDN

MUST be publishable on GitHub Pages (`base: './'` locally; Pages build MAY set `VITE_BASE` to the repository path), with no application server.

### NF-05 Perceived performance

MUST show the dump in under 2 s on a typical desktop after fetching local JSON. Live refresh MUST be asynchronous.

### NF-06 No personal data

MUST handle registry metadata only. MUST NOT log queries to third parties. The browser cache MUST stay on the origin (GitHub Pages).

### NF-07 Header visual identity = `disco.html`

Top-right controls (language and board) and the **language dropdown** MUST match, in style and markup, `official_resources/discovery-page/disco.html`:

- language trigger: `button.nav-link.dropdown-toggle`, `ITA` / `EN` label, `it-expand` icon, no Bootstrap `::after` caret
- menu: `dropdown-menu` + `link-list-wrapper` + `ul.link-list` + `button.dropdown-item.list-item` (`menuitemradio`)
- 24 px Popper offset between trigger and menu
- slim colours `#004D99`, Italia-blue menu items (dark active, underlined hover)

Detail: [ACCESSIBILITY.md](ACCESSIBILITY.md).

---

## 4. Additional requirements (introduced during design)

Motivated by the handbook, Technical Specifications and GitHub Pages constraints.

| ID | Priority | Requirement |
|----|----------|-------------|
| A-01 | MUST | **Pre-production / production** switch in the search form (F-12), with a visible Trust Anchor URL. Production may lack a catalog: board, not crash. |
| A-02 | MUST | **Table/list** view equivalent to the graph (WCAG: the canvas is not the only mode). |
| A-03 | MUST | Deep link: `?q=`, `?env=pre\|prod`, `?node=` restore search, environment and selection. |
| A-04 | MUST | JWT catalog: store raw; on entity click show the signed original artifact and JOSE header/payload in the clear (`kid`, `alg`). |
| A-05 | SHOULD | Verify the catalog JWT signature with the Trust Anchor JWKS, when downloadable. |
| A-06 | SHOULD | Verify `schema_uri#integrity` (SRI sha256) after fetching the schema. |
| A-07 | MUST | CORS: if the TA does not expose a valid `Access-Control-Allow-Origin`, browser refresh fails explicitly; the CI dump remains valid. The UI MUST show a page-level `alert alert-warning` (openid-federation-browser pattern) and a GitHub link to CORS add-on instructions. |
| A-08 | MUST | Dump with `GET` and an identifiable `User-Agent`; **do not use HEAD** (WAF). |
| A-09 | SHOULD | Try l10n bundles; if the WAF rejects them, retriable board error, UI on `*_l10n_id`. |
| A-10 | SHOULD | Dump OpenID4VCI metadata (`/.well-known/openid-credential-issuer`) and the issuer entity configuration (`/.well-known/openid-federation`) of each catalog issuer. |
| A-11 | MAY | Federation dump (`/list`, entity configuration) behind a flag. |
| A-12 | SHOULD | Dump vs live diff on the board (hash or `last_updated`). |
| A-13 | SHOULD | Permalink and JSON export of the filtered sub-graph. |
| A-14 | MUST | Visible disclaimer: unofficial tool; offer is not a production issuance; demo credential is illustration only (`#example-warning`). |
| A-15 | SHOULD | Honour `prefers-reduced-motion` on the graph layout. |
| A-16 | MAY | PNG/SVG export of the visible graph. |
| A-17 | MUST | Versioned dump indexes: `manifest.json` (default `pre`), `manifest-pre.json`, `manifest-prod.json`. |
| A-18 | SHOULD | Rate limiting in the crawler (pause between fetches, exponential retry on 429/5xx). |
| A-19 | MUST | `noscript` pages and a message if JS is disabled. |
| A-20 | SHOULD | Content-Security-Policy compatible with GitHub Pages (own scripts; goal: fully bundled). Not yet in `index.html`. |
| A-21 | MAY | Pre vs prod comparison in the same session (two roots). |
| A-22 | SHOULD | Document on the board the schema path divergence (`/schemas/v1.3.3/…` vs the ST example). |
| A-23 | MUST | HTML facets `legal_type` / issuer / authentic source / claim that write `field:value` into the query (F-01). |
| A-24 | MUST | Board: full GET traces (endpoint, status, ms, application type) (F-06). |
| A-25 | MUST | Slim header: IT-Wallet Negative White symbol, language dropdown and bell aligned with `disco.html` (NF-07). |
| A-26 | MUST | Node detail (list **and graph**): dump artifacts (JWS/JSON/CDDL) in a **nested accordion**, collapsed by default. Credentials also include **credential issuer**, **credential demo** and **credential offer** as items of the same accordion. Issuer well-knowns (`openid-credential-issuer`, `openid-federation`) come from the dump. JWT: signed original **or** header and payload in the clear; for credentials/issuers/authentic sources also an entity excerpt. JSON: indented view with expand/collapse of nested objects and arrays. |

---

## 5. Out of scope (v1)

- Real attestation issuance, `issuer_state` encryption with the PDND key, user login.
- Citizen data archives, wallet sessions, WSCD.
- Mutating the registries (the tool is read-only).
- Replacing the Technical Specifications or the Trust Anchor.
- Native app / browser extension.

---

## 6. Short acceptance criteria

1. Cloning the repo and opening Pages (or `npm run dev` after `npm run dump:pre`) shows a graph rooted at “IT-Wallet Registry” with the credential types in the pre-production catalog.
2. The query `legal_type:pub-eaa +mDL -pid` reduces list and graph to mDL and its issuers/authentic sources/ancestors. The `legal_type` / issuer / authentic source / claim `<select>`s write the same tokens.
3. The top-right navbar ( `disco.html` style) opens the board; every dump GET is a row with endpoint, HTTP status, ms and application type; a 404 has Retry.
4. Every attestation card shows a QR and an `openid-credential-offer://` link.
5. IT/EN switch header, board, search and graph caption. The language trigger shows `ITA`/`EN` and the `link-list` menu of `disco.html`.
6. Nightly updates `cache/` without hand-editing files. `npm run dump:prod` writes `cache/manifest-prod.json`; REST bodies go under `cache/ta.wallet.ipzs.it/`.
7. The Environment menu shows Pre-production/Production and the Trust Anchor URL; `?env=prod` loads the production dump.
8. On the `mDL` node, SD-JWT and mdoc (BINASCII hex + diagnostic notation with `issuerSigned`) are visible; the Credential demo UI shows “Patente di guida” and demo claims (e.g. Mario Rossi); on `av` there is `age_over_18`; the Warning box links `demo/keys/` on the GitHub repository.
9. With live Trust Anchor GETs blocked (no CORS add-on), `#cors-fault-alert` (`alert alert-warning`) is visible and its Read more link points at the GitHub CORS documentation.
10. On `mDL`, the Credential issuer section links `https://pre.issuer.wallet.ipzs.it/.well-known/openid-credential-issuer` and `…/openid-federation`, shows original JSON / entity JWT and decoded JSON, and the excerpt contains `dc_sd_jwt_mDL` and `mso_mdoc_mDL` (not `pid`). Aligned documents MUST NOT show a mismatch alert. On `pid`, the credential-issuer original is a signed JWT and the excerpt contains `dc_sd_jwt_pid`.
