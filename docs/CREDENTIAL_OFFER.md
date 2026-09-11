# Credential Offer (QR e href)

Riferimenti ST IT-Wallet v1.4.6:

- `docs/it/credential-issuance-low-level.rst` — Flusso Credential Offer
- OpenID4VCI § 4 — `credential_offer` / `credential_offer_uri`
- OpenID4VC HAIP § 4.2 — schema `haip-vci://`

## 1. Cosa mostra il tool

Su ogni nodo `credential`:

1. **Link** `openid-credential-offer://?credential_offer=<urlencoded JSON>`
2. **Link alias** `haip-vci://?credential_offer=…` (stesso oggetto; le ST dicono che il Wallet MUST accettare entrambi)
3. **QR** con il payload dell’URI `openid-credential-offer://` (flusso cross-device)
4. **Form esemplificativo** per `objectId` e chiave pubblica, che può aggiungere `grants.authorization_code.issuer_state` come JWE

Non si usa `credential_offer_uri` (by reference): il tool non ospita un endpoint offer lato server.

## 2. Oggetto JSON (by value)

Senza chiave nel form (se l’utente cancella il campo):

```json
{
  "credential_issuer": "https://issuer.example.org",
  "credential_configuration_ids": ["dc_sd_jwt_mDL"],
  "grants": {
    "authorization_code": {}
  }
}
```

Di default il form è precompilato con la chiave RSA pubblica di demo (`demo/keys/issuer-state-enc.public.pem`). In quel caso `issuer_state` è un JWE compact (RSA-OAEP-256 / A256GCM) dell’URN ST.

| Campo ST | Comportamento explorer |
|----------|------------------------|
| `credential_issuer` | `issuers[].id` / `issuers[].entity_id` del catalogo. |
| `credential_configuration_ids` | Chiavi reali da `/.well-known/openid-credential-issuer` se dumpati (A-10). Altrimenti heuristica sotto, etichettata come **derivati**. |
| `grants.authorization_code` | Oggetto presente (MUST nelle ST). |
| `issuer_state` | **Omesso** se il campo chiave è vuoto. Altrimenti l’URN ST viene cifrato (RSA-OAEP-256 / A256GCM, JWE compact) e inserito qui. La chiave precompilata è quella **fittizia** pubblicata in [`demo/`](../demo/README.md), non la chiave PDND `GetAttributeClaims`. |
| `authorization_server` | Incluso solo se i metadati issuer hanno più `authorization_servers`. |

URN in chiaro (mostrato in UI, e di nuovo in chiaro se la JWE si decifra con la chiave privata di demo):

`urn:it-wallet:credential-offer:{as}:{dataset}[:{object}]`

`as` e `dataset` arrivano dai metadati issuer se presenti, altrimenti dal catalogo / registro FA. `object` è l’`objectId` del form (opzionale).

## 3. Heuristica `credential_configuration_ids`

Se non è disponibile `credential_configurations_supported`:

| format schema | id candidato |
|---------------|----------------|
| `dc+sd-jwt` | `dc_sd_jwt_<credential_type>` |
| `mso_mdoc` | `mso_mdoc_<credential_type>` |

L’UI MUST etichettare questi id come **derivati**. Quando il dump include i metadati issuer, gli id derivati si sostituiscono con le chiavi reali.

## 4. Universal Link

Le ST: se il Wallet pubblica `credential_offer_endpoint` HTTPS, SHOULD usarlo. L’explorer non sa quale Wallet l’utente ha installato. Quindi:

- href default = custom scheme
- SHOULD: copia anche un href `https://…` se l’utente incolla un `credential_offer_endpoint` in un campo opzionale (MAY v1.1)

## 5. QR

- Libreria `qrcode` livello errore `M`
- Testo alternativo: URI completo (non «QR code»)
- Colori: modulo su bianco, contrasto WCAG
- Download SVG/PNG MAY

## 6. Disclaimer obbligatorio (A-14)

Testo i18n accanto a QR/link:

> Credential offer generata dal catalogo. Senza issuer_state cifrato abilita solo la richiesta di una tipologia di credenziale dopo l'autenticazione (se elegibile). Il form sotto è esemplificativo: non usa la chiave PDND GetAttributeClaims.

## 7. Cosa non fare

- Non spacciare un JWE di esempio per uno `issuer_state` PDND valido.
- Non puntare `credential_offer_uri` a GitHub Pages fingendo un issuer.
- Non inserire dati personali nel JSON (l’`objectId` resta nell’origine browser).
- Non usare `openid://` (fuori ST).

## 8. Chiavi di demo e decifratura

Il repository pubblica materiale crittografico **fittizio** in [`demo/`](../demo/README.md) (stesso albero su GitHub: [`demo/keys/`](https://github.com/italia/eid-wallet-it-attestations-registry-browser/tree/main/demo/keys)):

- RSA-OAEP-256 / A256GCM per cifrare/decifrare `issuer_state`
- ES256 (P-256) per gli esempi SD-JWT VC; COSE_Sign1 ES256 per l’mdoc `DeviceResponse` (hex BINASCII + notazione diagnostica)

Per decifrare il JWE mostrato nella offer, da un clone:

```bash
node scripts/decrypt-issuer-state.mjs --jwe '<compact JWE>'
```

Lo script usa `demo/keys/issuer-state-enc.private.jwk.json`. L’UI mostra lo stesso comando e, se la chiave nel form è ancora quella di demo, anche l’URN in chiaro dopo un round-trip.
