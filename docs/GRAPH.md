# Hierarchical graph

## 1. Layout

Cytoscape.js + `cytoscape-dagre` extension:

- `rankDir: 'TB'` (root at the top, leaves at the bottom)
- `rankSep` / `nodeSep` such that labels do not overlap on desktop
- optional compound nodes for the five registries (Catalog, Schemas, … boxes)

Reduced motion if `prefers-reduced-motion: reduce` (no `animate` on the layout).

## 2. Node types

| `kind` | Shape / colour (Bootstrap Italia) | Example |
|--------|-----------------------------------|---------|
| `registry` | root, primary blue | IT-Wallet Registry |
| `catalog` `schemas` `claims` `authentic_sources` `taxonomy` | containers | the five lists |
| `credential` | document / `it-card` in the list | `mDL`, `pid`, `av` |
| `issuer` | organisation / `it-pa` | issuer `entity_id` |
| `authentic_source` | secondary organisation / `it-inbox` | MIT / authentic source |
| `schema` | gear / `it-file` | `mDL+mso_mdoc+…` |
| `claim` | attribute / `it-list` | `family_name` |
| `domain` `class` `purpose` | taxonomy / `it-folder`, `it-bookmark` | `IDENTITY` |

An issuer or authentic source that serves several attestations is **one node** with several edges.

## 3. Edges

```text
registry → catalog → credential
credential → issuer
credential → authentic_source
registry → schemas → schema
credential → schema          (same credential_type)
registry → claims → claim
authentic_source → claim     (available_claims)
registry → taxonomy → domain → class → credential
```

Do not invent issuer↔authentic-source edges if the catalog does not declare them: the path goes through the credential.

## 4. Filter from search

Input: set M of matched nodes.

Visible:

- M
- all ancestors up to `registry` (hierarchical closure)
- for each `credential` in M: linked issuers, authentic sources, schemas
- edges among visible nodes

No “ghost” of non-matches (default). SHOULD toggle “show the rest in grey”.

## 5. Interaction

- click / Enter: detail panel under list and graph (metadata, **raw artifacts** JWS/JSON/CDDL, offer QR)
- drag: nodes are **movable** with the mouse (or touch); the background still pans
- keyboard: the graph is NOT the only control; the list above is synchronised
- layout: the graph uses the full available width of the page row
- zoom/pan: Bootstrap Italia icon buttons (`it-zoom-in`, `it-zoom-out`, `it-maximize`) and the wheel
- list ↔ graph selection stays in sync

## 6. Expected data (dump 9/9/2026)

**Pre-production** (`pre`, `https://pre.ta.wallet.ipzs.it`): 10 `credential_type` values, all `pub-eaa`:  
`av`, `education_attendance`, `education_degree`, `education_diploma`, `education_enrollment`, `EuropeanDisabilityCard`, `EuropeanHealthInsuranceCard`, `mDL`, `pid`, `residency`.

18 schemas (more than one format per type). The graph MUST show **two schemas** (sd-jwt and mdoc) where both exist, and a single format where the inventory is incomplete (PID SD-JWT only, AV mdoc only, per the handbook).

**Production** (`prod`, `https://ta.wallet.ipzs.it`): on-disk dump (`cache/manifest-prod.json`, `cache/ta.wallet.ipzs.it/`). Selectable from the UI (F-12). The graph MUST stay usable even if the prod catalog is thinner or in error (board, not crash).
