import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRegistryGraph, facetOptions, visibleClosure } from '../../src/js/graph/model.js';
import { getQueryField, matchedNodeIds, parseQuery, quoteFieldValue, searchDocuments, setQueryField } from '../../src/js/search/index.js';
import { decodeJwt, parseRegistryBody } from '../../src/js/cache/jwt.js';
import { loadDump, timedFetch } from '../../src/js/cache/loader.js';
import { resolveRegistryEnv } from '../../src/js/cache/environments.js';
import { artifactsForNode, formatArtifactView } from '../../src/js/artifacts/artifacts.js';
import { jsonPreview, tryParseJson } from '../../src/js/artifacts/json-tree.js';
import { configurationIdsFor, credentialOfferHref, credentialOfferObject, encryptIssuerState, issuerStateUrn } from '../../src/js/offer/offer.js';
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
});

describe('artifacts', () => {
  const dump = loadDumpFromDisk();
  const graph = buildRegistryGraph(dump, { lang: 'it' });

  it('shows signed catalog JWT and plaintext excerpt for a credential', () => {
    const arts = artifactsForNode(graph.byId.get('credential:mDL'), dump);
    assert.equal(arts.length, 1);
    assert.equal(arts[0].jwt, true);
    assert.match(arts[0].raw, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./);
    assert.ok(arts[0].header?.alg);
    assert.equal(arts[0].excerpt.credential_type, 'mDL');
    assert.match(formatArtifactView(arts[0], 'header'), /alg/);
    assert.match(formatArtifactView(arts[0], 'excerpt'), /"credential_type": "mDL"/);
    assert.equal(tryParseJson(arts[0].excerpt).ok, true);
    assert.match(jsonPreview(arts[0].excerpt.issuers || []), /^\[/);
    assert.equal(tryParseJson('not-json').ok, false);
  });

  it('shows schema file for a schema node', () => {
    const schema = graph.nodes.find((n) => n.kind === 'schema' && n.credential_type === 'mDL' && String(n.schema_uri || '').endsWith('.json'));
    const arts = artifactsForNode(schema, dump);
    assert.ok(arts.some((a) => a.excerpt?.credential_type === 'mDL'));
    assert.ok(arts.some((a) => a.path?.includes('mdl.json') && a.raw));
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

describe('credential offer', () => {
  it('builds OpenID4VCI by-value href without issuer_state', () => {
    const href = credentialOfferHref({
      credentialIssuer: 'https://pre.issuer.wallet.ipzs.it',
      configurationIds: configurationIdsFor('mDL', ['dc+sd-jwt', 'mso_mdoc']),
    });
    assert.match(href, /^openid-credential-offer:\/\/\?credential_offer=/);
    const json = JSON.parse(decodeURIComponent(href.split('credential_offer=')[1]));
    assert.equal(json.credential_issuer, 'https://pre.issuer.wallet.ipzs.it');
    assert.ok(json.grants.authorization_code);
    assert.equal(json.grants.authorization_code.issuer_state, undefined);
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
});
