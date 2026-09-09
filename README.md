# IT-Wallet Registry Explorer

Explorer grafico open source del **Registro IT-Wallet**: catalogo delle credenziali, schemi, claims, fonti autentiche e tassonomia.

Il tool è un’applicazione **tutta JavaScript**, statica, servita da **GitHub Pages** (CDN GitHub). All’avvio legge un dump locale dei well-known REST del Trust Anchor, poi aggiorna in background la cache del browser.

> Non è un prodotto ufficiale AgID/IPZS, non è un Wallet e non emette attestati. Contiene solo **metadati di sistema**. Vedi [NOTICE](NOTICE).

## Stato

Scaffold **v0.1.0**: requisiti, architettura, script di dump, CI e guscio HTML accessibile. L’esplorazione grafica e il motore di ricerca sono specificati in `docs/` e da implementare sul framework deciso sotto.

## Framework (decisione)

| Strato | Scelta | Perché |
|--------|--------|--------|
| Bundler / app | **Vite + JavaScript vanilla (ESM)** | Pagine ufficiali `disco.html` / `it-wallet.html` sono vanilla; GitHub Pages vuole output statico; vincolo «tutto JS». |
| UI | **Bootstrap Italia** + pattern di `official_resources` | Stessi skip-link, header slim, dropdown lingua, footer legale, WCAG 2.1 AA. |
| i18n | **i18next** + file JSON `it` / `en` | Stesso stack delle pagine ufficiali. |
| Grafo | **Cytoscape.js** + **cytoscape-dagre** | Layout verticale gerarchico, filtro nodi/archi senza riscrivere il motore grafico. |
| Ricerca | **Lunr.js** + **lunr-languages** (it) + parser Lucene-lite | Supporto nativo a `+`, `-`, `"frase"`, `campo:valore`, `*`. |
| QR | **qrcode** (fallback: web component `qr-code` delle official_resources) | Credential Offer come URI `openid-credential-offer://`. |
| JWT | decoder ESM interno (verifica firma in fase 2) | Il catalogo live è un JWT JOSE, non JSON. |

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
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | Mapping sui template `disco.html` / `it-wallet.html` |

## Avvio locale

```bash
npm install
npm run dump:pre    # scarica i well-known in cache/ (rete verso il Trust Anchor)
npm run dev         # http://localhost:5173
```

## Cache

Il dump **riproduce il path URL** sotto `cache/<host>/…`, senza riscrivere i body:

```text
cache/
  manifest.json
  pre.ta.wallet.ipzs.it/
    .well-known/it-wallet-registry
    .well-known/credential-catalog      # JWT raw
    .well-known/schemas
    .well-known/claims-registry
    .well-known/authentic-sources
    .well-known/credential-taxonomy
    schemas/v1.3.3/mdl.json
    schemas/v1.3.3/mdl.cddl
    …
```

All’avvio l’app carica questo dump, poi prova un refresh live (se il Trust Anchor invia CORS). Gli esiti vanno in **bacheca**, con **Riprova** sugli errori.

## CI / CD

Due pipeline distinte, descritte in [docs/CACHE-AND-CI.md](docs/CACHE-AND-CI.md):

1. **Nightly** (`.github/workflows/nightly-cache.yml`) — aggiorna `cache/` e fa commit se il dump è cambiato.
2. **Pages da cache** (`.github/workflows/pages.yml`) — pubblica GitHub Pages quando cambia la cache **o** il codice dell’app.

## Licenza

Codice: [BSD-3-Clause](LICENSE). Avvertenze e terze parti: [NOTICE](NOTICE).
