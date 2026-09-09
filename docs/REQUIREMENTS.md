# Requisiti — IT-Wallet Registry Search Engine

Versione requisiti: **0.2.0**  
Origine: richiesta di progetto + valutazione del [manuale del registro](EVALUATION_HANDBOOK.md) + Specifiche Tecniche IT-Wallet v1.4.6 + aggiornamenti UI (facet di ricerca, header `disco.html`, switch Trust Anchor, traccia HTTP in bacheca).

Priorità: **MUST** / **SHOULD** / **MAY** (RFC 2119).

Changelog 0.2.0: F-01 facet HTML, F-06 traccia per-chiamata, F-08 etichette `ITA`/`EN`, F-12 ambiente/TA, NF-07 identità visiva header `disco.html`, A-01/A-03/A-17/A-20 allineati all’implementazione.

---

## 1. Obiettivo

Consentire a giuristi, tecnici PA e sviluppatori di **navigare graficamente** i metadati pubblici del Registro IT-Wallet (catalogo, schemi, claims, fonti autentiche, tassonomia), con un **motore di ricerca umano** e una **cache** alimentata da dump REST fedeli.

Il tool è statico, open source, servito dalla CDN GitHub Pages.

---

## 2. Requisiti funzionali (richiesti)

### F-01 Motore di ricerca

Il motore MUST indicizzare e filtrare almeno:

| Dimensione | Campi sorgente |
|------------|----------------|
| Tipo credenziale / attestato | `credentials[].credential_type`, `schemas[].credential_type`, nodi tassonomia |
| Legal type | `credentials[].legal_type` e `credentials[].issuers[].legal_type` (`pub-eaa`, `qeaa`, `eaa`) |
| Attributo / claim | chiavi del claims registry, `available_claims`, campi schema |
| Issuer | `credentials[].issuers[]` (`entity_id`, `organization_name*`, `organization_code`) |
| Authentic source | registro FA e `credentials[].authentic_sources[]` |

MUST essere possibile combinare dimensioni (query testuale + facet UI).

Il form di ricerca MUST esporre `<select>` HTML, etichettati, popolati dal dump:

| Controllo | Valori | Effetto |
|-----------|--------|---------|
| `legal_type` | sempre `pub-eaa`, `qeaa`, `eaa` (+ vuoto = tutti) | scrive `legal_type:` nella query |
| Emittente | issuer reali del catalogo | scrive `issuer:` |
| Fonte autentica | FA reali del registro | scrive `as:` |
| Attributo / claim | claim usati dalle FA | scrive `claim:` |

I menu MUST **scrivere nella stessa query** Lucene-lite (`legal_type:pub-eaa`, `issuer:"…"`, `as:"…"`, `claim:family_name`), non un secondo motore. Dettaglio: [SEARCH.md](SEARCH.md).

### F-02 Sintassi di query

Il motore MUST accettare le notazioni da [SEARCH.md](SEARCH.md):

- termini in AND implicito
- `+termine` (obbligo), `-termine` (esclusione)
- `"frase esatta"`
- `campo:valore` (es. `legal_type:pub-eaa`, `issuer:ipzs`, `claim:family_name`)
- `*` / `?` (wildcard)
- `termine^2` (boost)
- raggruppamento con `()`

SHOULD essere disponibile un riassunto in linguaggio naturale della query interpretata (`query.understood`).

### F-03 Dump cache da REST, gerarchia fedele

Uno script MUST scaricare le risorse REST del registro **senza trasformare i body**, salvandole sotto `cache/<host>/<path>` come in [CACHE-AND-CI.md](CACHE-AND-CI.md).

MUST partire da `/.well-known/it-wallet-registry` e seguire `endpoints.*` e gli URI derivati (`schema_uri`, bundle l10n se raggiungibili).

MUST registrare ogni fetch negli indici di dump (URL, status, content-type / application type, hash, timestamp, `duration_ms`, errore).

MUST scrivere `cache/manifest-pre.json` e `cache/manifest-prod.json` (un indice per Trust Anchor). `cache/manifest.json` MUST restare il dump di default di collaudo (`pre`) per compatibilità.

