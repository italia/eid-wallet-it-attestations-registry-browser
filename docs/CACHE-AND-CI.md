# Cache, dump REST e CI/CD

## 1. Principio

Due copie della stessa verità:

| Copia | Dove | Quando |
|-------|------|--------|
| **Dump di repo** | `cache/` servito da GitHub Pages | Nightly (e dump locale) |
| **Cache browser** | Cache API + IndexedDB, stessa gerarchia | All’avvio, in background |

I body REST si salvano **byte-per-byte** (JWT compreso). Nessuna pretty-print, nessun decode sul disco.

## 2. Gerarchia file

URL `https://pre.ta.wallet.ipzs.it/.well-known/schemas` →

```text
cache/pre.ta.wallet.ipzs.it/.well-known/schemas
```

URL `https://pre.ta.wallet.ipzs.it/schemas/v1.3.3/mdl.cddl` →

```text
cache/pre.ta.wallet.ipzs.it/schemas/v1.3.3/mdl.cddl
```

Niente estensione inventata: se il well-known non ha `.json`, il file non si chiama `.json`. Il `manifest` tiene il `Content-Type`.

```text
cache/
  manifest.json          # alias del dump pre (compatibilità)
  manifest-pre.json      # indice collaudo → https://pre.ta.wallet.ipzs.it
  manifest-prod.json     # indice produzione → https://ta.wallet.ipzs.it
  README.md
  pre.ta.wallet.ipzs.it/
    .well-known/…
    schemas/v1.3.3/…
  ta.wallet.ipzs.it/
    .well-known/…
    schemas/v1.3.3/…
```

## 3. Indici dump (`manifest.json`, `manifest-pre.json`, `manifest-prod.json`)

Schema interno (soggetto a versionamento `manifest_version`):

```json
{
  "manifest_version": 1,
  "generated_at": "2026-09-09T08:00:00Z",
  "env": "pre",
  "base_url": "https://pre.ta.wallet.ipzs.it",
  "tool": "eid-wallet-it-attestations-registry-browser@0.4.0",
  "resources": [
    {
      "url": "https://pre.ta.wallet.ipzs.it/.well-known/it-wallet-registry",
      "path": "pre.ta.wallet.ipzs.it/.well-known/it-wallet-registry",
      "status": 200,
      "content_type": "application/json",
      "sha256": "…",
      "bytes": 1234,
      "duration_ms": 140,
      "fetched_at": "2026-09-09T08:00:01Z",
      "error": null
    }
  ]
}
```

Il campo `tool` è la versione del crawler **al momento del dump**, non necessariamente quella corrente in `package.json`. Non si riscrivono a mano i dump già in `cache/`.

Oltre a `manifest.json` (dump di default = `pre`), lo script scrive `manifest-pre.json` e `manifest-prod.json`. L’UI carica quello dell’ambiente scelto (`?env=pre|prod`).

Risorse in errore restano elencate (`status` o `error`) così la bacheca può offrire Riprova anche a freddo.

## 4. Comportamento dello script `scripts/dump-registry.mjs`

1. `GET {base}/.well-known/it-wallet-registry` con `Accept: application/json, application/jwt;q=0.9`.
2. Parse JSON (o JWT → payload).
3. Per ogni `endpoints.*` dei registri dati: GET, salva raw, se JWT decodifica solo in RAM per scoprire altri URI.
4. Segue `schema_uri`.
5. Tenta `localization.base_uri` (può essere WAF-blocked).
6. Opzionale: issuer metadata, federazione.
7. Non usa `HEAD`.
8. `User-Agent: eid-wallet-it-attestations-registry-browser/<versione in package.json> (+https://github.com/italia/eid-wallet-it-attestations-registry-browser)`.
9. Retry 3× su 429/5xx, backoff.
10. Scrive `cache/manifest-{env}.json` e, se `env=pre`, anche `cache/manifest.json`.
11. Registra `duration_ms` per ogni GET (tempi di risposta del dump).

Flag: `--env pre|prod`, `--with-federation`, `--with-issuer-metadata`, `--dry-run`.

## 5. Cache browser

All’avvio:

