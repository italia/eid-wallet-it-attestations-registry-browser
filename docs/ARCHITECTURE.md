# Architettura e framework

## 1. Vincoli che guidano la scelta

1. **Tutto JavaScript**, output statico, CDN GitHub Pages.
2. **Stessi template/accessibilità** di `disco.html` e `it-wallet.html` → Bootstrap Italia vanilla, non un wrapper React.
3. Grafo filtrabile + ricerca Lucene-like + JWT + QR.
4. Dump fedele dei REST (nessun backend applicativo).

## 2. Decisione

**Vite 7 + JavaScript ESM vanilla + Bootstrap Italia + Cytoscape.js + parser Lucene-lite (in-memory) + i18n JSON `it`/`en`.**

Non si usa React/Vue/Svelte/Angular. Le pagine ufficiali IT-Wallet non lo fanno; il valore del tool è dati + grafo + ricerca, non un design system nuovo.

```text
┌──────────────────────────────────────────────────────────┐
│ GitHub Pages (dist/)                                      │
│  index.html  +  assets bundled  +  /cache/* dump         │
└─────────────┬────────────────────────────────────────────┘
              │ load sincrono
              ▼
┌──────────────────────────────────────────────────────────┐
│ App (src/)                                                │
│  i18n → cacheLoader → search (Lucene-lite) → graph       │
│                │                                          │
│                └── refresh live (best-effort) → bacheca   │
└──────────────────────────────────────────────────────────┘
              │
              ▼
     IndexedDB / Cache API  (overlay sul dump)
```

## 3. Alternative scartate

| Opzione | Motivo dello scarto |
|---------|---------------------|
| React / Preact | Doppia vita con Bootstrap Italia (modali, dropdown, offcanvas già jQuery-free ma non React). |
| Vue / Svelte | Stesso disallineamento con i template ufficiali; curva per contributor PA. |
| Vanilla senza Vite | Import map e tree-shake di Cytoscape più fragili su Pages. |
| D3-only per il grafo | Troppo codice custom per gerarchie + filtro. |
| vis-network | Layout gerarchico meno prevedibile di dagre. |
| Elastic / server search | Contraddice «solo JS / Pages». |
| Lunr.js / MiniSearch | Il filtro è un parser Lucene-lite su documenti in memoria (facet `campo:valore`, quote, `+`/`-`); non serve un indice inverted a runtime. |
| Service worker come unica cache | Complessità e debugging su Pages; IndexedDB è sufficiente. |

## 4. Moduli applicativi (`src/js`)

| Modulo | Responsabilità |
|--------|----------------|
| `i18n/` | JSON `it`/`en` importati, dropdown lingua stile `disco.html` |
| `cache/environments.js` | Trust Anchor `pre` / `prod` e alias permalink |
| `cache/loader.js` | Fetch dump da `manifest-{env}.json` + file gerarchici; `timedFetch` (status, ms, Content-Type) |
| `cache/browser.js` | Overlay IndexedDB, refresh live, confronto hash, SRI schemi |
| `cache/jwt.js` | Split JOSE, decode payload, verifica ES256 con JWKS |
| `search/index.js` | Parser Lucene-lite e filtro documenti; facet che riscrivono `campo:valore` |
| `graph/model.js` | Registry → nodes/edges; opzioni facet dal dump |
| `graph/view.js` | Cytoscape + dagre `rankDir: 'TB'` |
| `messages/` | Bacheca: una riga per GET, badge, retry |
| `offer/` | Costruzione URI OpenID4VCI + QR + JWE esemplificativo |
| `demo/` | Chiavi fittizie; esempi SD-JWT VC e mdoc (`DeviceResponse`, hex BINASCII, notazione diagnostica) |

Nessun framework a componenti: DOM + Bootstrap Italia (`Offcanvas`, `Dropdown`, `Tooltip`).

## 5. Modello dati interno

Ogni nodo normalizzato (non il dump) ha:

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

Il dump su disco resta **intatto**. L’indice è derivato in memoria.

## 6. Flusso di avvio

1. Skip-link e shell HTML già in pagina (no blank).
2. i18n `it` default, `en` da `localStorage` se scelto (`ITA`/`EN` in header).
3. `GET ./cache/manifest-{env}.json` (default `pre`; `?env=prod` → produzione) → fetch delle risorse elencate, ciascuna cronometrata.
4. Decode JWT catalogo se `typ` JOSE / tre segmenti.
5. Build modello grafo + indice di ricerca.
6. Render grafo (radice) + lista.
7. Bacheca: una riga per ogni GET (endpoint TA, HTTP status, ms, application type).
8. `requestIdleCallback` → refresh live per URL nel manifest (best-effort; CORS).
9. Per ogni live: successo / errore+retry; se hash diverso, rebuild indice e grafo senza perdere la query corrente.

## 7. Ambienti

| Chiave | Base URL |
|--------|----------|
| `pre` | `https://pre.ta.wallet.ipzs.it` |
| `prod` | `https://ta.wallet.ipzs.it` |

Il dump nightly default è `pre`. L’UI MUST poter caricare `prod` dal dump `manifest-prod.json` (F-12). Produzione (fotografia 3/9/2026) poteva essere incompleta; al 9/9/2026 il dump prod è disponibile e selezionabile.

## 8. Dipendenze runtime

Vedi `package.json`. Obiettivo bundle: un vendor chunk (cytoscape+dagre è il più pesante) e un app chunk. Bootstrap Italia CSS da npm, sprite icone da `vendor/` copiato dalle official_resources.

## 9. Sicurezza

- Read-only, origini: Pages + TA.
- Nessun segreto di produzione nel repo. Le chiavi sotto `demo/keys/` sono **fittizie** (offer `issuer_state` + firma esempi SD-JWT e mdoc) e vanno trattate come tali.
- Credential Offer: `issuer_state` di esempio cifrato con la chiave RSA di demo, non con PDND.
- CSP in `index.html` (fase implementazione): `default-src 'self'`; `connect-src 'self' https://pre.ta.wallet.ipzs.it https://ta.wallet.ipzs.it`.
- Integrità schemi: hash `schema_uri#integrity`.
