# Accessibilità e template ufficiali

Riferimenti da copiare (non re-inventare):

- `eidas-it-wallet-docs/official_resources/discovery-page/disco.html`
- `eidas-it-wallet-docs/official_resources/it-wallet-selection-page/it-wallet.html`
- `eidas-it-wallet-docs/official_resources/shared-ui/`
- Bootstrap Italia, WCAG 2.1 livello AA (come dichiarato nei README di quelle pagine)

## 1. Mapping struttura

| Elemento ufficiale | Explorer |
|--------------------|----------|
| `nav.it-skip-links` → `#main-content`, `#page-footer` | Uguale + skip verso `#registry-graph` e `#message-board` |
| Header slim `bg-primary` + brand | Brand «Registro IT-Wallet» (i18n) |
| Dropdown lingua ITA/ENG (`menuitemradio`) | Uguale, stesso script pattern `header-lang-dropdown.js` |
| Zona destra slim | **Lingua + bottone bacheca** (campanella/bacheca, `aria-expanded`, badge errori) |
| `header-title-section` + logo | Logo IT-Wallet da shared-ui |
| `main#main-content` | Titolo h1 + search + split lista/grafo |
| Footer legale Note / Privacy / Accessibilità | Link a pagine del progetto o a dichiarazione |
| `noscript` | Messaggio i18n |
| i18next da JSON | `src/locales/it.json`, `en.json` |

## 2. Bacheca (NF-02, F-06, F-07)

- Trigger: `button` in `.it-header-slim-right-zone`, **prima** o **dopo** il dropdown lingua ma nella stessa riga, a destra.
- Contenitore: Offcanvas Bootstrap Italia `placement="end"`.
- `role="log"` o lista `role="list"` con voci `status=ok|error|pending`.
- Errori: testo motivazione + `button` Riprova.
- Badge: `aria-label` «N errori in bacheca».
- Focus: al close il focus torna al bottone icona (come i dropdown ufficiali).

## 3. Grafo

Un canvas Cytoscape non è sufficiente per AA:

- lista/tabella gemella con gli stessi nodi visibili
- caption testuale del filtro («12 nodi visibili su 40, query …»)
- controlli zoom come `button`
- contrasto nodi/testo ≥ 4.5:1 (colori da palette Italia, non da default Cytoscape)

## 4. Ricerca e offer

- Pattern search di `it-wallet.html` (clear, `aria-invalid` su parse error)
- QR: `alt` = URI; il link testuale è sempre presente (il QR non è l’unico modo)
- Modali dettaglio: focus trap Bootstrap Italia

## 5. Asset da vendorare

Copiare da `official_resources/shared-ui/` (con attribuzione in NOTICE):

- `css/bootstrap-italia.min.css` **oppure** il pacchetto npm (stessa famiglia visiva)
- `css/style.css` (header slim, skip-link, footer)
- `js/bootstrap-italia.bundle.min.js`
- `js/header-lang-dropdown.js`
- `svg/sprites.svg`
- loghi `img/IT-Wallet-Logo-Primary-BlueItalia.svg`
- font Titillium / Lora / Roboto Mono se si vira il CSS ufficiale

Finché il vendor non è copiato, il guscio `index.html` può puntare al CDN jsDelivr di Bootstrap Italia **solo in sviluppo**; la build Pages SHOULD essere self-contained.
