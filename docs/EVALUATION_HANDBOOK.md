# Valutazione del *Manuale breve — Infrastruttura del Registro IT-Wallet*

Fonte valutata: `handbooks/it/credential-catalog/manuale-infrastruttura-registro-it-wallet.md` nel repository `eid-wallet-it-docs` (ST di riferimento **v1.4.6**, verifica sistemi live **3 settembre 2026**).

Questo documento dice cosa il manuale dà all’explorer e dove il tool deve andare oltre.

## Giudizio

Il manuale è una guida di lettura **efficace** per giuristi e tecnici amministrativi. Distingue con chiarezza:

- **cosa è** un attestato (`legal_type` nel Catalogo) da **come è fatto** (Registro degli Schemi);
- chi **decide i contenuti** (AgID / Organismo di Vigilanza) da chi **pubblica e firma** (Trust Anchor IPZS);
- metadati di sistema da dati dei cittadini.

Per un explorer grafico è la mappa concettuale giusta. Non è, e non pretende di essere, una specifica di API client: mancano CORS, negoziazione contenuto reale, WAF, paginazione e il mapping verso Credential Offer.

## Cosa adottare così com’è

| Punto del manuale | Impatto sul tool |
|-------------------|------------------|
| Porta unica `/.well-known/it-wallet-registry` | Radice del grafo e primo URL del dump. |
| Sei elenchi + federazione | Nodi di primo livello: Catalogo, Schemi, Claims, Fonti autentiche, Tassonomia. Federazione: dump opzionale. |
| `legal_type` solo nel Catalogo, su credenziale **e** su `issuers[]` | Facet di ricerca e attributi di nodo; mai cercarlo nello schema. |
| Valori `pub-eaa`, `qeaa`, `eaa` + caveat sul PID | Vocabolario dei filtri; il PID non va riqualificato come EAA. |
| Collegamento credenziale → issuer e → authentic source | Archi obbligatori del grafo (requisito utente). |
| `schema_uri` è la fonte di verità del path, non l’esempio ST `/.well-known/schemas/mdoc/mDL` | Il crawler segue gli URI dichiarati. |
| Produzione (3/9/2026) senza catalogo/schemi | Switch Ambiente `pre` / `prod` (F-12) e bacheca se 404; dump prod al 9/9/2026 è selezionabile. |
| `Accept` e filtri di rete | Il dump usa GET (mai HEAD: l’F5 risponde HTML 246 byte). |

## Scostamenti operativi rispetto al testo (rilevati il 9 settembre 2026)

Verifica da questo workspace verso `https://pre.ta.wallet.ipzs.it`.

1. **Catalogo JWT-only in collaudo.** `Accept: application/json` su `/.well-known/credential-catalog` restituisce `No acceptable representation`. Senza `Accept`, il body è un JWT JOSE (`typ: JOSE`, `cty: application/json`). Il dump deve salvare il JWT **così com’è**; l’UI lo decodifica. Il manuale invita a chiedere JSON: per il catalogo live non funziona.
2. **HEAD ingannevole.** `HEAD` sui well-known passa dal WAF (HTML). Solo `GET` è affidabile.
3. **Discovery JSON ok, catalogo no.** Lo stesso host negozia JSON sul discovery e JWT sul catalogo. Il crawler deve adattare `Accept` per risorsa, non globalmente.
4. **L10n `/.well-known/l10n/…`.** Alcuni path sono rifiutati dal WAF (`Request Rejected`). Il dump li tenta, registra l’errore nell’indice (`manifest-pre.json` / `manifest-prod.json`), non fallisce l’intero run.
5. **Etichetta schema `v1.3.3` vs ST v1.4.6.** Confermata dal manuale; il tool mostra la versione dichiarata dal registro, non la “corregge”.
6. **Paginazione.** Le ST dicono che le API dati DEVONO paginare. In collaudo gli elenchi sono well-known monolitici. Il crawler deve comunque seguire `next` / `links` se compaiono.
7. **Tabella “sei elenchi” vs federazione.** Il paragrafo 4 elenca anche la Federazione (settimo elenco). L’explorer grafico di v1 copre i cinque registri dati + discovery; la federazione è dump opzionale (`ITW_DUMP_FEDERATION`).

## Errori di lettura del manuale da non ripetere nel tool

Allineati al § 10 del manuale:

1. Non usare i path di esempio delle ST come URL reali.
2. Non assegnare `legal_type` a uno schema o a un claim.
3. Non unire Catalogo e Registro degli Schemi in un unico nodo “tipo”.
4. Non trattare PID, Pub-EAA e QEAA come sinonimi.
5. Non assumere che produzione abbia gli stessi well-known di collaudo.
6. Non interpretare una pagina HTML di blocco come «risorsa inesistente».

## Cosa il manuale non copre (e il tool deve)

- Motore di ricerca umano con `+`, `-`, `""` e facet HTML (`legal_type`, issuer, FA, claim).
- Switch collaudo/produzione con URL del Trust Anchor.
- Grafo verticale filtrato sui risultati.
- Cache browser vs dump di repo vs nightly CI (`manifest-pre.json` / `manifest-prod.json`).
- Bacheca: traccia di ogni GET (endpoint, status, tempo, application type) con retry.
- Credential Offer (QR/href) dalle ST di issuance, non dal registro.
- Accessibilità del grafo (equivalente tabellare) e header identico a `disco.html`.
- CORS: un’app su GitHub Pages **non può** rinfrescare il TA se manca `Access-Control-Allow-Origin`. Il dump CI è la fonte di verità; il refresh browser è best-effort.

## Conclusione per il progetto

Il manuale è la **fonte semantica** (vocabolario, gerarchia, ruoli, URL di collaudo). Le ST `registry.rst` e `credential-issuance-low-level.rst` sono la **fonte normativa** in caso di contrasto, come lo stesso manuale dichiara. L’explorer implementa il manuale per la navigazione e le ST per JWT, schemi, offer e metadati issuer.
