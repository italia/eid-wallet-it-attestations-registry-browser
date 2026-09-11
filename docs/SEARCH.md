# Search engine

## 1. Experience

A single field, example placeholder (`+mDL legal_type:pub-eaa -pid`, the same in it/en), visual pattern of the `it-wallet.html` search (lens icon, clear, submit).

Under the text field, four HTML `<select>`s (`legal_type`, issuer, authentic source, attribute/claim) populated from the dump. Changing a menu **writes** into the query (`legal_type:pub-eaa`, `issuer:"…"`, `as:"…"`, `claim:family_name`) instead of a second engine. `legal_type` always lists `pub-eaa`, `qeaa`, `eaa`; the other menus use real registry values. Requirements: F-01, A-23.

Above the query, an **Environment** `<select>` (F-12, A-01) chooses pre-production (`pre`) or production (`prod`) and shows the Trust Anchor (`https://pre.ta.wallet.ipzs.it` / `https://ta.wallet.ipzs.it`). The switch reloads the dump (`?env=pre|prod`); it is not a Lucene token. Permalink aliases: `preprod`/`collaudo` → `pre`; `produzione`/`production` → `prod`.

Results: accessible list + graph filter (same set). Each list row has a Bootstrap Italia icon for the node kind (`it-card` for credentials). Under the field, `query.understood` summarises the interpreted query in Italian/English (OR, grouping, `+`/`-`).

## 2. Syntax (Lucene-lite)

Aligned with “`+`, `-`, `""` and well-known notations” (Solr/Lunr/Google-advanced):

| Notation | Meaning | Example |
|----------|---------|---------|
| `a b` | both terms (AND) | `mDL patente` |
| `+a` | `a` required | `+mDL` |
| `-a` | exclude `a` | `pub-eaa -pid` |
| `"a b"` | phrase | `"tessera sanitaria"` |
| `field:value` | normalised field | `legal_type:qeaa` |
| `field:"phrase"` | field + phrase | `issuer:"Istituto Poligrafico"` |
| `a OR b` | disjunction | `mDL OR pid` |
| `(a OR b) +c` | grouping | `(mDL OR av) -eaa` |
| `a*` `a?` | wildcard | `education*` |
| `a^2` | boost | `mDL^3` |

Empty query: show the full tree.

## 3. `field:` fields

| Field | Aliases | Source |
|-------|---------|--------|
| `type` | `credential_type`, `kind` | node type or `credential_type` |
| `legal_type` | `legal` | catalog (credential or issuer) |
| `claim` | `attr`, `attribute` | claims registry / schema / authentic-source capabilities |
| `issuer` | `emittente` | `entity_id`, name, `organization_code` |
| `as` | `source`, `fa`, `authentic_source` | authentic source `entity_id`, IPA, name |
| `format` | | `dc+sd-jwt`, `mso_mdoc` |
| `domain` `class` `purpose` | | taxonomy / catalog |
| `schema` | | `schemas[].id` |
| `env` | | **not** a search token: change with the Environment `<select>` / `?env=` (F-12) |

Allowed `legal_type` values: `pub-eaa`, `qeaa`, `eaa`. Search PID with `type:pid`, not as a distinct legal type (see the handbook).

## 4. Indexing

Each model node (not the raw JWT) is an in-memory document filtered by `searchDocuments`:

- `id`, `kind`, `label`, `text` (searchable concatenation)
- facet fields as above (`legal_type`, `issuer`, `as`, `claim`, …)
- matching: AND of unsigned terms, `+`/`-`, `field:value` (quoted values), trailing `*` on the value

JWTs and CDDL remain searchable via extracted `text` (JSON keys, `description`, claim names), not via binary blobs.

## 5. Binding to the graph

`search(query)` returns `Set(id)`.

Visible graph = `match ∪ ancestors(match) ∪ requiredEdges(match)`.

`requiredEdges` always includes, for a matched credential: edges to issuers, authentic sources and schemas of that `credential_type`.

The result list shows **only** matches, not ancestors (ancestors stay in the graph for hierarchical context).

## 6. Search accessibility

Like `it-wallet.html` for the text field: `role="search"`, `aria-describedby` for syntax, `role="alert"` for an unparsable query, live region on the result count.

Facets and environment MUST have visible associated `<label>`s (`for`/`id`), rendered as headings (`h2`/`h3`) distinct from supporting text: Environment, Search, `legal_type`, Issuer, Authentic source, Attribute/claim. The Trust Anchor is a text link (not icon-only).
