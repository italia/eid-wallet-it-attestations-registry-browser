# Credential Offer (QR e href)

Riferimenti ST IT-Wallet v1.4.6:

- `docs/it/credential-issuance-low-level.rst` — Flusso Credential Offer
- OpenID4VCI § 4 — `credential_offer` / `credential_offer_uri`
- OpenID4VC HAIP § 4.2 — schema `haip-vci://`

## 1. Cosa mostra il tool

Su ogni nodo `credential` (e sul dettaglio issuer, se c’è un solo issuer):

1. **Link** `openid-credential-offer://?credential_offer=<urlencoded JSON>`
2. **Link alias** `haip-vci://?credential_offer=…` (stesso oggetto; le ST dicono che il Wallet MUST accettare entrambi)
3. **QR** con il payload dell’URI `openid-credential-offer://` (flusso cross-device)

Non si usa `credential_offer_uri` (by reference): il tool non ospita un endpoint offer lato server.

## 2. Oggetto JSON (by value)

```json
{
  "credential_issuer": "https://issuer.example.org",
  "credential_configuration_ids": ["dc_sd_jwt_mDL"],
  "grants": {
    "authorization_code": {}
  }
}
```

| Campo ST | Comportamento explorer |
|----------|------------------------|
| `credential_issuer` | `issuers[].entity_id` del catalogo. Se più issuer: un’offer per issuer (tab o select). |
| `credential_configuration_ids` | Da metadati OpenID4VCI dell’issuer se dumpati (A-10); altrimenti heuristica documentata sotto. |
| `grants.authorization_code` | Oggetto presente (MUST nelle ST). |
| `issuer_state` | **Omesso**. Le ST lo richiedono cifrato con chiave PDND `GetAttributeClaims` nella forma `urn:it-wallet:credential-offer:{as}:{dataset}[:{object}]`. Questo tool non è Consumer PDND e non deve fingere uno state valido. |
| `authorization_server` | Incluso solo se i metadati issuer hanno più `authorization_servers`. |

## 3. Heuristica `credential_configuration_ids` (finché manca il metadata dump)

Se non è disponibile `credential_configurations_supported`:

| format schema | id candidato |
|---------------|----------------|
| `dc+sd-jwt` | `dc_sd_jwt_<credential_type>` |
| `mso_mdoc` | `mso_mdoc_<credential_type>` |

L’UI MUST etichettare questi id come **derivati**, non come valore firmato dal TA. Quando A-10 è soddisfatto, gli id derivati si sostituiscono con le chiavi reali.

## 4. Universal Link

Le ST: se il Wallet pubblica `credential_offer_endpoint` HTTPS, SHOULD usarlo. L’explorer non sa quale Wallet l’utente ha installato (non c’è Selection Page di produzione nel tool). Quindi:

- href default = custom scheme (funziona senza discovery wallet)
- SHOULD: copia anche un href `https://…` se l’utente incolla un `credential_offer_endpoint` in un campo opzionale (MAY v1.1)

## 5. QR

- Libreria `qrcode` livello errore `M`
- Testo alternativo: URI completo (non «QR code»)
- Colori: modulo su bianco, contrasto WCAG
- Download SVG/PNG MAY

Riuso possibile del web component `official_resources/shared-ui/js/qrcode/qr-code.js` se si vendorano gli asset.

## 6. Disclaimer obbligatorio (A-14)

Testo i18n accanto a QR/link:

> Offerta di discovery generata dal catalogo. Non avvia un’emissione certificata: manca `issuer_state` PDND. Per ottenere l’attestato usare i canali dell’emittente.

## 7. Cosa non fare

- Non cifrare URN fittizi.
- Non puntare `credential_offer_uri` a GitHub Pages fingendo un issuer.
- Non inserire dati personali nel JSON.
- Non usare `openid://` (fuori ST).
