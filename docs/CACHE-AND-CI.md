# Cache, REST dump and CI/CD

## 1. Principle

Two copies of the same truth:

| Copy | Where | When |
|------|-------|------|
| **Repo dump** | `cache/` served by GitHub Pages | Nightly (and local dump) |
| **Browser cache** | Cache API + IndexedDB, same hierarchy | On startup, in the background |

REST bodies are saved **byte-for-byte** (JWT included). No pretty-print, no on-disk decode.

## 2. File hierarchy

URL `https://pre.ta.wallet.ipzs.it/.well-known/schemas` →

```text
cache/pre.ta.wallet.ipzs.it/.well-known/schemas
```

URL `https://pre.ta.wallet.ipzs.it/schemas/v1.3.3/mdl.cddl` →

```text
cache/pre.ta.wallet.ipzs.it/schemas/v1.3.3/mdl.cddl
```

No invented extension: if the well-known has no `.json`, the file is not named `.json`. The `manifest` keeps the `Content-Type`.

```text
cache/
  manifest.json          # alias of the pre dump (compatibility)
  manifest-pre.json      # pre-production index → https://pre.ta.wallet.ipzs.it
  manifest-prod.json     # production index → https://ta.wallet.ipzs.it
  README.md
  pre.ta.wallet.ipzs.it/
    .well-known/…
    schemas/v1.3.3/…
  ta.wallet.ipzs.it/
    .well-known/…
    schemas/v1.3.3/…
```

## 3. Dump indexes (`manifest.json`, `manifest-pre.json`, `manifest-prod.json`)

Internal schema (subject to `manifest_version` versioning):

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

The `tool` field is the crawler version **at dump time**, not necessarily the current `package.json` version. Do not rewrite dumps already in `cache/` by hand.

Besides `manifest.json` (default dump = `pre`), the script writes `manifest-pre.json` and `manifest-prod.json`. The UI loads the one for the chosen environment (`?env=pre|prod`).

Failed resources stay listed (`status` or `error`) so the board can offer Retry even when cold.

## 4. Behaviour of `scripts/dump-registry.mjs`

1. `GET {base}/.well-known/it-wallet-registry` with `Accept: application/json, application/jwt;q=0.9`.
2. Parse JSON (or JWT → payload).
3. For each `endpoints.*` of the data registries: GET, save raw; if JWT, decode only in RAM to discover further URIs.
4. Follow `schema_uri`.
5. Try `localization.base_uri` (may be WAF-blocked).
6. Optional: issuer `openid-credential-issuer` and issuer `openid-federation`, Trust Anchor federation.
7. Does not use `HEAD`.
8. `User-Agent: eid-wallet-it-attestations-registry-browser/<version in package.json> (+https://github.com/italia/eid-wallet-it-attestations-registry-browser)`.
9. Retry 3× on 429/5xx, backoff.
10. Writes `cache/manifest-{env}.json` and, if `env=pre`, also `cache/manifest.json`.
11. Records `duration_ms` for every GET (dump response times).

Flags: `--env pre|prod`, `--with-federation`, `--with-issuer-metadata`, `--dry-run`.

## 5. Browser cache

On startup:

1. Copy the Pages dump into Cache Storage (`itw-registry-dump`) if missing or if `manifest.generated_at` is newer.
2. Serve the UI from there.
3. Refresh: `fetch(url, { headers: { Accept: '…' } })`.
4. If ok and hash differs → IndexedDB `itw-registry-live` + `cache:updated` event.
5. If it fails → board row for that GET (endpoint, status, ms, type) + Retry.

IndexedDB key = absolute TA resource URL, not the Pages path.

## 6. Two CD pipelines

### A — Nightly cache (`.github/workflows/nightly-cache.yml`)

- Trigger: `schedule` (02:15 UTC) and `workflow_dispatch`.
- Job: checkout → Node 22 → `node scripts/dump-registry.mjs --env pre --with-issuer-metadata` and `node scripts/dump-registry.mjs --env prod --with-issuer-metadata` in separate steps.
- If `git diff -- cache` is not empty: commit `chore(cache): nightly dump YYYY-MM-DD` as `github-actions[bot]`.
- Does **not** run Vite. Responsibility: cache only.

### B — Pages from cache (`.github/workflows/pages.yml`)

- Trigger:
  - `push` on `cache/**`
  - `push` on `src/**`, `index.html`, `package.json`, `vite.config.js`, `public/**`
  - `workflow_dispatch`
  - completed `workflow_run` of nightly (if nightly could not push on the same ref, a later push still covers it)
- Job: `npm ci` → `npm run build` (`VITE_BASE=/eid-wallet-it-attestations-registry-browser/`) → `actions/upload-pages-artifact` + `actions/deploy-pages`.
- GitHub Pages MUST use **GitHub Actions** (not “Deploy from a branch” on the root: that would serve source `index.html` and `import 'qrcode'` fails in the browser).
- During the build, `cache/` is copied to `public/cache/` (`scripts/sync-cache-public.mjs` or `cp` in the workflow) so Vite emits it in `dist/cache/`.

Intended split: a broken dump does not require touching the app; a UI fix does not require re-downloading the TA.

## CORS and WAF

Observed in September 2026 on pre-production:

- Many TA well-knowns now send `Access-Control-Allow-Origin: *`, so **live browser refresh can succeed**.
- Some responses (e.g. discovery) send `Access-Control-Allow-Origin: *,*`, which browsers **reject** (invalid value). Then the live GET fails, the dump stays visible, the board shows Retry.
- `HEAD` → WAF HTML. `GET` only.
- Catalog: JOSE JWT, not JSON.
- Some `/l10n/` paths → `Request Rejected`.

Nightly (GitHub→TA, server side) is not subject to CORS. The repo dump remains the source of truth (F-03). Browser refresh (F-05) is best-effort into Cache API / IndexedDB.

When live HTTP requests fail this way, the explorer shows a page-level `alert alert-warning` (same pattern as [openid-federation-browser](https://github.com/italia/openid-federation-browser)): neither a CORS proxy nor a CORS-disabling add-on is active, so fetching may fail. **Read more** on this page. The dump remains usable without an add-on.

### CORS browser add-on (local troubleshooting)

If a live GET stays at status 0 / “Failed to fetch”, you can **temporarily** unlock reads from the Trust Anchor:

1. Install an extension such as **Allow CORS: Access-Control-Allow-Origin** (Chrome, Edge or Firefox).
2. Enable it **only for the test session**. Allow hosts `pre.ta.wallet.ipzs.it` and `ta.wallet.ipzs.it` (and `pre.issuer.wallet.ipzs.it` if needed).
3. Reload the explorer, open the board, press **Retry** on the failed row.
4. **Disable the extension** immediately afterwards: it rewrites CORS on every site.

This is not a production requirement and does not replace correct CORS on the TA. The app MUST keep working on the dump without an extension. A server-side proxy remains **out of scope** for v1.

## 8. What not to put in git

- Secrets, F5 cookies, `Set-Cookie` headers.
- WAF block HTML bodies (record only `error` + status).
- Federation entity statements if `--with-federation` explodes past a threshold (document in the manifest as `skipped`).
