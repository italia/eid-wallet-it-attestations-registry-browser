# eid-wallet-it-attestations-registry-browser

**IT-Wallet Attestations Explorer and Demo** — open-source explorer for **IT-Wallet attestations** in the public registry: catalog, schemas, claims, authentic sources, taxonomy, and demo credentials.

The tool is an all-**JavaScript** static application served from **GitHub Pages**. On startup it reads a local dump of the Trust Anchor well-known REST endpoints, then refreshes the browser cache in the background.

> It is not an official AgID/IPZS product, not a Wallet, and it does not issue attestations. It contains **system metadata** only. See [NOTICE](NOTICE).

## Use

The application is published on GitHub Pages:

**[https://italia.github.io/eid-wallet-it-attestations-registry-browser/](https://italia.github.io/eid-wallet-it-attestations-registry-browser/)**

1. Choose **Pre-production** or **Production** (the Trust Anchor in use is shown under the switch).
2. Search the registry: free text, `+` / `-` / quotes, or the `legal_type`, issuer, authentic source and claim menus.
3. Open an attestation from the **list** or the **graph** to see metadata, artifacts (catalog and JSON/CDDL data model), a **demo credential** signed with fake keys, and the **Credential Offer** (QR / URI). The offer describes a *credential type*: it does not issue a real instance and does not authenticate the user.
4. The **message board** lists GET requests to the dump and well-known endpoints (endpoint, status, duration).

If live HTTP requests to the Trust Anchor fail (no CORS add-on such as **Allow CORS**, or an invalid `Access-Control-Allow-Origin`), a warning banner appears — same pattern as [openid-federation-browser](https://github.com/italia/openid-federation-browser). The local dump stays usable. Details: [docs/CACHE-AND-CI.md#cors-and-waf](docs/CACHE-AND-CI.md#cors-and-waf).

Local development: [Run locally](#run-locally). Search syntax: [docs/SEARCH.md](docs/SEARCH.md).

## Status

Application **v0.6.0**: REST dump, Cytoscape graph, Lucene-lite search with HTML facets, pre-production/production switch, best-effort live refresh, per-GET message board, JWT/SRI verification, IT-Wallet symbol in the header, data model and demo credential (SD-JWT and mdoc DeviceResponse as hex + diagnostic notation, not-for-use warning, **smartcard UI** from `credential_configuration` display metadata), **credential issuer metadata** from the dump (`openid-credential-issuer` and `openid-federation`, with a warning when they diverge), nested accordion for dump artifacts / issuer / demo / offer, fake keys for offer/`issuer_state`. Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (version **0.6.0**).

## Framework (decision)

| Layer | Choice | Why |
|--------|--------|-----|
| Bundler / app | **Vite + vanilla JavaScript (ESM)** | Official `disco.html` / `it-wallet.html` pages are vanilla; GitHub Pages needs static output; “JS only” constraint. |
| UI | **Bootstrap Italia** + `official_resources` patterns | Same skip-links, slim header, language dropdown, legal footer, WCAG 2.1 AA. |
| i18n | JSON `it` / `en` + `disco.html` dropdown (`ITA`/`EN`) | Same header pattern as the official pages; UI strings live in `src/locales/`. |
| Graph | **Cytoscape.js** + **cytoscape-dagre** | Vertical hierarchical layout, node/edge filter without rewriting the graph engine. |
| Search | In-memory **Lucene-lite** parser + HTML facets | `+`, `-`, `"phrase"`, `field:value` (quoted too), `legal_type` / issuer / authentic source / claim menus. |
| QR | **qrcode** | Credential Offer as `openid-credential-offer://` URI. |
| JWT | Internal ESM decoder + ES256 verification with the TA JWKS (`/.well-known/openid-federation`) | The live catalog is a JOSE JWT, not JSON. |

React, Vue and Svelte were rejected: official IT-Wallet Bootstrap Italia is consumed as vanilla CSS/JS; a virtual DOM would add friction without helping the graph.

Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

| Document | Content |
|----------|---------|
| [docs/EVALUATION_HANDBOOK.md](docs/EVALUATION_HANDBOOK.md) | Review of the *Short handbook — Registry infrastructure* |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Functional and non-functional requirements |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Framework, modules, cache flow |
| [docs/CACHE-AND-CI.md](docs/CACHE-AND-CI.md) | Hierarchical dump, nightly, GitHub Pages, CORS |
| [docs/SEARCH.md](docs/SEARCH.md) | Search engine syntax |
| [docs/GRAPH.md](docs/GRAPH.md) | Node model and hierarchical filter |
| [docs/CREDENTIAL_OFFER.md](docs/CREDENTIAL_OFFER.md) | QR / href aligned with the Technical Specifications |
| [demo/README.md](demo/README.md) | Fake keys (demo signatures, `issuer_state` encryption) |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | Mapping onto `disco.html` / `it-wallet.html` |

## Tests

```bash
npm install
npx playwright install chromium
npm test                 # unit + e2e (desktop, tablet, mobile)
npm run test:unit
npm run test:a11y
```

Playwright checks a real graph (no placeholder), search and facets, pre/prod switch, offer/QR, demo credential (SD-JWT and mdoc hex + diagnostic notation, GitHub `demo/keys/` warning), message board HTTP traces, skip-links, axe WCAG 2.1 A/AA, and layout at 1280×800, 768×1024 and 375×667.

## Run locally

```bash
npm install
npm run dump:pre    # pre-production → cache/manifest-pre.json + cache/pre.ta.wallet.ipzs.it/
npm run dump:prod   # production → cache/manifest-prod.json + cache/ta.wallet.ipzs.it/
npm run dev         # http://127.0.0.1:5173  (?env=prod for the production dump)
```

## Cache

The dump **mirrors the URL path** under `cache/<host>/…` and does not rewrite bodies:

```text
cache/
  manifest.json / manifest-pre.json / manifest-prod.json
  pre.ta.wallet.ipzs.it/
    .well-known/it-wallet-registry
    .well-known/credential-catalog      # raw JWT
    …
  ta.wallet.ipzs.it/
    …
```

On startup the app loads the dump for the selected environment (Trust Anchor shown in the form). Every GET appears on the **message board** (endpoint, status, ms, application type), with **Retry** on errors.

## CI / CD

Two separate pipelines, described in [docs/CACHE-AND-CI.md](docs/CACHE-AND-CI.md):

1. **Nightly** (`.github/workflows/nightly-cache.yml`) — updates `cache/` and commits if the dump changed.
2. **Pages from cache** (`.github/workflows/pages.yml`) — publishes GitHub Pages when the cache **or** the app code changes.

## License

Code: [BSD-3-Clause](LICENSE). Notices and third parties: [NOTICE](NOTICE).
