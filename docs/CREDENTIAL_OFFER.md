# Credential Offer (QR and href)

IT-Wallet Technical Specifications v1.4.6:

- `docs/it/credential-issuance-low-level.rst` — Credential Offer flow
- OpenID4VCI § 4 — `credential_offer` / `credential_offer_uri`
- OpenID4VC HAIP § 4.2 — `haip-vci://` scheme

## 1. What the tool shows

On every `credential` node:

1. **Link** `openid-credential-offer://?credential_offer=<urlencoded JSON>`
2. **Alias link** `haip-vci://?credential_offer=…` (same object; the specifications say the Wallet MUST accept both). The alias MAY be visually hidden; the primary href and QR remain.
3. **QR** with the `openid-credential-offer://` URI payload (cross-device flow)
4. **Example form** for `objectId` and public key, which can add `grants.authorization_code.issuer_state` as a JWE

`credential_offer_uri` (by reference) is not used: the tool does not host a server-side offer endpoint.

## 2. JSON object (by value)

With the key field cleared:

```json
{
  "credential_issuer": "https://issuer.example.org",
  "credential_configuration_ids": ["dc_sd_jwt_mDL"],
  "grants": {
    "authorization_code": {}
  }
}
```

By default the form is pre-filled with the demo RSA public key (`demo/keys/issuer-state-enc.public.pem`). Then `issuer_state` is a compact JWE (RSA-OAEP-256 / A256GCM) of the ST URN.

| ST field | Explorer behaviour |
|----------|--------------------|
| `credential_issuer` | Catalog `issuers[].id` / `issuers[].entity_id`. |
| `credential_configuration_ids` | Real keys from `/.well-known/openid-credential-issuer` if dumped (A-10). Otherwise the heuristic below, labelled **derived**. |
| `grants.authorization_code` | Object present (MUST in the specifications). |
| `issuer_state` | **Omitted** if the key field is empty. Otherwise the ST URN is encrypted (RSA-OAEP-256 / A256GCM, compact JWE) and inserted here. The pre-filled key is the **fake** one published in [`demo/`](../demo/README.md), not the PDND `GetAttributeClaims` key. |
| `authorization_server` | Included only if issuer metadata has more than one `authorization_servers` entry. |

Plaintext URN (shown in the UI, and again in the clear if the JWE is decrypted with the demo private key):

`urn:it-wallet:credential-offer:{as}:{dataset}[:{object}]`

`as` and `dataset` come from issuer metadata if present, otherwise from the catalog / authentic-source registry. `object` is the form `objectId` (optional).

## 3. `credential_configuration_ids` heuristic

If `credential_configurations_supported` is missing:

| schema format | candidate id |
|---------------|----------------|
| `dc+sd-jwt` | `dc_sd_jwt_<credential_type>` |
| `mso_mdoc` | `mso_mdoc_<credential_type>` |

The UI MUST label these ids as **derived**. When the dump includes issuer metadata, derived ids are replaced with the real keys.

## 4. Universal Link

Specifications: if the Wallet publishes an HTTPS `credential_offer_endpoint`, it SHOULD be used. The explorer does not know which Wallet the user installed. Therefore:

- default href = custom scheme
- SHOULD: also copy an `https://…` href if the user pastes a `credential_offer_endpoint` in an optional field (MAY v1.1)

## 5. QR

- `qrcode` library, error level `M`
- Alternative text: full URI (not “QR code”)
- Colours: module on white, WCAG contrast
- SVG/PNG download MAY

## 6. Required disclaimer (A-14)

i18n text next to QR/link:

> Credential offer generated from the catalog. Without an encrypted issuer_state it only enables a request for a credential type after authentication (if eligible). The form below is an example: it does not use the PDND GetAttributeClaims key.

## 7. What not to do

- Do not present an example JWE as a valid PDND `issuer_state`.
- Do not point `credential_offer_uri` at GitHub Pages pretending to be an issuer.
- Do not put personal data in the JSON (`objectId` stays in the browser origin).
- Do not use `openid://` (outside the specifications).

## 8. Demo keys and decryption

The repository publishes **fake** cryptographic material in [`demo/`](../demo/README.md) (same tree on GitHub: [`demo/keys/`](https://github.com/italia/eid-wallet-it-attestations-registry-browser/tree/main/demo/keys)):

- RSA-OAEP-256 / A256GCM to encrypt/decrypt `issuer_state`
- ES256 (P-256) for demo SD-JWT VC; COSE_Sign1 ES256 for the mdoc `DeviceResponse` (BINASCII hex + diagnostic notation)

To decrypt the JWE shown in the offer, from a clone:

```bash
node scripts/decrypt-issuer-state.mjs --jwe '<compact JWE>'
```

The script uses `demo/keys/issuer-state-enc.private.jwk.json`. The UI shows the same command and, if the form key is still the demo key, the plaintext URN after a round-trip.
