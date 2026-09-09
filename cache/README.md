# Dump locale del Registro IT-Wallet

Questa cartella **non** si compila a mano. È scritta da `npm run dump` / dalla CD nightly.

- I file sotto `<host>/` sono i body REST **inalterati** (JWT del catalogo incluso).
- `manifest.json` è l’indice interno del dump di **collaudo** (compatibilità).
- `manifest-pre.json` / `manifest-prod.json` sono gli indici per ambiente (`pre` → `https://pre.ta.wallet.ipzs.it`, `prod` → `https://ta.wallet.ipzs.it`).

Vedi [docs/CACHE-AND-CI.md](../docs/CACHE-AND-CI.md).
