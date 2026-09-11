# Motore di ricerca

## 1. Esperienza

Un unico campo, placeholder bilingue («Cerca tipi, legal type, attributi, emittenti, fonti…» / «Search types, legal type, attributes, issuers, sources…»), pattern visivo del search di `it-wallet.html` (icona lente, clear, submit).

Sotto il campo testo, quattro `<select>` HTML (`legal_type`, emittente, fonte autentica, attributo/claim) popolati dal dump. Cambiare un menu **scrive** nella query (`legal_type:pub-eaa`, `issuer:"…"`, `as:"…"`, `claim:family_name`) invece di un secondo motore. `legal_type` elenca sempre `pub-eaa`, `qeaa`, `eaa`; gli altri menu usano valori reali del registro. Requisiti: F-01, A-23.

Sopra la query, un `<select>` **Ambiente** (F-12, A-01) sceglie collaudo (`pre`) o produzione (`prod`) e mostra il Trust Anchor (`https://pre.ta.wallet.ipzs.it` / `https://ta.wallet.ipzs.it`). Lo switch ricarica il dump (`?env=pre|prod`), non è un token Lucene. Alias accettati nel permalink: `preprod`/`collaudo` → `pre`; `produzione`/`production` → `prod`.

Risultati: lista accessibile + filtro grafo (stesso insieme). Sotto il campo, `query.understood` riassume in italiano/inglese la query interpretata (OR, raggruppamenti, `+`/`-`).

## 2. Sintassi (Lucene-lite)

Allineata a «`+`, `-`, `""` e notazioni note» (Solr/Lunr/Google-advanced):

| Notazione | Significato | Esempio |
|-----------|-------------|---------|
| `a b` | entrambi i termini (AND) | `mDL patente` |
| `+a` | `a` obbligatorio | `+mDL` |
| `-a` | esclude `a` | `pub-eaa -pid` |
| `"a b"` | frase | `"tessera sanitaria"` |
| `campo:valore` | campo normalizzato | `legal_type:qeaa` |
| `campo:"frase"` | campo + frase | `issuer:"Istituto Poligrafico"` |
| `a OR b` | disgiunzione | `mDL OR pid` |
| `(a OR b) +c` | raggruppamento | `(mDL OR av) -eaa` |
| `a*` `a?` | wildcard | `education*` |
| `a^2` | boost | `mDL^3` |

Query vuota: mostra l’albero completo.

## 3. Campi `campo:`

| Campo | Alias | Sorgente |
|-------|-------|----------|
| `type` | `credential_type`, `kind` | tipo nodo o `credential_type` |
| `legal_type` | `legal` | catalogo (credenziale o issuer) |
| `claim` | `attr`, `attribute` | claims registry / schema / FA capabilities |
| `issuer` | `emittente` | `entity_id`, nome, `organization_code` |
| `as` | `source`, `fa`, `authentic_source` | FA `entity_id`, IPA, nome |
| `format` | | `dc+sd-jwt`, `mso_mdoc` |
| `domain` `class` `purpose` | | tassonomia / catalogo |
| `schema` | | `schemas[].id` |
| `env` | | **non** un token di ricerca: si cambia con il `<select>` Ambiente / `?env=` (F-12) |

Valori `legal_type` ammessi: `pub-eaa`, `qeaa`, `eaa`. Il PID si cerca con `type:pid`, non come legal type distinto (vedi manuale).

## 4. Indicizzazione

Ogni nodo del modello (non il JWT raw) è un documento in memoria filtrato da `searchDocuments`:

- `id`, `kind`, `label`, `text` (concatenazione ricercabile)
- campi facet come sopra (`legal_type`, `issuer`, `as`, `claim`, …)
- matching: AND dei termini non firmati, `+`/`-`, `campo:valore` (valori quotati), `*` in coda al valore

I JWT e i CDDL restano ricercabili via `text` estratto (chiavi JSON, `description`, nomi claim), non via blob binario.

## 5. Binding col grafo

`search(query)` restituisce `Set(id)`.

Il grafo visibile = `match ∪ ancestors(match) ∪ requiredEdges(match)`.

`requiredEdges` include sempre, per una credenziale matchata: archi verso issuer, authentic source e schemi di quel `credential_type`.

La lista risultati mostra **solo** i match, non gli antenati (gli antenati restano nel grafo per contesto gerarchico).

## 6. Accessibilità ricerca

Come `it-wallet.html` per il campo testo: `role="search"`, `aria-describedby` per la sintassi, `role="alert"` per query non parsabile, live region sul conteggio risultati.

I facet e l’ambiente MUST avere `<label>` visibili associate (`for`/`id`), rese come intestazioni (`h2`/`h3`) distinte dal testo di supporto: Ambiente, Cerca, `legal_type`, Emittente, Fonte autentica, Attributo/claim. Il Trust Anchor è un link testuale (non solo icona).