1. Copia il dump Pages in Cache Storage (`itw-registry-dump`) se assente o se `manifest.generated_at` è più nuovo.
2. Serve l’UI da lì.
3. Refresh: `fetch(url, { headers: { Accept: '…' } })`.
4. Se ok e hash diverso → IndexedDB `itw-registry-live` + evento `cache:updated`.
5. Se fallisce → riga bacheca per quella GET (endpoint, status, ms, type) + Riprova.

Chiave IndexedDB = URL assoluto della risorsa TA, non il path Pages.

## 6. Due CD

### A — Nightly cache (`.github/workflows/nightly-cache.yml`)

- Trigger: `schedule` (02:15 UTC) e `workflow_dispatch`.
- Job: checkout → Node 22 → `node scripts/dump-registry.mjs --env pre --with-issuer-metadata` e `node scripts/dump-registry.mjs --env prod --with-issuer-metadata` in step separati.
- Se `git diff -- cache` non è vuoto: commit `chore(cache): nightly dump YYYY-MM-DD` come `github-actions[bot]`.
- **Non** lancia Vite. Responsabilità: solo cache.

### B — Pages da cache (`.github/workflows/pages.yml`)

- Trigger:
  - `push` su `cache/**`
  - `push` su `src/**`, `index.html`, `package.json`, `vite.config.js`, `public/**`
  - `workflow_dispatch`
  - `workflow_run` completato di nightly (se il nightly non ha potuto pushare sulla stessa ref, resta comunque copribile dal push)
- Job: `npm ci` → `npm run build` (`VITE_BASE=/eid-wallet-it-attestations-registry-browser/`) → `actions/upload-pages-artifact` + `actions/deploy-pages`.
- GitHub Pages MUST usare **GitHub Actions** (non “Deploy from a branch” sulla root: servirebbe `index.html` sorgente e `import 'qrcode'` fallisce nel browser).
- Durante il build, `cache/` è copiata in `public/cache/` (script `scripts/sync-cache-public.mjs` o `cp` nel workflow) così Vite la emette in `dist/cache/`.

Separazione voluta: un dump rotto non richiede di toccare l’app; un fix UI non richiede di ri-scaricare il TA.

## 7. CORS e WAF (vincoli reali)

Osservati a settembre 2026 su collaudo:

- Molti well-known del TA ora inviano `Access-Control-Allow-Origin: *`, quindi il refresh **live dal browser può riuscire**.
- Alcune risposte (es. discovery) inviano `Access-Control-Allow-Origin: *,*`, che i browser **rifiutano** (valore non valido). In quel caso la GET live fallisce, il dump resta visibile, la bacheca mostra Riprova.
- `HEAD` → HTML WAF. Solo `GET`.
- Catalogo: JWT JOSE, non JSON.
- Alcuni path `/l10n/` → `Request Rejected`.

Il nightly (GitHub→TA, server side) non è soggetto a CORS. Il dump di repo resta la fonte di verità (F-03). Il refresh browser (F-05) è best-effort verso Cache API / IndexedDB.

### Estensione CORS (solo collaudo locale)

Se una GET live resta a status 0 / “Failed to fetch”, si può sbloccare **temporaneamente** la lettura dal Trust Anchor:

1. Installa un’estensione del tipo **Allow CORS: Access-Control-Allow-Origin** (Chrome, Edge o Firefox).
2. Attivala **solo per la sessione** di prova. Consenti gli host `pre.ta.wallet.ipzs.it` e `ta.wallet.ipzs.it` (e, se serve, `pre.issuer.wallet.ipzs.it`).
3. Ricarica l’explorer, apri la bacheca, premi **Riprova** sulla riga fallita.
4. **Disattiva l’estensione** subito dopo: riscrive CORS su qualunque sito.

Non è un requisito di produzione e non sostituisce CORS corretto sul TA. L’app MUST continuare a funzionare sul dump senza estensione. La stessa guida è in bacheca quando compare un errore CORS.

Il proxy server-side resta **fuori ambito** v1.

## 8. Cosa non mettere in git

- Segreti, cookie F5, header `Set-Cookie`.
- Body HTML di blocco WAF (si registra solo `error` + status).
- Entity statement federativi se `--with-federation` esplode oltre una soglia (documentare nel manifest `skipped`).
