# Contributing

1. Read [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding a framework.
2. Do not replace Bootstrap Italia / vanilla ESM with React or Vue without an explicit project decision.
3. Do not rewrite dump bodies in `cache/`; change only the crawler or the in-memory model.
4. Keep `it` and `en` locale files in sync.
5. New UI MUST remain keyboard-operable and have a non-canvas equivalent when it affects the graph.

## Scripts

```bash
npm run dump:pre
npm run dev
npm run build
```
