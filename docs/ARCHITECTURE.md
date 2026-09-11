# Architecture and framework

## 1. Constraints that drive the choice

1. **All JavaScript**, static output, GitHub Pages CDN.
2. **Same templates/accessibility** as `disco.html` and `it-wallet.html` → vanilla Bootstrap Italia, not a React wrapper.
3. Filterable graph + Lucene-like search + JWT + QR.
4. Faithful REST dumps (no application backend).

## 2. Decision

**Vite 7 + vanilla JavaScript ESM + Bootstrap Italia + Cytoscape.js + in-memory Lucene-lite parser + i18n JSON `it`/`en`.**

No React/Vue/Svelte/Angular. Official IT-Wallet pages do not use them; the value of the tool is data + graph + search, not a new design system.

```text
┌──────────────────────────────────────────────────────────┐
│ GitHub Pages (dist/)                                      │
│  index.html  +  bundled assets  +  /cache/* dump         │
└─────────────┬────────────────────────────────────────────┘
              │ synchronous load
              ▼
┌──────────────────────────────────────────────────────────┐
│ App (src/)                                                │
│  i18n → cacheLoader → search (Lucene-lite) → graph       │
│                │                                          │
│                └── live refresh (best-effort) → board     │
└──────────────────────────────────────────────────────────┘
              │
              ▼
     IndexedDB / Cache API  (overlay on the dump)
```

## 3. Rejected alternatives

| Option | Why it was dropped |
|--------|---------------------|
| React / Preact | Dual life with Bootstrap Italia (modals, dropdowns, offcanvas are already jQuery-free but not React). |
| Vue / Svelte | Same mismatch with official templates; steeper curve for public-sector contributors. |
| Vanilla without Vite | Import maps and Cytoscape tree-shaking are more fragile on Pages. |
| D3-only graph | Too much custom code for hierarchies + filter. |
| vis-network | Hierarchical layout less predictable than dagre. |
| Elastic / server search | Contradicts “JS only / Pages”. |
| Lunr.js / MiniSearch | The filter is a Lucene-lite parser over in-memory documents (facet `field:value`, quotes, `+`/`-`); no inverted index at runtime. |
| Service worker as the only cache | Complexity and debugging on Pages; IndexedDB is enough. |

## 4. Application modules (`src/js`)

| Module | Responsibility |
|--------|----------------|
| `i18n/` | Imported `it`/`en` JSON, `disco.html`-style language dropdown |
| `cache/environments.js` | Trust Anchor `pre` / `prod` and permalink aliases |
| `cache/loader.js` | Fetch dump from `manifest-{env}.json` + hierarchical files; `timedFetch` (status, ms, Content-Type) |
| `cache/browser.js` | IndexedDB overlay, live refresh, hash compare, schema SRI |
| `cache/jwt.js` | JOSE split, payload decode, ES256 verify with JWKS |
| `search/index.js` | Lucene-lite parser and document filter; facets that rewrite `field:value` |
| `graph/model.js` | Registry → nodes/edges; facet options from the dump |
| `graph/view.js` | Cytoscape + dagre `rankDir: 'TB'` |
| `messages/` | Board: one row per GET, badge, retry |
| `offer/` | OpenID4VCI URI + QR + example JWE |
| `demo/` | SD-JWT VC and ISO 18013-5 mdoc examples (`DeviceResponse` as BINASCII hex + diagnostic notation). Fake keys live in `demo/keys/` (repo root). Smartcard preview from OpenID4VCI `credential_configuration` display metadata. |

No component framework: DOM + Bootstrap Italia (`Offcanvas`, `Dropdown`, `Tooltip`).

## 5. Internal data model

Each normalised node (not the dump) has:

```json
{
  "id": "credential:mDL",
  "kind": "credential",
  "label": "mDL",
  "legal_type": "pub-eaa",
  "env": "pre",
  "source_path": "pre.ta.wallet.ipzs.it/.well-known/credential-catalog",
  "parents": ["catalog"],
  "issuers": ["issuer:https://…"],
  "authentic_sources": ["as:https://…"],
  "schemas": ["schema:mDL+mso_mdoc+…"],
  "claims": ["family_name", "birth_date"],
  "text": "mdl pub-eaa patente …"
}
```

The on-disk dump stays **intact**. The index is derived in memory.

## 6. Startup flow

1. Skip-links and HTML shell already on the page (no blank).
2. i18n `it` default, `en` from `localStorage` if chosen (`ITA`/`EN` in the header).
3. `GET ./cache/manifest-{env}.json` (default `pre`; `?env=prod` → production) → fetch listed resources, each timed.
4. Decode the catalog JWT if `typ` is JOSE / three segments.
5. Build graph model + search index.
6. Render graph (root) + list.
7. Board: one row per GET (TA endpoint, HTTP status, ms, application type).
8. `requestIdleCallback` → live refresh for URLs in the manifest (best-effort; CORS). If live GETs fail, `#cors-fault-alert` (`alert alert-warning`) points at the GitHub CORS docs.
9. For each live call: success / error+retry; if the hash differs, rebuild index and graph without losing the current query.
10. On a `credential` result: catalog/data-model artifacts, **issuer well-knowns** (`openid-credential-issuer` and `openid-federation`, with a mismatch warning when OpenID4VCI contents diverge), demo credential (**smartcard UI** from `credential_configuration` display metadata when present), Credential Offer.

## 7. Environments

| Key | Base URL |
|-----|----------|
| `pre` | `https://pre.ta.wallet.ipzs.it` |
| `prod` | `https://ta.wallet.ipzs.it` |

The default nightly dump is `pre`. The UI MUST be able to load `prod` from `manifest-prod.json` (F-12). Production (snapshot 3/9/2026) could be incomplete; as of 9/9/2026 the prod dump is available and selectable.

## 8. Runtime dependencies

See `package.json`. Bundle goal: one vendor chunk (cytoscape+dagre is the heaviest) and one app chunk. Bootstrap Italia CSS/JS come from the jsDelivr CDN, version-pinned by the `bootstrap-italia` dependency in `package.json`. Sprite and IT-Wallet symbol from `vendor/` / `public/img/`.

## 9. Security

- Read-only, origins: Pages + TA.
- No production secrets in the repo. Keys under `demo/keys/` are **fake** (offer `issuer_state` + demo SD-JWT and mdoc signatures) and must be treated as such.
- Credential Offer: example `issuer_state` encrypted with the demo RSA key, not PDND.
- Content-Security-Policy: A-20 SHOULD, **not** yet in `index.html`. A `default-src 'self'` policy needs a self-contained shell (Bootstrap Italia is on jsDelivr today).
- Schema integrity: `schema_uri#integrity` hash.
