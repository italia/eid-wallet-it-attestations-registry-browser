import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRegistryGraph, facetOptions, visibleClosure } from '../../src/js/graph/model.js';
import { getQueryField, matchedNodeIds, parseQuery, quoteFieldValue, searchDocuments, setQueryField, understoodQuery } from '../../src/js/search/index.js';
import { kindIconId } from '../../src/js/results/kind-icon.js';
import { checkSri, decodeJwt, parseRegistryBody, sha256Sri, verifyJwt } from '../../src/js/cache/jwt.js';
import { loadDump, timedFetch } from '../../src/js/cache/loader.js';
import { isCorsFailure } from '../../src/js/cache/browser.js';
import { resolveRegistryEnv } from '../../src/js/cache/environments.js';
import {
  artifactsForNode,
  compareIssuerWellKnown,
  formatArtifactView,
  issuerMetadataArtifactsForCredential,
  issuerWellKnownGroupsForCredential,
} from '../../src/js/artifacts/artifacts.js';
import { jsonPreview, tryParseJson } from '../../src/js/artifacts/json-tree.js';
import { configurationIdsFor, credentialOfferHref, credentialOfferObject, decryptIssuerState, encryptIssuerState, issuerStateUrn } from '../../src/js/offer/offer.js';
import { demoEncPrivateJwkText, demoEncPublicJwkText } from '../../src/js/demo/material.js';
import { demoCardModels, isCssColor, pickLocalizedDisplay } from '../../src/js/demo/card.js';
import { buildDemoCredential, buildDemoCredentials, claimsFromCddl, exampleFromSchema } from '../../src/js/demo/example.js';
import { encodeCbor, toCborDiag } from '../../src/js/demo/cbor.js';
import { parseCddlMdoc } from '../../src/js/demo/mdoc.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDumpFromDisk } from '../helpers/dump.js';

describe('JWT catalog', () => {
  it('decodes the dumped credential catalog', () => {
    const dump = loadDumpFromDisk();
    assert.equal(dump.catalog.credentials.length, 10);
    assert.ok(dump.catalog.credentials.every((c) => c.legal_type === 'pub-eaa'));
  });

  it('parses compact JOSE', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ credentials: [] })).toString('base64url');
    const decoded = decodeJwt(`${header}.${payload}.sig`);
    assert.deepEqual(decoded.payload, { credentials: [] });
    const parsed = parseRegistryBody(`${header}.${payload}.sig`);
    assert.equal(parsed.jwt, true);
    assert.ok(parsed.raw.startsWith(header));
    assert.equal(parsed.header.alg, 'ES256');
  });

  it('verifies ES256 with a JWKS key', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    jwk.kid = 'test-kid';
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'test-kid' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ credentials: [] })).toString('base64url');
    const data = new TextEncoder().encode(`${header}.${payload}`);
    const sig = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, data)).toString(
      'base64url',
    );
    const token = `${header}.${payload}.${sig}`;
    const result = await verifyJwt(token, [jwk]);
    assert.equal(result.ok, true);
    const bad = await verifyJwt(`${header}.${payload}.AAAA`, [jwk]);
    assert.equal(bad.ok, false);
  });

  it('checks SRI sha256 integrity', async () => {
    const body = '{"ok":true}';
    const sri = await sha256Sri(body);
    const ok = await checkSri(body, sri);
    assert.equal(ok.ok, true);
    const bad = await checkSri(body, 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'integrity mismatch');
  });
});

