# Architettura e framework

## 1. Vincoli che guidano la scelta

1. **Tutto JavaScript**, output statico, CDN GitHub Pages.
2. **Stessi template/accessibilità** di `disco.html` e `it-wallet.html` → Bootstrap Italia vanilla, non un wrapper React.
3. Grafo filtrabile + ricerca Lucene-like + JWT + QR.
4. Dump fedele dei REST (nessun backend applicativo).

## 2. Decisione

**Vite 7 + JavaScript ESM vanilla + Bootstrap Italia + Cytoscape.js + Lunr.js + i18next.**

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
│  i18n → cacheLoader → indexer (Lunr) → graph (Cytoscape) │
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
| Vanilla senza Vite | Import map e tree-shake di Cytoscape/Lunr più fragili su Pages. |
| D3-only per il grafo | Troppo codice custom per gerarchie + filtro. |
| vis-network | Layout gerarchico meno prevedibile di dagre. |
| Elastic / server search | Contraddice «solo JS / Pages». |
| MiniSearch da solo | Non ha `+` `-` `" "` out of the box; Lunr sì. |
| Service worker come unica cache | Complessità e debugging su Pages; IndexedDB è sufficiente. |

## 4. Moduli applicativi (`src/js`)

| Modulo | Responsabilità |
|--------|----------------|
| `i18n/` | i18next, dropdown lingua, `document.documentElement.lang` |
| `cache/loader.js` | Fetch dump da `./cache/manifest.json` + file gerarchici |
| `cache/browser.js` | Overlay IndexedDB, refresh live, confronto hash |
| `cache/jwt.js` | Split JOSE, decode payload, (fase 2) verify |
| `search/parser.js` | Tokenize `+ - "" () field: * ^` |
| `search/index.js` | Costruzione indice Lunr sui nodi normalizzati |
| `graph/model.js` | Registry → nodes/edges |
| `graph/view.js` | Cytoscape + dagre `rankDir: 'TB'` |
| `messages/` | Bacheca, badge, retry |
| `offer/` | Costruzione URI OpenID4VCI + QR |

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
2. i18next `it` default, `en` da `localStorage` se scelto.
3. `GET ./cache/manifest.json` → fetch parallelo delle risorse elencate.
4. Decode JWT catalogo se `typ` JOSE / tre segmenti.
5. Build modello grafo + indice Lunr.
6. Render grafo (radice) + lista.
7. Bacheca: una riga per risorsa (`ok` dal dump).
8. `requestIdleCallback` → refresh live per URL nel manifest.
9. Per ogni live: successo / errore+retry; se hash diverso, rebuild indice e grafo senza perdere la query corrente.

## 7. Ambienti

| Chiave | Base URL |
|--------|----------|
| `pre` | `https://pre.ta.wallet.ipzs.it` |
| `prod` | `https://ta.wallet.ipzs.it` |

Il dump nightly default è `pre` (produzione incompleta al 3/9/2026). L’UI può puntare a `prod` per il solo refresh live.

## 8. Dipendenze runtime

Vedi `package.json`. Obiettivo bundle: un vendor chunk (cytoscape+dagre è il più pesante) e un app chunk. Bootstrap Italia CSS da npm, sprite icone da `vendor/` copiato dalle official_resources.

## 9. Sicurezza

- Read-only, origini: Pages + TA.
- Nessun segreto nel repo.
- Credential Offer senza `issuer_state` PDND (non abbiamo la chiave).
- CSP in `index.html` (fase implementazione): `default-src 'self'`; `connect-src 'self' https://pre.ta.wallet.ipzs.it https://ta.wallet.ipzs.it`.
- Integrità schemi: hash `schema_uri#integrity`.
