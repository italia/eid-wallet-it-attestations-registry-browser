# Local dump of the IT-Wallet Registry

Do **not** edit this folder by hand. It is written by `npm run dump` / the nightly CD.

- Files under `<host>/` are **unaltered** REST bodies (including the catalog JWT).
- `manifest.json` is the internal index of the **pre-production** dump (compatibility alias).
- `manifest-pre.json` / `manifest-prod.json` are per-environment indexes (`pre` → `https://pre.ta.wallet.ipzs.it`, `prod` → `https://ta.wallet.ipzs.it`).

See [docs/CACHE-AND-CI.md](../docs/CACHE-AND-CI.md).