### F-04 CI GitHub Pages con due CD

1. **Nightly CD** MUST aggiornare la cache nel repository (cron + `workflow_dispatch`).
2. **Cache CD** MUST pubblicare GitHub Pages quando la cache (o l’app) cambia.

Dettaglio: [CACHE-AND-CI.md](CACHE-AND-CI.md).

### F-05 Refresh cache browser all’avvio

Al load l’app MUST:

1. Mostrare subito i dati del dump servito con l’app (repo / Pages).
2. In background tentare il refresh dal Trust Anchor verso la cache **del browser** (Cache API + IndexedDB), senza bloccare l’UI.
3. Se il live differisce dal dump, aggiornare indice, grafo e bacheca.
4. Se CORS/rete fallisce, restare sul dump e segnalare in bacheca.

### F-06 Bacheca messaggi

MUST esistere una bacheca (drawer o offcanvas Bootstrap Italia) con:

- **una riga per ogni chiamata HTTP** avvenuta (manifest + ogni risorsa del dump, tentativi falliti inclusi)
- per ciascuna riga: **endpoint** (URL del Trust Anchor o URL richiesto), **metodo**, **status code**, **tempo di risposta** (`duration_ms`), **application type** (`Content-Type` / media type, es. `application/json`, `application/jose`)
- errori con **motivazione** (status HTTP, CORS, JWT non decodificabile, integrity mismatch, 404 produzione, WAF HTML) e pulsante Riprova
- stato `pending` per i refresh in corso (SHOULD)
- `role="log"` e `aria-live` per gli annunci

MUST avere un’**icona nella navbar in alto a destra**, con badge del numero di errori aperti.

La bacheca MUST NON riassumere il load in un’unica riga «N risorse caricate» al posto del dettaglio per-chiamata.

### F-07 Retry

Ogni errore MUST mostrare un pulsante **Riprova** / **Retry** che rilanja solo quella risorsa (o il gruppo dipendente) e aggiorna la riga in bacheca.

### F-08 Multilingua

MUST italiano e inglese, file `src/locales/it.json` e `src/locales/en.json`, dropdown **ITA** / **EN** nell’header slim (markup `disco.html`, NF-07). `document.documentElement.lang` MUST seguire la lingua scelta.

SHOULD usare i bundle `localization` del registro quando disponibili; fallback sulle chiavi tecniche (`credential_type`, `l10n_id`).

### F-09 Grafo gerarchico verticale

MUST rappresentare i nodi con layout **top-down** (radice in alto):

```text
IT-Wallet Registry
 ├── Catalogo
 │    ├── <credential_type>
 │    │     ├── Issuer(s)
 │    │     └── Authentic source(s)
 ├── Schemi
 ├── Claims
 ├── Fonti autentiche
 └── Tassonomia
```

Attestati e credenziali MUST essere collegati a **uno o più** credential issuer e/o authentic source quando il catalogo li dichiara.

### F-10 Filtro grafo dai risultati di ricerca

La stessa query MUST filtrare il grafo: restano visibili **solo** i nodi che matchano **più gli antenati gerarchici** (fino alla radice) **più gli archi** che li collegano (issuer, FA, schema del tipo). I nodi non pertinenti MUST essere nascosti, non solo opacizzati, salvo un toggle SHOULD “mostra contesto”.

### F-11 Credential Offer per attestato

Ogni attestato/credenziale MUST offrire:

- href `openid-credential-offer://` (e SHOULD `haip-vci://` come alias)
- QR code equivalente

conformi alle ST, con i limiti in [CREDENTIAL_OFFER.md](CREDENTIAL_OFFER.md) (offer di discovery, `grants.authorization_code` senza `issuer_state` cifrato PDND).

### F-12 Switch collaudo / produzione e Trust Anchor

Il form di ricerca MUST includere un `<select>` **Ambiente** con almeno:

| Valore | Etichetta (it) | Trust Anchor |
|--------|----------------|--------------|
| `pre` | Collaudo (preprod) | `https://pre.ta.wallet.ipzs.it` |
| `prod` | Produzione | `https://ta.wallet.ipzs.it` |

