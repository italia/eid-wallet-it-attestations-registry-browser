import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dumpFallbackBody,
  followUpsFromParsed,
  looksLikeHtml,
  seedRegistryUrls,
} from '../../src/js/cache/discover.js';
import { findDumpResource, refreshDumpLive } from '../../src/js/cache/browser.js';

function mapFetch(map) {
  const requested = [];
  const fetchFn = async (url) => {
    requested.push(url);
    const entry = map[url];
    if (!entry) {
      return { ok: false, status: 404, headers: { get: () => '' }, text: async () => '' };
    }
    if (entry.throw) throw new Error(entry.throw);
    return {
      ok: entry.ok !== false,
      status: entry.status ?? (entry.ok === false ? 500 : 200),
      headers: { get: () => entry.type || 'application/json' },
      text: async () => entry.text,
    };
  };
  fetchFn.requested = requested;
  return fetchFn;
}

describe('discovery planner', () => {
  it('seeds registry well-knowns from the Trust Anchor base', () => {
    const seeds = seedRegistryUrls('https://ta.wallet.ipzs.it/');
    assert.deepEqual(
      seeds.map((s) => s.url),
      [
        'https://ta.wallet.ipzs.it/.well-known/it-wallet-registry',
        'https://ta.wallet.ipzs.it/.well-known/openid-federation',
      ],
    );
    assert.deepEqual(
      seeds.map((s) => s.kind),
      ['discovery', 'federation-entity'],
    );
  });

  it('enqueues schema_uri even when that file is absent from a dump manifest', () => {
    const { followUps, integrity } = followUpsFromParsed({
      kind: 'registry',
      url: 'https://ta.wallet.ipzs.it/.well-known/schemas',
      json: {
        schemas: [
          {
            schema_uri: 'https://ta.wallet.ipzs.it/schemas/v1.3.3/eid.json#defs',
            'schema_uri#integrity': 'sha256-abc',
          },
        ],
      },
    });
    assert.ok(
      followUps.some(
        (row) => row.url === 'https://ta.wallet.ipzs.it/schemas/v1.3.3/eid.json' && row.kind === 'schema-file',
      ),
    );
    assert.deepEqual(integrity, [
      { url: 'https://ta.wallet.ipzs.it/schemas/v1.3.3/eid.json', sri: 'sha256-abc' },
    ]);
  });

  it('detects WAF HTML bodies', () => {
    assert.equal(looksLikeHtml('<html><body>Request Rejected</body></html>', 'text/html'), true);
    assert.equal(looksLikeHtml('{"ok":true}', 'application/json'), false);
  });

  it('returns dump raw text as fallback body', () => {
    const fallback = dumpFallbackBody({ raw: '{"title":"eid"}', content_type: 'application/json' });
    assert.equal(fallback.text, '{"title":"eid"}');
  });
});

