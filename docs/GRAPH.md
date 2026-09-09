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

- click / Enter: pannello dettaglio (metadati, schema, offer QR)
- tastiera: il grafo NON è l’unico controllo; la lista a sinistra è un `listbox` o una `table` sincronizzata
- zoom/pan: pulsanti +/-/fit, non solo rotella
- selezione sincronizzata lista ↔ grafo

## 6. Dati di collaudo attesi (fotografia manuale 3/9/2026)

10 `credential_type` tutti `pub-eaa`:  
`av`, `education_attendance`, `education_degree`, `education_diploma`, `education_enrollment`, `EuropeanDisabilityCard`, `EuropeanHealthInsuranceCard`, `mDL`, `pid`, `residency`.

18 schemi (più formati per tipo). Il grafo deve far vedere **due schemi** (sd-jwt e mdoc) dove entrambi esistono, e un solo formato dove l’inventario è incompleto (PID solo SD-JWT, AV solo mdoc, secondo il manuale).