L’UI MUST **indicare il Trust Anchor** dell’ambiente attivo (URL visibile e linkabile). Il cambio ambiente MUST ricaricare il dump corrispondente (`manifest-pre.json` / `manifest-prod.json`) e MUST aggiornare il permalink `?env=pre|prod`. Non è un token della query Lucene.

Produzione MAY avere catalogo incompleto o assente: l’app MUST non crashare; gli errori restano in bacheca (F-06, F-07).

---

## 3. Requisiti non funzionali (richiesti)

### NF-01 Template e accessibilità

MUST riusare struttura e pattern di:

- `official_resources/discovery-page/disco.html`
- `official_resources/it-wallet-selection-page/it-wallet.html`

incluso: skip-link, `role="banner"` / `contentinfo`, header slim + lingua, `main` etichettato, footer legale (note, privacy, accessibilità), focus visibile, navigazione da tastiera, contrasto Bootstrap Italia. Vedi [ACCESSIBILITY.md](ACCESSIBILITY.md).

### NF-02 Icona bacheca in navbar

L’icona bacheca MUST stare nella **zona destra dell’header slim** (accanto al selettore lingua), non nel titolo di pagina. MUST usare lo stesso pattern `nav-link` dello slim header (non un `btn btn-link` Bootstrap generico).

### NF-03 Stack JavaScript

MUST essere JavaScript (ESM). Nessun backend runtime. GitHub Actions MAY usare Node solo per dump e build.

### NF-04 Servizio su CDN GitHub

MUST essere pubblicabile su GitHub Pages (`base: './'`), senza server applicativo.

### NF-05 Performance percepita

MUST mostrare il dump in meno di 2 s su desktop medio dopo il fetch dei JSON locali. Il refresh live MUST essere asincrono.

### NF-06 Nessun dato personale

MUST trattare solo metadati di registro. MUST NON loggare query verso terze parti. La cache browser MUST restare in origine (GitHub Pages).

### NF-07 Identità visiva header = `disco.html`

I controlli in alto a destra (lingua e bacheca) e il **menu dropdown lingua** MUST essere identici, nello stile e nel markup, a `official_resources/discovery-page/disco.html`:

- trigger lingua: `button.nav-link.dropdown-toggle`, etichetta `ITA` / `EN`, icona `it-expand`, senza caret Bootstrap `::after`
- menu: `dropdown-menu` + `link-list-wrapper` + `ul.link-list` + `button.dropdown-item.list-item` (`menuitemradio`)
- offset Popper 24 px tra trigger e menu
- colori slim `#004D99`, voci menu blu Italia (attivo scuro, hover sottolineato)

Dettaglio: [ACCESSIBILITY.md](ACCESSIBILITY.md).

---

## 4. Requisiti aggiuntivi (introdotti in sede di progettazione)

Motivati da manuale, ST e vincoli GitHub Pages.