describe('artifacts', () => {
  const dump = loadDumpFromDisk();
  const graph = buildRegistryGraph(dump, { lang: 'it' });

  it('shows signed catalog JWT, plaintext excerpt and data-model schema for a credential', () => {
    const arts = artifactsForNode(graph.byId.get('credential:mDL'), dump);
    assert.ok(arts.length >= 2);
    assert.equal(arts[0].jwt, true);
    assert.match(arts[0].raw, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./);
    assert.ok(arts[0].header?.alg);
    assert.equal(arts[0].excerpt.credential_type, 'mDL');
    assert.match(formatArtifactView(arts[0], 'header'), /alg/);
    assert.match(formatArtifactView(arts[0], 'excerpt'), /"credential_type": "mDL"/);
    assert.equal(tryParseJson(arts[0].excerpt).ok, true);
    assert.match(jsonPreview(arts[0].excerpt.issuers || []), /^\[/);
    assert.equal(tryParseJson('not-json').ok, false);
    assert.ok(arts.some((a) => String(a.title).includes('data-model')));
    assert.ok(arts.some((a) => a.title === 'openid-credential-issuer'));
    assert.ok(arts.some((a) => a.title === 'openid-federation'));
  });

  it('shows dumped OpenID4VCI well-knowns on an issuer node', () => {
    const issuer = graph.nodes.find((n) => n.kind === 'issuer' && n.entity_id === 'https://pre.issuer.wallet.ipzs.it');
    const arts = artifactsForNode(issuer, dump);
    assert.ok(arts.some((a) => a.title === 'credential-catalog'));
    assert.ok(arts.some((a) => a.title === 'openid-credential-issuer' && a.raw));
    assert.ok(arts.some((a) => a.title === 'openid-federation' && a.jwt));
  });

  it('shows schema file for a schema node', () => {
    const schema = graph.nodes.find((n) => n.kind === 'schema' && n.credential_type === 'mDL' && String(n.schema_uri || '').endsWith('.json'));
    const arts = artifactsForNode(schema, dump);
    assert.ok(arts.some((a) => a.excerpt?.credential_type === 'mDL'));
    assert.ok(arts.some((a) => a.path?.includes('mdl.json') && a.raw));
  });

  it('shows JSON OpenID4VCI issuer metadata and mDL configuration excerpt', () => {
    const arts = issuerMetadataArtifactsForCredential(graph.byId.get('credential:mDL'), dump);
    assert.equal(arts.length, 2);
    assert.equal(arts[0].title, 'openid-credential-issuer');
    assert.equal(arts[0].jwt, false);
    assert.equal(arts[0].url, 'https://pre.issuer.wallet.ipzs.it/.well-known/openid-credential-issuer');
    assert.match(arts[0].raw, /"credential_issuer"/);
    assert.equal(arts[0].payload.credential_issuer, 'https://pre.issuer.wallet.ipzs.it');
    assert.ok(arts[0].excerpt.dc_sd_jwt_mDL);
    assert.ok(arts[0].excerpt.mso_mdoc_mDL);
    assert.equal(arts[0].excerpt.dc_sd_jwt_mDL.format, 'dc+sd-jwt');
    assert.match(formatArtifactView(arts[0], 'excerpt'), /"dc_sd_jwt_mDL"/);
    assert.doesNotMatch(formatArtifactView(arts[0], 'excerpt'), /dc_sd_jwt_pid/);
    assert.equal(arts[1].title, 'openid-federation');
    assert.equal(arts[1].jwt, true);
    assert.equal(arts[1].url, 'https://pre.issuer.wallet.ipzs.it/.well-known/openid-federation');
    assert.equal(arts[1].payload.iss, 'https://pre.issuer.wallet.ipzs.it');
    assert.ok(arts[1].payload.metadata.openid_credential_issuer);
    assert.ok(arts[1].excerpt.dc_sd_jwt_mDL);
  });

  it('shows signed issuer metadata JWT, federation entity and pid configuration excerpt', () => {
    const arts = issuerMetadataArtifactsForCredential(graph.byId.get('credential:pid'), dump);
    assert.equal(arts.length, 2);
    assert.equal(arts[0].jwt, true);
    assert.equal(arts[0].url, 'https://pre.eid.wallet.ipzs.it/1-3/.well-known/openid-credential-issuer');
    assert.match(arts[0].raw, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./);
    assert.ok(arts[0].header?.alg);
    assert.equal(arts[0].payload.credential_issuer, 'https://pre.eid.wallet.ipzs.it/1-3');
    assert.ok(arts[0].excerpt.dc_sd_jwt_pid);
    assert.equal(arts[0].excerpt.dc_sd_jwt_pid.scope, 'pid');
    assert.match(formatArtifactView(arts[0], 'header'), /alg/);
    assert.match(formatArtifactView(arts[0], 'payload'), /credential_configurations_supported/);
    assert.equal(arts[1].title, 'openid-federation');
    assert.equal(arts[1].url, 'https://pre.eid.wallet.ipzs.it/1-3/.well-known/openid-federation');
    assert.equal(arts[1].payload.sub, 'https://pre.eid.wallet.ipzs.it/1-3');
    assert.ok(arts[1].excerpt.dc_sd_jwt_pid);
  });

  it('does not flag aligned openid-credential-issuer and openid-federation', () => {
    const groups = issuerWellKnownGroupsForCredential(graph.byId.get('credential:mDL'), dump);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].mismatches.length, 0);
    const pid = issuerWellKnownGroupsForCredential(graph.byId.get('credential:pid'), dump);
    assert.equal(pid[0].mismatches.length, 0);
  });

  it('flags when openid-credential-issuer and openid-federation metadata diverge', () => {
    const iss = 'https://pre.issuer.wallet.ipzs.it';
    const mutated = {
      ...dump,
      issuerFederation: {
        ...dump.issuerFederation,
        [iss]: {
          ...dump.issuerFederation[iss],
          metadata: {
            ...dump.issuerFederation[iss].metadata,
            openid_credential_issuer: {
              ...dump.issuerFederation[iss].metadata.openid_credential_issuer,
              credential_endpoint: 'https://evil.example/credential',
            },
          },
        },
      },
    };
    const groups = issuerWellKnownGroupsForCredential(graph.byId.get('credential:mDL'), mutated);
    assert.ok(groups[0].mismatches.some((m) => m.path === 'credential_endpoint' && m.code === 'field'));
    const missingFed = compareIssuerWellKnown(dump.issuerMetadata[iss], null, {
      ociUrl: `${iss}/.well-known/openid-credential-issuer`,
      fedUrl: `${iss}/.well-known/openid-federation`,
    });
    assert.ok(missingFed.some((m) => m.code === 'missing-federation'));
  });
});

