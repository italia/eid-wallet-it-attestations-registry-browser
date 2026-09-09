# Grafo gerarchico

## 1. Layout

Cytoscape.js + estensione `cytoscape-dagre`:

- `rankDir: 'TB'` (radice in alto, foglie in basso)
- `rankSep` / `nodeSep` tali da non sovrapporre label su desktop
- nodi compound opzionali per i cinque registri (box Catalogo, Schemi, …)

Ridotto movimento se `prefers-reduced-motion: reduce` (niente `animate` sul layout).

## 2. Tipi di nodo

| `kind` | Forma / colore (Bootstrap Italia) | Esempio |
|--------|-----------------------------------|---------|
| `registry` | radice, blu primario | IT-Wallet Registry |
| `catalog` `schemas` `claims` `authentic_sources` `taxonomy` | contenitori | i cinque elenchi |
| `credential` | documento | `mDL`, `pid`, `av` |
| `issuer` | organizzazione | entity_id emittente |
| `authentic_source` | organizzazione secondaria | MIT / FA |
| `schema` | ingranaggio | `mDL+mso_mdoc+…` |
| `claim` | attributo | `family_name` |
| `domain` `class` `purpose` | tassonomia | `IDENTITY` |

Un issuer o una FA che serve più attestati è **un solo nodo** con più archi.

## 3. Archi

```text
registry → catalog → credential
credential → issuer
credential → authentic_source
registry → schemas → schema
credential → schema          (stesso credential_type)
registry → claims → claim
authentic_source → claim     (available_claims)
registry → taxonomy → domain → class → credential
```

Non si inventano archi issuer↔FA se il catalogo non li dichiara: il percorso è credenziale in mezzo.

## 4. Filtro da ricerca

Input: insieme M dei nodi matchati.

Visibili:

- M
- tutti gli antenati fino a `registry` (chiusura gerarchica)
- per ogni `credential` in M: issuer, FA, schemi collegati
- archi tra nodi visibili

Niente “fantasma” dei non-match (default). Toggle SHOULD «mostra resto in grigio».

## 5. Interazione

- click / Enter: pannello dettaglio sotto lista e grafo (metadati, **artefatti grezzi** JWS/JSON/CDDL, offer QR)
- trascinamento: i nodi sono **spostabili** con il mouse (o touch); lo sfondo continua a fare pan
- tastiera: il grafo NON è l’unico controllo; la lista sopra è sincronizzata
- layout: il grafo occupa tutta la larghezza disponibile della riga di pagina
- zoom/pan: pulsanti icona Bootstrap Italia (`it-zoom-in`, `it-zoom-out`, `it-maximize`) e rotella
- selezione sincronizzata lista ↔ grafo

## 6. Dati attesi (dump 9/9/2026)

**Collaudo** (`pre`, `https://pre.ta.wallet.ipzs.it`): 10 `credential_type` tutti `pub-eaa`:  
`av`, `education_attendance`, `education_degree`, `education_diploma`, `education_enrollment`, `EuropeanDisabilityCard`, `EuropeanHealthInsuranceCard`, `mDL`, `pid`, `residency`.

18 schemi (più formati per tipo). Il grafo deve far vedere **due schemi** (sd-jwt e mdoc) dove entrambi esistono, e un solo formato dove l’inventario è incompleto (PID solo SD-JWT, AV solo mdoc, secondo il manuale).

**Produzione** (`prod`, `https://ta.wallet.ipzs.it`): dump su disco (`manifest-prod.json`, `cache/ta.wallet.ipzs.it/`). Selezionabile dall’UI (F-12). Il grafo MUST restare usabile anche se il catalogo prod è più magro o in errore (bacheca, non crash).