| ID | Priorità | Requisito |
|----|----------|-----------|
| A-01 | MUST | Switch **collaudo / produzione** nel form di ricerca (F-12), con URL del Trust Anchor visibile. Produzione può non avere catalogo: bacheca, non crash. |
| A-02 | MUST | Vista **tabella/lista** equivalente al grafo (WCAG: il canvas non è l’unica modalità). |
| A-03 | MUST | Deep link: `?q=`, `?env=pre\|prod`, `?node=` ripristinano ricerca, ambiente e selezione. |
| A-04 | MUST | Catalogo JWT: salvare raw; al click su un’entità mostrare l’artefatto originale firmato e header/payload JOSE in chiaro (`kid`, `alg`). |
| A-05 | SHOULD | Verifica firma JWT del catalogo con JWKS del Trust Anchor, quando scaricabili. |
| A-06 | SHOULD | Verifica `schema_uri#integrity` (SRI sha256) dopo il fetch dello schema. |
| A-07 | MUST | CORS: se il TA non espone `Access-Control-Allow-Origin`, il refresh browser fallisce in modo esplicito; il dump CI resta valido. |
| A-08 | MUST | Dump con `GET` e `User-Agent` identificabile; **non usare HEAD** (WAF). |
| A-09 | SHOULD | Tentare bundle l10n; se WAF rifiuta, errore ritriabile in bacheca, UI su `*_l10n_id`. |
| A-10 | SHOULD | Dump metadati OpenID4VCI di ogni issuer (`/.well-known/openid-credential-issuer`) per `credential_configuration_ids` reali nelle offer. |
| A-11 | MAY | Dump federazione (`/list`, entity configuration) dietro flag. |
| A-12 | SHOULD | Diff dump vs live in bacheca (hash o `last_updated`). |
| A-13 | SHOULD | Permalink e export JSON del sotto-grafo filtrato. |
| A-14 | MUST | Disclaimer visibile: tool non ufficiale; offer non è un’emissione di produzione. |
| A-15 | SHOULD | Rispetto `prefers-reduced-motion` sul layout del grafo. |
| A-16 | MAY | Export PNG/SVG del grafo visibile. |
| A-17 | MUST | Indici dump versionati: `manifest.json` (default `pre`), `manifest-pre.json`, `manifest-prod.json`. |
| A-18 | SHOULD | Rate limiting nel crawler (pausa tra fetch, retry esponenziale su 429/5xx). |
| A-19 | MUST | Pagine `noscript` e messaggio se JS è disabilitato. |
| A-20 | SHOULD | Content-Security-Policy compatibile con GitHub Pages (script propri; obiettivo: tutto bundled). |
| A-21 | MAY | Confronto pre vs prod nella stessa sessione (due radici). |
| A-22 | SHOULD | Documentare in bacheca lo scostamento path schema (`/schemas/v1.3.3/…` vs esempio ST). |
| A-23 | MUST | Facet HTML `legal_type` / issuer / FA / claim che scrivono `campo:valore` nella query (F-01). |
| A-24 | MUST | Bacheca: traccia completa delle GET (endpoint, status, ms, application type) (F-06). |
| A-25 | MUST | Header slim: dropdown lingua e campanella allineati a `disco.html` (NF-07). |
| A-26 | MUST | Dettaglio nodo (lista **e grafo**): artefatti dump (JWS/JSON/CDDL). JWT: originale firmato **oppure** header e payload in chiaro; per credenziali/issuer/FA anche estratto dell’entità. JSON: presentazione indentata con espandi/comprimi di oggetti e array innestati. |

---

## 5. Fuori ambito (v1)

- Emissione reale di attestati, cifratura `issuer_state` con chiave PDND, login utente.
- Archivio di dati dei cittadini, sessioni wallet, WSCD.
- Modifica dei registri (il tool è read-only).
- Sostituzione delle Specifiche Tecniche o del Trust Anchor.
- App nativa / estensione browser.

---

## 6. Criteri di accettazione sintetici

1. Clonando il repo e aprendo Pages (o `npm run dev` dopo `npm run dump:pre`) si vede il grafo radicato in «IT-Wallet Registry» con i tipi presenti in catalogo di collaudo.
2. La query `legal_type:pub-eaa +mDL -pid` riduce lista e grafo a mDL e ai suoi issuer/FA/antenati. I `<select>` `legal_type` / emittente / FA / claim compilano gli stessi token.
3. La navbar in alto a destra (stile `disco.html`) apre la bacheca; ogni GET del dump è una riga con endpoint, HTTP status, ms e application type; un 404 ha Riprova.
4. Ogni card attestato mostra QR e link `openid-credential-offer://`.
5. IT/EN commutano header, bacheca, ricerca e caption del grafo. Il trigger lingua mostra `ITA`/`EN` e il menu `link-list` di `disco.html`.
6. Il nightly aggiorna `cache/` senza toccare a mano i file. `npm run dump:prod` scrive `manifest-prod.json` sotto `cache/ta.wallet.ipzs.it/`.
7. Il menu Ambiente mostra Collaudo/Produzione e l’URL del Trust Anchor; `?env=prod` carica il dump di produzione.