describe('graph model', () => {
  const graph = buildRegistryGraph(loadDumpFromDisk(), { lang: 'it' });

  it('roots the hierarchy at IT-Wallet Registry', () => {
    assert.ok(graph.byId.get('registry'));
    for (const id of ['catalog', 'schemas', 'claims', 'authentic_sources', 'taxonomy']) {
      assert.ok(graph.edges.some((e) => e.source === 'registry' && e.target === id));
    }
  });

  it('links credentials to issuers and authentic sources', () => {
    assert.equal(graph.nodes.filter((n) => n.kind === 'credential').length, 10);
    assert.ok(graph.byId.get('credential:mDL'));
    assert.ok(graph.edges.some((e) => e.source === 'credential:mDL' && e.target.startsWith('issuer:') && e.relation === 'issued-by'));
    assert.ok(graph.edges.some((e) => e.source === 'credential:mDL' && e.target === 'as:https://www.mit.gov.it'));
    assert.ok(graph.nodes.some((n) => n.kind === 'schema' && n.credential_type === 'mDL'));
  });

  it('exposes dump examples for legal_type, issuer, authentic source and claims', () => {
    const facets = facetOptions(graph);
    assert.deepEqual(facets.legalTypes.map((o) => o.value), ['pub-eaa', 'qeaa', 'eaa']);
    assert.ok(facets.issuers.length > 0);
    assert.ok(facets.sources.length > 0);
    assert.ok(facets.claims.length > 0);
    assert.ok(facets.sources.some((s) => /mit\.gov\.it/i.test(s.value)));
  });

  it('uses Italian catalog labels', () => {
    assert.match(graph.byId.get('credential:mDL').label, /patente|mDL|guida/i);
  });
});

