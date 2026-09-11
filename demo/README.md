# Demo cryptographic material

These keys are **fake**. They are published so the explorer can:

1. Pre-fill the credential-offer form and encrypt a sample `issuer_state` (RSA-OAEP-256 / A256GCM).
2. Sign a **demo SD-JWT VC** (`dc+sd-jwt`) with JSON disclosures and an example key-binding JWT (`kb+jwt`).
3. Sign a **demo mdoc** (`mso_mdoc`) as ISO 18013-5 `DeviceResponse` CBOR (`documents[].issuerSigned` + untagged COSE_Sign1). Shown as BINASCII hex and as CBOR diagnostic notation (`24(<< >>)`, `h'…'`). Claims follow the credential CDDL data model.
4. Fill `cnf.jwk` / mdoc `deviceKey` with the fake holder key. The holder **private** key signs the example KB-JWT.

Do **not** use them in production, with PDND `GetAttributeClaims`, or as a real Wallet/Issuer.

Fake issuer identifier used in examples:

`https://demo.issuer.wallet.example`

## Files

| File | Use |
|------|-----|
| `keys/issuer-state-enc.public.jwk.json` / `.pem` | Offer form default (encrypt `issuer_state`) |
| `keys/issuer-state-enc.private.jwk.json` / `.pem` | Decrypt the demo JWE |
| `keys/issuer-sign.public.jwk.json` / `.pem` | Verify demo credential signatures (`kid` `itw-demo-sig-1`) |
| `keys/issuer-sign.private.jwk.json` / `.pem` | Sign demo credentials in the browser |
| `keys/holder-cnf.public.jwk.json` / `.pem` | `cnf.jwk` in the example credential |
| `keys/holder-cnf.private.jwk.json` / `.pem` | Signs the example SD-JWT key-binding JWT |
| `jwks.json` | Public JWKS of the three keys above |

## Decrypt `issuer_state`

The explorer pre-loads the **public** encryption key. The compact JWE is in `grants.authorization_code.issuer_state`.

From a clone of this repository:

```bash
node scripts/decrypt-issuer-state.mjs --jwe '<paste compact JWE>'
```

That command uses `demo/keys/issuer-state-enc.private.jwk.json`. Equivalent with a PEM file:

```bash
node scripts/decrypt-issuer-state.mjs --key demo/keys/issuer-state-enc.private.pem --jwe '<JWE>'
```

The plaintext is the ST URN:

`urn:it-wallet:credential-offer:{as}:{dataset}[:{object}]`

OpenSSL is a poor fit for RSA-OAEP-256 + A256GCM compact JWE; use the Node script.

Regenerate (invalidates existing demo JWEs and signatures):

```bash
node scripts/generate-demo-keys.mjs
```
