# Motore di ricerca

## 1. Esperienza

Un unico campo, placeholder bilingue («Cerca tipi, legal type, attributi, emittenti, fonti…» / «Search types, legal type, attributes, issuers, sources…»), pattern visivo del search di `it-wallet.html` (icona lente, clear, submit).

A destra (desktop) o sotto (mobile): facet opzionali che **scrivono** nella query (`legal_type:pub-eaa`) invece di un secondo motore.

Risultati: lista accessibile + filtro grafo (stesso insieme).

## 2. Sintassi (Lucene-lite / Lunr)

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
| `env` | | `pre`, `prod` |

Valori `legal_type` ammessi: `pub-eaa`, `qeaa`, `eaa`. Il PID si cerca con `type:pid`, non come legal type distinto (vedi manuale).

## 4. Indicizzazione

Ogni nodo del modello (non il JWT raw) è un documento Lunr:

- `id`, `kind`, `label`, `text` (concatenazione ricercabile)
- campi facet come sopra
- pipeline: lunr stemmer EN + `lunr-languages` IT (trim, stopword it/en)

I JWT e i CDDL restano ricercabili via `text` estratto (chiavi JSON, `description`, nomi claim), non via blob binario.

## 5. Binding col grafo

`search(query)` restituisce `Set(id)`.

Il grafo visibile = `match ∪ ancestors(match) ∪ requiredEdges(match)`.

`requiredEdges` include sempre, per una credenziale matchata: archi verso issuer, authentic source e schemi di quel `credential_type`.

La lista risultati mostra **solo** i match, non gli antenati (gli antenati restano nel grafo per contesto gerarchico).

## 6. Accessibilità ricerca

Come `it-wallet.html`: `role="search"`, label visivamente nascosta, `aria-describedby` per la sintassi, `role="alert"` per query non parsabile, live region sul conteggio risultati.