describe('search', () => {
  const graph = buildRegistryGraph(loadDumpFromDisk(), { lang: 'it' });

  it('parses lucene-lite tokens', () => {
    const parsed = parseQuery('+mDL legal_type:pub-eaa -pid "tessera sanitaria"');
    assert.equal(parsed.empty, false);
    assert.ok(parsed.tokens.some((t) => t.sign === '+' && t.value === 'mDL'));
    assert.ok(parsed.tokens.some((t) => t.kind === 'field' && t.field === 'legal_type'));
    assert.ok(parsed.tokens.some((t) => t.sign === '-' && t.value === 'pid'));
    assert.ok(parsed.tokens.some((t) => t.kind === 'phrase'));
  });

  it('parses quoted field values used by facet selects', () => {
    const parsed = parseQuery('issuer:"https://pre.issuer.wallet.ipzs.it" as:"https://www.mit.gov.it"');
    assert.equal(getQueryField('issuer:"https://pre.issuer.wallet.ipzs.it"', 'issuer'), 'https://pre.issuer.wallet.ipzs.it');
    assert.ok(parsed.tokens.some((t) => t.kind === 'field' && t.field === 'issuer' && t.value.includes('pre.issuer')));
    assert.ok(parsed.tokens.some((t) => t.kind === 'field' && t.field === 'as' && t.value.includes('mit.gov.it')));
  });

  it('writes facet tokens into the query string', () => {
    assert.equal(setQueryField('+mDL', 'legal_type', 'pub-eaa'), '+mDL legal_type:pub-eaa');
    assert.equal(setQueryField('legal_type:eaa +mDL', 'legal_type', 'pub-eaa'), '+mDL legal_type:pub-eaa');
    const withIssuer = setQueryField('', 'issuer', 'https://pre.issuer.wallet.ipzs.it');
    assert.equal(withIssuer, `issuer:${quoteFieldValue('https://pre.issuer.wallet.ipzs.it')}`);
    assert.equal(setQueryField(withIssuer, 'issuer', ''), '');
  });

  it('filters +mDL -pid and keeps hierarchical closure', () => {
    const query = '+mDL -pid';
    const hits = searchDocuments(graph.documents, query);
    assert.ok(hits.some((d) => d.id === 'credential:mDL'));
    assert.ok(!hits.some((d) => d.id === 'credential:pid'));
    const vis = visibleClosure(graph, matchedNodeIds(graph, query));
    assert.ok(vis.has('registry'));
    assert.ok(vis.has('catalog'));
    assert.ok(vis.has('credential:mDL'));
    assert.ok(vis.has('as:https://www.mit.gov.it'));
    assert.ok(!vis.has('credential:pid'));
  });

  it('matches credentials by issuer, authentic source and claim', () => {
    const mdl = graph.documents.find((d) => d.id === 'credential:mDL');
    assert.ok(mdl.issuer);
    assert.ok(mdl.as);
    assert.ok(mdl.claim);
    const issuerHits = searchDocuments(graph.documents, `issuer:${quoteFieldValue(mdl.issuer.split(' ')[0])}`);
    assert.ok(issuerHits.some((d) => d.id === 'credential:mDL'));
    const asValue = mdl.as.split(' ')[0];
    const asHits = searchDocuments(graph.documents, `as:${quoteFieldValue(asValue)}`);
    assert.ok(asHits.some((d) => d.id === 'credential:mDL'));
    const claimName = mdl.claim.split(' ')[0];
    const claimHits = searchDocuments(graph.documents, `claim:${claimName}`);
    assert.ok(claimHits.some((d) => d.id === 'credential:mDL'));
  });

  it('supports OR, grouping, wildcards and boost', () => {
    const orHits = searchDocuments(graph.documents, 'mDL OR pid');
    assert.ok(orHits.some((d) => d.id === 'credential:mDL'));
    assert.ok(orHits.some((d) => d.id === 'credential:pid'));
    const grouped = searchDocuments(graph.documents, '(mDL OR pid) -av');
    assert.ok(grouped.some((d) => d.id === 'credential:mDL'));
    assert.ok(!grouped.some((d) => d.id === 'credential:av'));
    const wild = searchDocuments(graph.documents, 'education*');
    assert.ok(wild.some((d) => d.id === 'credential:education_degree'));
    const qmark = searchDocuments(graph.documents, 'm?L');
    assert.ok(qmark.some((d) => d.id === 'credential:mDL'));
    const boosted = searchDocuments(graph.documents, 'mDL^5 OR pid').filter((d) => d.kind === 'credential');
    assert.equal(boosted[0].id, 'credential:mDL');
    const parsed = parseQuery('legal_type:pub-eaa +mDL');
    assert.match(understoodQuery('+mDL -pid', 'it'), /Interpretata/);
    assert.ok(parsed.tokens.some((t) => t.kind === 'field'));
  });

  it('maps result kinds to Bootstrap Italia icons', () => {
    assert.equal(kindIconId('credential'), 'it-card');
    assert.equal(kindIconId('issuer'), 'it-pa');
    assert.equal(kindIconId('authentic_source'), 'it-inbox');
    assert.equal(kindIconId('schema'), 'it-file');
    assert.equal(kindIconId('claim'), 'it-list');
    assert.equal(kindIconId('domain'), 'it-folder');
    assert.equal(kindIconId('class'), 'it-bookmark');
    assert.equal(kindIconId('unknown'), 'it-file');
  });
});

