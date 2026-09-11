# Review of the *Short handbook — IT-Wallet Registry infrastructure*

Source reviewed: `handbooks/it/credential-catalog/manuale-infrastruttura-registro-it-wallet.md` in the `eid-wallet-it-docs` repository (Technical Specifications **v1.4.6**, live systems check **3 September 2026**).

This document says what the handbook gives the explorer and where the tool must go further.

## Judgement

The handbook is an **effective** reading guide for lawyers and administrative technicians. It clearly distinguishes:

- **what** an attestation is (`legal_type` in the Catalog) from **how it is built** (Schema Registry);
- who **decides contents** (AgID / Supervisory Body) from who **publishes and signs** (IPZS Trust Anchor);
- system metadata from citizen data.

For a graph explorer it is the right conceptual map. It is not, and does not claim to be, a client API specification: CORS, real content negotiation, WAF, pagination and mapping to Credential Offer are missing.

## What to adopt as-is

| Handbook point | Impact on the tool |
|----------------|--------------------|
| Single door `/.well-known/it-wallet-registry` | Graph root and first dump URL. |
| Six lists + federation | First-level nodes: Catalog, Schemas, Claims, Authentic sources, Taxonomy. Federation: optional dump. |
| `legal_type` only in the Catalog, on the credential **and** on `issuers[]` | Search facets and node attributes; never look for it in the schema. |
| Values `pub-eaa`, `qeaa`, `eaa` + PID caveat | Filter vocabulary; PID must not be reclassified as EAA. |
| Credential → issuer and → authentic source links | Mandatory graph edges (user requirement). |
| `schema_uri` is the path source of truth, not the ST example `/.well-known/schemas/mdoc/mDL` | The crawler follows declared URIs. |
| Production (3/9/2026) without catalog/schemas | Environment switch `pre` / `prod` (F-12) and board on 404; prod dump as of 9/9/2026 is selectable. |
| `Accept` and network filters | The dump uses GET (never HEAD: F5 answers 246 bytes of HTML). |

## Operational gaps versus the text (observed 9 September 2026)

Check from this workspace against `https://pre.ta.wallet.ipzs.it`.

1. **JWT-only catalog in pre-production.** `Accept: application/json` on `/.well-known/credential-catalog` returns `No acceptable representation`. With no `Accept`, the body is a JOSE JWT (`typ: JOSE`, `cty: application/json`). The dump MUST save the JWT **as-is**; the UI decodes it. The handbook invites asking for JSON: that does not work for the live catalog.
2. **Misleading HEAD.** `HEAD` on well-knowns goes through the WAF (HTML). Only `GET` is reliable.
3. **Discovery JSON ok, catalog not.** The same host negotiates JSON on discovery and JWT on the catalog. The crawler MUST adapt `Accept` per resource, not globally.
4. **L10n `/.well-known/l10n/…`.** Some paths are rejected by the WAF (`Request Rejected`). The dump tries them, records the error in the index (`manifest-pre.json` / `manifest-prod.json`), and does not fail the whole run.
5. **Schema label `v1.3.3` vs ST v1.4.6.** Confirmed by the handbook; the tool shows the version declared by the registry, it does not “correct” it.
6. **Pagination.** The specifications say data APIs MUST paginate. In pre-production the lists are monolithic well-knowns. The crawler MUST still follow `next` / `links` if they appear.
7. **“Six lists” table vs federation.** Paragraph 4 also lists Federation (seventh list). The v1 graph explorer covers the five data registries + discovery; federation is an optional dump (`ITW_DUMP_FEDERATION`).

## Handbook misreadings not to repeat in the tool

Aligned with handbook § 10:

1. Do not use ST example paths as real URLs.
2. Do not assign `legal_type` to a schema or a claim.
3. Do not merge Catalog and Schema Registry into a single “type” node.
4. Do not treat PID, Pub-EAA and QEAA as synonyms.
5. Do not assume production has the same well-knowns as pre-production.
6. Do not interpret a WAF HTML block page as “resource missing”.

## What the handbook does not cover (and the tool must)

- Human search engine with `+`, `-`, `""` and HTML facets (`legal_type`, issuer, authentic source, claim).
- Pre-production/production switch with Trust Anchor URL.
- Vertical graph filtered by results.
- Browser cache vs repo dump vs nightly CI (`manifest-pre.json` / `manifest-prod.json`).
- Board: trace of every GET (endpoint, status, time, application type) with retry.
- Credential Offer (QR/href) from the issuance specifications, not from the registry.
- Graph accessibility (tabular equivalent) and header identical to `disco.html`.
- CORS: a GitHub Pages app **cannot** refresh the TA if a valid `Access-Control-Allow-Origin` is missing. The CI dump is the source of truth; browser refresh is best-effort. The UI warns with an openid-federation-browser-style banner and links to [CACHE-AND-CI.md](CACHE-AND-CI.md#cors-and-waf).

## Conclusion for the project

The handbook is the **semantic source** (vocabulary, hierarchy, roles, pre-production URLs). The `registry.rst` and `credential-issuance-low-level.rst` specifications are the **normative source** in case of conflict, as the handbook itself states. The explorer implements the handbook for navigation and the specifications for JWT, schemas, offer and issuer metadata.
