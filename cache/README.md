# Dump locale del Registro IT-Wallet

Questa cartella **non** si compila a mano. È scritta da `npm run dump` / dalla CD nightly.

- I file sotto `<host>/` sono i body REST **inalterati** (JWT del catalogo incluso).
- `manifest.json` è l’indice interno del tool (non è un well-known del Trust Anchor).

Vedi [docs/CACHE-AND-CI.md](../docs/CACHE-AND-CI.md).