describe('registry environments', () => {
  it('maps preprod and prod aliases to Trust Anchor URLs', () => {
    assert.equal(resolveRegistryEnv('preprod').id, 'pre');
    assert.equal(resolveRegistryEnv('pre').baseUrl, 'https://pre.ta.wallet.ipzs.it');
    assert.equal(resolveRegistryEnv('prod').id, 'prod');
    assert.equal(resolveRegistryEnv('produzione').baseUrl, 'https://ta.wallet.ipzs.it');
  });
});

describe('http traces', () => {
  it('records endpoint, status, duration and application type', async () => {
    const fetchFn = async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => (url.includes('catalog') ? 'application/jose;charset=UTF-8' : 'application/json') },
      text: async () => (url.includes('catalog') ? '{"credentials":[]}' : '{"ok":true}'),
    });
    const result = await timedFetch('https://pre.ta.wallet.ipzs.it/.well-known/it-wallet-registry', fetchFn);
    assert.equal(result.http.method, 'GET');
    assert.equal(result.http.status, 200);
    assert.equal(result.http.ok, true);
    assert.equal(typeof result.http.durationMs, 'number');
    assert.equal(result.http.applicationType, 'application/json');

    const dump = await loadDump(
      {
        resources: [
          {
            url: 'https://pre.ta.wallet.ipzs.it/.well-known/credential-catalog',
            path: 'pre.ta.wallet.ipzs.it/.well-known/credential-catalog',
            content_type: 'application/jose;charset=UTF-8',
            status: 200,
          },
        ],
      },
      { fetchFn, httpCalls: [result.http] },
    );
    assert.equal(dump.httpCalls.length, 2);
    const catalog = dump.httpCalls[1];
    assert.equal(catalog.endpoint, 'https://pre.ta.wallet.ipzs.it/.well-known/credential-catalog');
    assert.equal(catalog.status, 200);
    assert.equal(catalog.applicationType, 'application/jose');
    assert.ok(catalog.durationMs >= 0);
  });
});

describe('CORS live faults', () => {
  it('treats status 0 Failed to fetch as a CORS failure', () => {
    assert.equal(isCorsFailure({ ok: false, status: 0, error: 'Failed to fetch' }), true);
    assert.equal(isCorsFailure({ ok: false, status: 0, error: 'Load failed' }), true);
    assert.equal(isCorsFailure({ ok: false, status: 403, error: 'HTTP 403' }), false);
    assert.equal(isCorsFailure({ ok: true, status: 200, error: null }), false);
  });
});

