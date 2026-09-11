# eid-wallet-it-attestations-registry-browser

**IT-Wallet Registry Search Engine** — explorer grafico open source del **Registro IT-Wallet**: catalogo delle credenziali, schemi, claims, fonti autentiche e tassonomia.

Il tool è un’applicazione **tutta JavaScript**, statica, servita da **GitHub Pages** (CDN GitHub). All’avvio legge un dump locale dei well-known REST del Trust Anchor, poi aggiorna in background la cache del browser.

> Non è un prodotto ufficiale AgID/IPZS, non è un Wallet e non emette attestati. Contiene solo **metadati di sistema**. Vedi [NOTICE](NOTICE).

## Uso

L’applicazione è pubblicata su GitHub Pages:

**[https://italia.github.io/eid-wallet-it-attestations-registry-browser/](https://italia.github.io/eid-wallet-it-attestations-registry-browser/)**

1. Scegli l’ambiente **Collaudo (preprod)** o **Produzione** (il Trust Anchor usato è indicato sotto lo switch).
2. Cerca nel registro: testo libero, operatori `+` / `-` / virgolette, oppure i menu `legal_type`, emittente, fonte autentica e claim.
3. Apri un attestato dalla **lista** o dal **grafo** per vedere metadati, artifact (catalogo e data model JSON/CDDL), una **credenziale di esempio** firmata con chiavi fittizie, e il **Credential Offer** (QR / URI). La offer descrive una *tipologia* di credenziale: non emette un’istanza reale e non autentica l’utente.
4. La **bacheca** elenca le GET verso dump e well-known (endpoint, status, durata).

Sviluppo in locale: [Avvio locale](#avvio-locale). Sintassi della ricerca: [docs/SEARCH.md](docs/SEARCH.md).

## Stato

Applicazione **v0.4.0**: dump REST, grafo Cytoscape, ricerca Lucene-lite con facet HTML, switch collaudo/produzione, refresh live best-effort, bacheca per-GET, verifica JWT/SRI, data model e credenziale di esempio sui tipi, chiavi fittizie per offer/`issuer_state`. Requisiti in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (versione **0.4.0**).

## Framework (decisione)

| Strato | Scelta | Perché |
|--------|--------|--------|
| Bundler / app | **Vite + JavaScript vanilla (ESM)** | Pagine ufficiali `disco.html` / `it-wallet.html` sono vanilla; GitHub Pages vuole output statico; vincolo «tutto JS». |
| UI | **Bootstrap Italia** + pattern di `official_resources` | Stessi skip-link, header slim, dropdown lingua, footer legale, WCAG 2.1 AA. |
| i18n | JSON `it` / `en` + dropdown `disco.html` (`ITA`/`EN`) | Stessi file e pattern delle pagine ufficiali. |
| Grafo | **Cytoscape.js** + **cytoscape-dagre** | Layout verticale gerarchico, filtro nodi/archi senza riscrivere il motore grafico. |
| Ricerca | Parser **Lucene-lite** in memoria + facet HTML | `+`, `-`, `"frase"`, `campo:valore` (anche quotato), menu `legal_type` / issuer / FA / claim. |
| QR | **qrcode** (fallback: web component `qr-code` delle official_resources) | Credential Offer come URI `openid-credential-offer://`. |
| JWT | decoder ESM interno + verifica ES256 con JWKS del TA (`/.well-known/openid-federation`) | Il catalogo live è un JWT JOSE, non JSON. |

React, Vue e Svelte sono stati scartati: Bootstrap Italia nelle risorse ufficiali IT-Wallet è consumato come CSS/JS vanilla; un virtual DOM aggiungerebbe attrito senza guadagno sul grafo.

Dettaglio in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentazione

| Documento | Contenuto |
|-----------|-----------|
| [docs/EVALUATION_HANDBOOK.md](docs/EVALUATION_HANDBOOK.md) | Valutazione del *Manuale breve — Infrastruttura del Registro* |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Requisiti funzionali e non funzionali (inclusi quelli aggiunti) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Framework, moduli, flusso cache |
| [docs/CACHE-AND-CI.md](docs/CACHE-AND-CI.md) | Dump gerarchico, nightly, GitHub Pages |
| [docs/SEARCH.md](docs/SEARCH.md) | Sintassi del motore di ricerca |
| [docs/GRAPH.md](docs/GRAPH.md) | Modello a nodi e filtro gerarchico |
| [docs/CREDENTIAL_OFFER.md](docs/CREDENTIAL_OFFER.md) | QR / href conformi alle ST |
| [demo/README.md](demo/README.md) | Chiavi fittizie (firma esempi, cifratura `issuer_state`) |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | Mapping sui template `disco.html` / `it-wallet.html` |

## Test

```bash
npm install
npx playwright install chromium
npm test                 # unit + e2e (desktop, tablet, mobile)
npm run test:unit
npm run test:a11y
```

I test Playwright verificano grafo reale (niente placeholder), filtro ricerca e facet, switch pre/prod, offer/QR, bacheca con traccia HTTP, skip-link, axe WCAG 2.1 A/AA, e layout a 1280×800, 768×1024 e 375×667.

## Avvio locale

```bash
npm install
npm run dump:pre    # collaudo → cache/manifest-pre.json + cache/pre.ta.wallet.ipzs.it/
npm run dump:prod   # produzione → cache/manifest-prod.json + cache/ta.wallet.ipzs.it/
npm run dev         # http://localhost:5173  (?env=prod per il dump di produzione)
```

## Cache

Il dump **riproduce il path URL** sotto `cache/<host>/…`, senza riscrivere i body:

```text
cache/
  manifest.json / manifest-pre.json / manifest-prod.json
  pre.ta.wallet.ipzs.it/
    .well-known/it-wallet-registry
    .well-known/credential-catalog      # JWT raw
    …
  ta.wallet.ipzs.it/
    …
```

All’avvio l’app carica il dump dell’ambiente scelto (Trust Anchor indicato nel form). Ogni GET compare in **bacheca** (endpoint, status, ms, application type), con **Riprova** sugli errori.

## CI / CD

Due pipeline distinte, descritte in [docs/CACHE-AND-CI.md](docs/CACHE-AND-CI.md):

1. **Nightly** (`.github/workflows/nightly-cache.yml`) — aggiorna `cache/` e fa commit se il dump è cambiato.
2. **Pages da cache** (`.github/workflows/pages.yml`) — pubblica GitHub Pages quando cambia la cache **o** il codice dell’app.

## Licenza

Codice: [BSD-3-Clause](LICENSE). Avvertenze e terze parti: [NOTICE](NOTICE).
