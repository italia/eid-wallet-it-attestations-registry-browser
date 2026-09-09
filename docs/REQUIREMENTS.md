# Requisiti — IT-Wallet Registry Explorer

Versione requisiti: **0.1.0**  
Origine: richiesta di progetto + valutazione del [manuale del registro](EVALUATION_HANDBOOK.md) + Specifiche Tecniche IT-Wallet v1.4.6.

Priorità: **MUST** / **SHOULD** / **MAY** (RFC 2119).

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

MUST registrare ogni fetch in `cache/manifest.json` (URL, status, content-type, hash, timestamp, errore).

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

- successi di load (risorsa, byte/tempo, dump vs live)
- errori con **motivazione** (status HTTP, CORS, JWT non decodificabile, integrity mismatch, 404 produzione, WAF HTML)
- stato `pending` per i refresh in corso
- `aria-live` per gli annunci

MUST avere un’**icona nella navbar in alto a destra**, con badge del numero di errori aperti.

### F-07 Retry

Ogni errore MUST mostrare un pulsante **Riprova** / **Retry** che rilanja solo quella risorsa (o il gruppo dipendente) e aggiorna la riga in bacheca.

### F-08 Multilingua

MUST italiano e inglese, stesso meccanismo delle pagine ufficiali (i18next, file `locales/it.json` e `locales/en.json`, dropdown ITA/ENG nell’header slim).

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

---

## 3. Requisiti non funzionali (richiesti)

### NF-01 Template e accessibilità

MUST riusare struttura e pattern di:

- `official_resources/discovery-page/disco.html`
- `official_resources/it-wallet-selection-page/it-wallet.html`

incluso: skip-link, `role="banner"` / `contentinfo`, header slim + lingua, `main` etichettato, footer legale (note, privacy, accessibilità), focus visibile, navigazione da tastiera, contrasto Bootstrap Italia. Vedi [ACCESSIBILITY.md](ACCESSIBILITY.md).

### NF-02 Icona bacheca in navbar

L’icona bacheca MUST stare nella **zona destra dell’header slim** (accanto al selettore lingua), non nel titolo di pagina.

### NF-03 Stack JavaScript

MUST essere JavaScript (ESM). Nessun backend runtime. GitHub Actions MAY usare Node solo per dump e build.

### NF-04 Servizio su CDN GitHub

MUST essere pubblicabile su GitHub Pages (`base: './'`), senza server applicativo.

### NF-05 Performance percepita

MUST mostrare il dump in meno di 2 s su desktop medio dopo il fetch dei JSON locali. Il refresh live MUST essere asincrono.

### NF-06 Nessun dato personale

MUST trattare solo metadati di registro. MUST NON loggare query verso terze parti. La cache browser MUST restare in origine (GitHub Pages).

---

## 4. Requisiti aggiuntivi (introdotti in sede di progettazione)

Motivati da manuale, ST e vincoli GitHub Pages.

| ID | Priorità | Requisito |
|----|----------|-----------|
| A-01 | MUST | Switch **collaudo / produzione** (URL TA distinti). Produzione può non avere catalogo: bacheca, non crash. |
| A-02 | MUST | Vista **tabella/lista** equivalente al grafo (WCAG: il canvas non è l’unica modalità). |
| A-03 | MUST | Deep link: `?q=`, `?env=pre\|prod`, `?node=` ripristinano ricerca e selezione. |
| A-04 | MUST | Catalogo JWT: salvare raw; in UI mostrare payload decodificato e header JOSE (`kid`, `alg`). |
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
| A-17 | MUST | `manifest.json` del dump versionato insieme ai file. |
| A-18 | SHOULD | Rate limiting nel crawler (pausa tra fetch, retry esponenziale su 429/5xx). |
| A-19 | MUST | Pagine `noscript` e messaggio se JS è disabilitato. |
| A-20 | SHOULD | Content-Security-Policy compatibile con GitHub Pages (script propri + CDN i18next se ancora usata; obiettivo: tutto bundled). |
| A-21 | MAY | Confronto pre vs prod nella stessa sessione (due radici). |
| A-22 | SHOULD | Documentare in bacheca lo scostamento path schema (`/schemas/v1.3.3/…` vs esempio ST). |

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
2. La query `legal_type:pub-eaa +mDL -pid` riduce lista e grafo a mDL e ai suoi issuer/FA/antenati.
3. La navbar in alto a destra apre la bacheca; un 404 su produzione ha Riprova.
4. Ogni card attestato mostra QR e link `openid-credential-offer://`.
5. IT/EN commutano header, bacheca, ricerca e caption del grafo.
6. Il nightly aggiorna `cache/` senza toccare a mano i file.