describe('credential offer', () => {
  it('builds OpenID4VCI by-value href without issuer_state', () => {
    const href = credentialOfferHref({
      credentialIssuer: 'https://pre.issuer.wallet.ipzs.it',
      configurationIds: configurationIdsFor('mDL', ['dc+sd-jwt', 'mso_mdoc']).ids,
    });
    assert.match(href, /^openid-credential-offer:\/\/\?credential_offer=/);
    const json = JSON.parse(decodeURIComponent(href.split('credential_offer=')[1]));
    assert.equal(json.credential_issuer, 'https://pre.issuer.wallet.ipzs.it');
    assert.deepEqual(json.credential_configuration_ids, ['dc_sd_jwt_mDL', 'mso_mdoc_mDL']);
    assert.ok(json.grants.authorization_code);
    assert.equal(json.grants.authorization_code.issuer_state, undefined);
  });

  it('prefers OpenID4VCI metadata configuration ids when present', () => {
    const meta = {
      credential_configurations_supported: {
        dc_sd_jwt_mDL: { format: 'dc+sd-jwt', scope: 'mDL' },
        mso_mdoc_mDL: { format: 'mso_mdoc', scope: 'mDL' },
      },
    };
    const ids = configurationIdsFor('mDL', ['dc+sd-jwt', 'mso_mdoc'], meta);
    assert.equal(ids.derived, false);
    assert.deepEqual(ids.ids, ['dc_sd_jwt_mDL', 'mso_mdoc_mDL']);
  });

  it('builds the ST issuer_state URN with optional objectId', () => {
    assert.equal(
      issuerStateUrn({ authenticSourceId: 'https://www.mit.gov.it', datasetId: 'mDL' }),
      'urn:it-wallet:credential-offer:https://www.mit.gov.it:mDL',
    );
    assert.equal(
      issuerStateUrn({ authenticSourceId: 'https://www.mit.gov.it', datasetId: 'mDL', objectId: 'abc-1' }),
      'urn:it-wallet:credential-offer:https://www.mit.gov.it:mDL:abc-1',
    );
    assert.equal(issuerStateUrn({ authenticSourceId: 'https://www.mit.gov.it' }), '');
  });

  it('encrypts the URN into compact JWE issuer_state', async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const urn = issuerStateUrn({
      authenticSourceId: 'https://www.mit.gov.it',
      datasetId: 'mDL',
      objectId: 'obj-9',
    });
    const jwe = await encryptIssuerState(urn, JSON.stringify(jwk));
    assert.equal(jwe.split('.').length, 5);
    assert.match(jwe, /^eyJ/);
    const body = credentialOfferObject({
      credentialIssuer: 'https://pre.issuer.wallet.ipzs.it',
      configurationIds: ['mso_mdoc_mDL'],
      issuerState: jwe,
    });
    assert.equal(body.grants.authorization_code.issuer_state, jwe);
  });

  it('round-trips issuer_state with the published demo RSA keys (JWK and PEM)', async () => {
    const urn = issuerStateUrn({
      authenticSourceId: 'https://www.mit.gov.it',
      datasetId: 'mdl_001',
      objectId: 'demo-1',
    });
    const fromJwk = await encryptIssuerState(urn, demoEncPublicJwkText());
    assert.equal(await decryptIssuerState(fromJwk, demoEncPrivateJwkText()), urn);
    const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
    const pemPub = readFileSync(join(root, 'demo/keys/issuer-state-enc.public.pem'), 'utf8');
    const pemPriv = readFileSync(join(root, 'demo/keys/issuer-state-enc.private.pem'), 'utf8');
    const fromPem = await encryptIssuerState(urn, pemPub);
    assert.equal(await decryptIssuerState(fromPem, pemPriv), urn);
  });
});