describe('live cache discovery', () => {
  const base = 'https://ta.wallet.ipzs.it';
  const discoveryUrl = `${base}/.well-known/it-wallet-registry`;
  const federationUrl = `${base}/.well-known/openid-federation`;
  const schemasUrl = `${base}/.well-known/schemas`;
  const eidUrl = `${base}/schemas/v1.3.3/eid.json`;
  const pidUrl = `${base}/schemas/v1.3.3/pid.json`;
  const discoveryJson = { endpoints: { schemas: schemasUrl } };

  it('follows live discovery instead of dump.manifest.resources', async () => {
    const dump = {
      manifest: { base_url: base, flags: { withIssuerMetadata: true } },
      resources: [
        {
          url: pidUrl,
          path: 'ta.wallet.ipzs.it/schemas/v1.3.3/pid.json',
          kind: 'schema-file',
          raw: '{"title":"pid"}',
          json: { title: 'pid' },
        },
      ],
      schemas: [],
    };
    const fetchFn = mapFetch({
      [discoveryUrl]: { text: JSON.stringify(discoveryJson) },
      [federationUrl]: { throw: 'Failed to fetch' },
      [schemasUrl]: { text: JSON.stringify({ schemas: [{ schema_uri: eidUrl }] }) },
      [eidUrl]: { text: '{"title":"eid"}' },
    });
    const { changed } = await refreshDumpLive(dump, { fetchFn });
    assert.equal(changed, true);
    assert.ok(fetchFn.requested.includes(eidUrl));
    assert.equal(fetchFn.requested.includes(pidUrl), false);
    const eid = dump.resources.find((row) => row.url === eidUrl);
    assert.equal(eid?.json?.title, 'eid');
    assert.equal(eid?.live, true);
  });

  it('falls back to dump bodies when live GETs fail and still follows dump JSON', async () => {
    const dump = {
      manifest: { base_url: base, flags: { withIssuerMetadata: true } },
      resources: [
        {
          url: discoveryUrl,
          path: 'ta.wallet.ipzs.it/.well-known/it-wallet-registry',
          kind: 'discovery',
          raw: JSON.stringify(discoveryJson),
          json: discoveryJson,
        },
        {
          url: schemasUrl,
          path: 'ta.wallet.ipzs.it/.well-known/schemas',
          kind: 'registry',
          raw: JSON.stringify({ schemas: [{ schema_uri: eidUrl }] }),
          json: { schemas: [{ schema_uri: eidUrl }] },
        },
        {
          url: eidUrl,
          path: 'ta.wallet.ipzs.it/schemas/v1.3.3/eid.json',
          kind: 'schema-file',
          raw: '{"title":"eid-dump"}',
          json: { title: 'eid-dump' },
        },
      ],
      schemas: [{ schema_uri: eidUrl }],
    };
    const fetchFn = mapFetch({
      [discoveryUrl]: { throw: 'Failed to fetch' },
      [federationUrl]: { throw: 'Failed to fetch' },
      [schemasUrl]: { throw: 'Failed to fetch' },
      [eidUrl]: { throw: 'Failed to fetch' },
    });
    const { changed, httpCalls } = await refreshDumpLive(dump, { fetchFn });
    assert.equal(changed, false);
    assert.ok(fetchFn.requested.includes(discoveryUrl));
    assert.ok(fetchFn.requested.includes(schemasUrl));
    assert.ok(fetchFn.requested.includes(eidUrl));
    assert.equal(dump.resources.find((row) => row.url === eidUrl).json.title, 'eid-dump');
    assert.ok(httpCalls.every((call) => !call.ok));
  });

  it('treats WAF HTML as a live failure and uses dump fallback to continue discovery', async () => {
    const dump = {
      manifest: { base_url: base },
      resources: [
        {
          url: discoveryUrl,
          kind: 'discovery',
          path: 'ta.wallet.ipzs.it/.well-known/it-wallet-registry',
          raw: JSON.stringify(discoveryJson),
          json: discoveryJson,
        },
      ],
      schemas: [],
    };
    const fetchFn = mapFetch({
      [discoveryUrl]: {
        text: '<html><body>Request Rejected</body></html>',
        type: 'text/html',
        ok: true,
        status: 200,
      },
      [federationUrl]: { throw: 'Failed to fetch' },
      [schemasUrl]: { throw: 'Failed to fetch' },
    });
    const { changed, httpCalls } = await refreshDumpLive(dump, { fetchFn });
    assert.equal(changed, false);
    const discoveryCall = httpCalls.find((call) => call.endpoint === discoveryUrl);
    assert.equal(discoveryCall.ok, false);
    assert.match(discoveryCall.error, /HTML/);
    assert.ok(fetchFn.requested.includes(schemasUrl));
  });
});

describe('findDumpResource', () => {
  it('matches live-discovered resources not listed in the dump manifest', () => {
    const dump = {
      manifest: { resources: [] },
      resources: [
        {
          url: 'https://ta.wallet.ipzs.it/schemas/v1.3.3/eid.json',
          path: 'ta.wallet.ipzs.it/schemas/v1.3.3/eid.json',
        },
      ],
    };
    const found = findDumpResource(dump, {
      endpoint: 'https://ta.wallet.ipzs.it/schemas/v1.3.3/eid.json',
    });
    assert.ok(found.path.endsWith('eid.json'));
  });
});