describe('demo credential', () => {
  const dump = loadDumpFromDisk();
  const graph = buildRegistryGraph(dump, { lang: 'it' });

  it('fills required schema claims with synthetic demo values', () => {
    const schema = dump.resources.find((r) => String(r.path || '').endsWith('mdl.json'))?.json;
    const ctx = {
      issuer: 'https://demo.issuer.wallet.example',
      issuerName: 'Demo',
      sub: '11111111-1111-4111-8111-111111111111',
      now: 1_700_000_000,
      exp: 1_731_532_800,
      vct: 'urn:it-wallet:mDL:1',
      holderJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', alg: 'ES256' },
    };
    const claims = exampleFromSchema(schema, ctx);
    assert.equal(claims.iss, ctx.issuer);
    assert.equal(claims.given_name, 'Mario');
    assert.equal(claims.family_name, 'Rossi');
    assert.equal(claims.issuing_country, 'IT');
    assert.ok(claims.driving_privileges?.[0]?.vehicle_category_code);
    assert.equal(claims._sd, undefined);
  });

  it('extracts CDDL element identifiers', () => {
    const cddl = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../cache/pre.ta.wallet.ipzs.it/schemas/v1.3.3/av.cddl'),
      'utf8',
    );
    const parsed = parseCddlMdoc(cddl);
    assert.equal(parsed.docType, 'eu.europa.ec.av.1');
    assert.deepEqual(
      parsed.namespaces.map((ns) => ns.name),
      ['eu.europa.ec.av.1', 'it.ipzs.wallet.ta.av.1'],
    );
    assert.ok(parsed.namespaces[0].items.some((el) => el.id === 'age_over_18'));
    const claims = claimsFromCddl(cddl, {
      issuer: 'https://demo.issuer.wallet.example',
      issuerName: 'Demo',
      sub: '11111111-1111-4111-8111-111111111111',
      now: 1,
      exp: 2,
      vct: 'eu.europa.ec.av.1',
      holderJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
    });
    assert.equal(claims.age_over_18, true);
    assert.equal(claims.docType, 'eu.europa.ec.av.1');
  });

  it('signs an SD-JWT VC with JSON disclosures and a key-binding JWT', async () => {
    const built = await buildDemoCredential(graph.byId.get('credential:mDL'), dump);
    assert.equal(built.format, 'dc+sd-jwt');
    assert.ok(built.verified);
    assert.equal(built.header.typ, 'dc+sd-jwt');
    assert.equal(built.keyBinding.header.typ, 'kb+jwt');
    assert.match(built.sdJwt, /~eyJ/);
    assert.ok(Array.isArray(built.disclosures[0].json));
    assert.equal(built.disclosures[0].json.length, 3);
    assert.ok(built.disclosures.some((d) => d.json[1] === 'given_name' && d.json[2] === 'Mario'));
    assert.equal(built.reconstructed.given_name, 'Mario');
    assert.equal(built.keyBinding.payload.aud, 'https://demo.verifier.wallet.example');
    assert.ok(built.keyBinding.payload.sd_hash);
    assert.equal(built.artifact.excerpt.disclosures[0].length, 3);
  });

  it('produces DeviceResponse mdoc CBOR as BINASCII hex with issuerSigned claims from the CDDL', async () => {
    const items = await buildDemoCredentials(graph.byId.get('credential:mDL'), dump);
    assert.equal(items.length, 2);
    assert.equal(items[0].format, 'dc+sd-jwt');
    const mdoc = items[1];
    assert.equal(mdoc.format, 'mso_mdoc');
    assert.ok(mdoc.verified);
    assert.equal(mdoc.cbor[0], 0xa3);
    assert.match(mdoc.hex, /^a36776657273696f6e/);
    assert.equal(mdoc.hex, Buffer.from(mdoc.cbor).toString('hex'));
    assert.equal(mdoc.artifact.raw, mdoc.hex);
    assert.doesNotMatch(mdoc.hex, /[^0-9a-f]/);
    assert.doesNotMatch(mdoc.artifact.raw, /^eyJ/);
    assert.equal(mdoc.decoded.documents[0].docType, 'org.iso.18013.5.1.mDL');
    assert.ok(mdoc.decoded.documents[0].issuerSigned.nameSpaces['org.iso.18013.5.1']);
    assert.equal(mdoc.claims.given_name, 'Mario');
    assert.equal(mdoc.claims.family_name, 'Rossi');
    assert.ok(mdoc.namespaces.includes('org.iso.18013.5.1'));
    assert.equal(mdoc.artifact.contentType, 'application/cbor');
    assert.match(mdoc.diagnostic, /24\(<</);
    assert.match(mdoc.diagnostic, /"elementIdentifier": "family_name"/);
    assert.match(mdoc.diagnostic, /"issuerSigned"/);
    assert.match(mdoc.diagnostic, /h'/);
    assert.equal(mdoc.artifact.diagnostic, mdoc.diagnostic);
    const parsed = parseCddlMdoc(dump.resources.find((r) => String(r.path || '').endsWith('mdl.cddl')).raw);
    assert.equal(parsed.docType, 'org.iso.18013.5.1.mDL');
    assert.ok(parsed.namespaces[0].items.some((el) => el.id === 'family_name'));
  });

  it('includes every AV CDDL element, including age_over_18', async () => {
    const items = await buildDemoCredentials(graph.byId.get('credential:av'), dump);
    assert.equal(items.length, 1);
    const mdoc = items[0];
    assert.equal(mdoc.format, 'mso_mdoc');
    assert.equal(mdoc.docType, 'eu.europa.ec.av.1');
    assert.equal(mdoc.claims.age_over_18, true);
    const ns = mdoc.decoded.documents[0].issuerSigned.nameSpaces;
    assert.ok(ns['eu.europa.ec.av.1'].some((el) => el.elementIdentifier === 'age_over_18' && el.elementValue === true));
    assert.ok(ns['it.ipzs.wallet.ta.av.1'].some((el) => el.elementIdentifier === 'sub'));
    assert.ok(ns['it.ipzs.wallet.ta.av.1'].some((el) => el.elementIdentifier === 'issuing_country'));
    assert.ok(ns['it.ipzs.wallet.ta.av.1'].some((el) => el.elementIdentifier === 'issuing_authority'));
    assert.match(mdoc.diagnostic, /"elementIdentifier": "age_over_18"/);
    assert.match(mdoc.diagnostic, /24\(<</);
  });

  it('builds a smartcard model from credential_configuration display metadata', async () => {
    const node = graph.byId.get('credential:mDL');
    const items = await buildDemoCredentials(node, dump);
    const cards = demoCardModels(items, { dump, node, lang: 'it' });
    assert.equal(cards.length, 2);
    assert.equal(cards[0].name, 'Patente di guida');
    assert.match(cards[0].description, /Patente/);
    assert.equal(cards[0].givenName, 'Mario');
    assert.equal(cards[0].familyName, 'Rossi');
    assert.equal(cards[0].configurationId, 'dc_sd_jwt_mDL');
    assert.equal(cards[0].themedFromMetadata, false);
    assert.ok(cards[0].claims.some((row) => row.label === 'Numero' && String(row.value).includes('IT-DEMO')));
    assert.equal(cards[0].claims.some((row) => row.id === 'cnf' || row.id === 'iss'), false);
    const en = demoCardModels(items, { dump, node, lang: 'en' });
    assert.equal(en[0].name, 'Mobile Driving Licence');
    assert.equal(cards[1].configurationId, 'mso_mdoc_mDL');
    assert.equal(cards[1].name, 'Patente di guida');
  });

  it('shows Age Verification claims including age_over_18 on the AV card', async () => {
    const node = graph.byId.get('credential:av');
    const items = await buildDemoCredentials(node, dump);
    const cards = demoCardModels(items, { dump, node, lang: 'it' });
    assert.equal(cards[0].name, 'Età certificata');
    const age = cards[0].claims.find((row) => row.id === 'age_over_18');
    assert.equal(age?.label, 'Maggiore età');
    assert.equal(age?.boolean, true);
    assert.equal(age?.booleanValue, true);
  });

  it('applies background_color and text_color from display when present', () => {
    assert.equal(isCssColor('#112233'), true);
    assert.equal(isCssColor('blue'), false);
    assert.equal(pickLocalizedDisplay([{ locale: 'en-US', name: 'EN' }, { locale: 'it-IT', name: 'IT' }], 'it').name, 'IT');
    const node = { kind: 'credential', credential_type: 'mDL', label: 'mDL' };
    const dumpLite = {
      catalog: { credentials: [{ credential_type: 'mDL', issuers: [{ entity_id: 'https://issuer.example' }] }] },
      issuerMetadata: {
        'https://issuer.example': {
          credential_issuer: 'https://issuer.example',
          display: [{ locale: 'it-IT', name: 'Issuer Demo', logo: { uri: 'https://issuer.example/logo.svg', alt_text: 'logo' } }],
          credential_configurations_supported: {
            dc_sd_jwt_mDL: {
              format: 'dc+sd-jwt',
              scope: 'mDL',
              credential_metadata: {
                display: [
                  {
                    locale: 'it-IT',
                    name: 'Patente colorata',
                    background_color: '#ffcc00',
                    text_color: '#111111',
                  },
                ],
                claims: [{ path: ['given_name'], display: [{ locale: 'it-IT', name: 'Nome' }] }],
              },
            },
          },
        },
      },
    };
    const cards = demoCardModels(
      [{ format: 'dc+sd-jwt', reconstructed: { given_name: 'Mario', family_name: 'Rossi' } }],
      { dump: dumpLite, node, lang: 'it' },
    );
    assert.equal(cards[0].name, 'Patente colorata');
    assert.equal(cards[0].backgroundColor, '#ffcc00');
    assert.equal(cards[0].textColor, '#111111');
    assert.equal(cards[0].themedFromMetadata, true);
    assert.equal(cards[0].logoUri, 'https://issuer.example/logo.svg');
    assert.equal(cards[0].issuerName, 'Issuer Demo');
  });

  it('encodes canonical CBOR majors used by mdoc', () => {
    assert.deepEqual(encodeCbor(0), Uint8Array.of(0x00));
    assert.deepEqual(encodeCbor(true), Uint8Array.of(0xf5));
    assert.equal(encodeCbor('a')[0], 0x61);
    assert.equal(toCborDiag(true), 'true');
    assert.equal(toCborDiag(new Map([[1, -7]])), '{ 1: -7 }');
    assert.match(toCborDiag({ $cborTag: 24, $embedded: true, value: { digestID: 0 } }), /24\(<</);
  });
});
