import { test, expect } from '@playwright/test';
import { clickGraphNode, expandArtifact, expandDetailSection, openGraphPane, search, waitForGraph } from './helpers.js';

test.describe('graph and search UI', () => {
  test('renders a real node graph from the dump', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);

    const stats = await page.evaluate(() => window.__ITW_EXPLORER__);
    expect(stats.nodeCount).toBeGreaterThan(20);
    expect(stats.kinds.credential).toBe(10);
    expect(stats.kinds.issuer).toBeGreaterThan(0);
    expect(stats.kinds.authentic_source).toBeGreaterThan(0);
    expect(stats.kinds.schema).toBeGreaterThan(0);
    expect(stats.visibleIds).toContain('registry');
    expect(stats.visibleIds).toContain('credential:mDL');

    const canvases = page.locator('#registry-graph canvas');
    await expect(canvases).toHaveCount(3);
    const box = await page.locator('#registry-graph canvas[data-id="layer2-node"]').boundingBox();
    if (testInfo.project.name === 'desktop') {
      expect(box?.width).toBeGreaterThan(200);
      expect(box?.height).toBeGreaterThan(200);
    }

    await expect(page.locator('#results-list button')).toHaveCount(10);
    await expect(page.locator('#results-list button[data-kind="credential"] .result-kind-icon use')).toHaveCount(10);
    await expect(
      page.locator('#results-list button[data-node-id="credential:mDL"] .result-kind-icon use'),
    ).toHaveAttribute('href', /#it-card$/);
    await expect(page.locator('#registry-graph .graph-placeholder')).toHaveCount(0);
  });

  test('search can switch preprod and prod Trust Anchors', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await expect(page.locator('#registry-env')).toHaveValue('pre');
    await expect(page.locator('#registry-ta-link')).toHaveAttribute('href', 'https://pre.ta.wallet.ipzs.it');
    await expect(page.locator('#registry-ta-link')).toHaveText('https://pre.ta.wallet.ipzs.it');

    await page.locator('#registry-env').selectOption('prod');
    await page.waitForFunction(() => window.__ITW_EXPLORER__?.env === 'prod' && window.__ITW_EXPLORER__?.kinds?.credential >= 1);
    await expect(page.locator('#registry-env')).toHaveValue('prod');
    await expect(page.locator('#registry-ta-link')).toHaveAttribute('href', 'https://ta.wallet.ipzs.it');
    expect(new URL(page.url()).searchParams.get('env')).toBe('prod');
    const stats = await page.evaluate(() => window.__ITW_EXPLORER__);
    expect(stats.baseUrl).toBe('https://ta.wallet.ipzs.it');
  });

  test('facet selects write legal_type, issuer, as and claim into the query', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await page.locator('#tab-list').click({ force: true }).catch(() => {});

    await expect(page.locator('#facet-legal-type option[value="pub-eaa"]')).toHaveCount(1);
    await expect(page.locator('#facet-legal-type option[value="qeaa"]')).toHaveCount(1);
    await expect(page.locator('#facet-legal-type option[value="eaa"]')).toHaveCount(1);
    expect(await page.locator('#facet-issuer option').count()).toBeGreaterThan(1);
    expect(await page.locator('#facet-as option').count()).toBeGreaterThan(1);
    expect(await page.locator('#facet-claim option').count()).toBeGreaterThan(1);

    await page.locator('#facet-legal-type').selectOption('pub-eaa');
    await page.waitForFunction(() => (window.__ITW_EXPLORER__?.query || '').includes('legal_type:pub-eaa'));
    expect(await page.locator('#registry-search').inputValue()).toContain('legal_type:pub-eaa');
    expect((await page.evaluate(() => window.__ITW_EXPLORER__)).resultIds).toContain('credential:mDL');

    await page.locator('#search-clear-btn').click();
    const issuerValue = await page.locator('#facet-issuer option').nth(1).getAttribute('value');
    await page.locator('#facet-issuer').selectOption(issuerValue);
    await page.waitForFunction((v) => (window.__ITW_EXPLORER__?.query || '').includes(v), issuerValue);
    expect((await page.evaluate(() => window.__ITW_EXPLORER__)).resultIds.length).toBeGreaterThan(0);

    await page.locator('#search-clear-btn').click();
    const asValue = await page.locator('#facet-as option').evaluateAll((opts) => {
      const mit = opts.find((o) => /mit\.gov\.it/i.test(o.value));
      return (mit || opts.find((o) => o.value) || {}).value || '';
    });
    await page.locator('#facet-as').selectOption(asValue);
    await page.waitForFunction((v) => (window.__ITW_EXPLORER__?.query || '').includes(v), asValue);
    const afterAs = await page.evaluate(() => window.__ITW_EXPLORER__);
    expect(afterAs.resultIds).toContain('credential:mDL');
    expect(afterAs.visibleIds).toContain(`as:${asValue}`);

    await page.locator('#search-clear-btn').click();
    const claimValue = await page.locator('#facet-claim option').nth(1).getAttribute('value');
    await page.locator('#facet-claim').selectOption(claimValue);
    await page.waitForFunction((v) => (window.__ITW_EXPLORER__?.query || '').includes(`claim:${v}`), claimValue);
    expect((await page.evaluate(() => window.__ITW_EXPLORER__)).resultIds.length).toBeGreaterThan(0);
  });

  test('search +mDL -pid filters list and graph hierarchy', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await page.locator('#tab-list').click({ force: true }).catch(() => {});
    await search(page, '+mDL -pid');

    const stats = await page.evaluate(() => window.__ITW_EXPLORER__);
    expect(stats.resultIds).toContain('credential:mDL');
    expect(stats.resultIds).not.toContain('credential:pid');
    expect(stats.visibleIds).toContain('registry');
    expect(stats.visibleIds).toContain('catalog');
    expect(stats.visibleIds).toContain('credential:mDL');
    expect(stats.visibleIds).toContain('as:https://www.mit.gov.it');
    expect(stats.visibleIds).not.toContain('credential:pid');
  });

  test('issuer and schema results use distinct Bootstrap Italia icons', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await page.locator('#tab-list').click({ force: true }).catch(() => {});
    await search(page, 'kind:issuer');
    await expect(page.locator('#results-list button[data-kind="issuer"] .result-kind-icon use').first()).toHaveAttribute(
      'href',
      /#it-pa$/,
    );
    await search(page, 'kind:schema');
    await expect(page.locator('#results-list button[data-kind="schema"] .result-kind-icon use').first()).toHaveAttribute(
      'href',
      /#it-file$/,
    );
  });

  test('clicking a graph node shows raw artifacts', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await openGraphPane(page, testInfo.project.name);
    await clickGraphNode(page, 'credential:mDL');
    await expect(page.locator('#node-detail')).toBeVisible();
    await expect(page.locator('#detail-title')).toHaveCount(0);
    await expect(page.locator('#node-artifacts')).toBeVisible();
    await expect(page.locator('#detail-accordion')).toBeVisible();
    await expect(page.locator('#artifact-0-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expandArtifact(page, 'artifact', 0);
    await expect(page.locator('#artifact-0-signed-tab')).toBeVisible();
    await expect(page.locator('#artifact-0-header-tab')).toBeVisible();
    await expect(page.locator('#artifact-0-payload-tab')).toBeVisible();
    await page.locator('#artifact-0-signed-tab').click();
    await expect(page.locator('#artifact-0-signed')).toContainText('eyJ');
  });

  test('selecting a credential shows signed artifact and JOSE header/payload', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await page.locator('#tab-list').click({ force: true }).catch(() => {});
    await page.locator('#results-list button[data-node-id="credential:mDL"]').click();
    await expect(page.locator('#node-artifacts')).toBeVisible();
    await expect(page.locator('#artifacts-heading')).toBeVisible();
    await expect(page.locator('#detail-accordion')).toBeVisible();
    await expandArtifact(page, 'artifact', 0);
    const signed = page.locator('#artifact-0-signed-tab');
    const header = page.locator('#artifact-0-header-tab');
    const payload = page.locator('#artifact-0-payload-tab');
    await expect(signed).toBeVisible();
    await expect(header).toBeVisible();
    await expect(payload).toBeVisible();
    await header.click();
    await expect(page.locator('#artifact-0-header')).toContainText('alg');
    await payload.click();
    await expect(page.locator('#artifact-0-payload')).toContainText('credentials');
    const payloadNodes = page.locator('#artifact-0-payload details.json-node');
    await expect(payloadNodes.first()).toBeVisible();
    await page.locator('#artifact-0-payload').getByRole('button', { name: /Comprimi tutto|Collapse all/ }).click();
    await expect(payloadNodes.first()).not.toHaveAttribute('open');
    await page.locator('#artifact-0-payload').getByRole('button', { name: /Espandi tutto|Expand all/ }).click();
    await expect(payloadNodes.first()).toHaveAttribute('open');
    await page.locator('#artifact-0-excerpt-tab').click();
    await expect(page.locator('#artifact-0-excerpt')).toContainText('mDL');
    await expect(page.locator('#artifact-0-excerpt details.json-node').first()).toBeVisible();
    await expect(page.locator('#node-artifacts')).toContainText('data-model');
    await expect(page.locator('#credential-issuer')).toBeVisible();
    await expect(page.locator('#issuer-heading')).toBeVisible();
    await expect(page.locator('#credential-issuer-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expandDetailSection(page, 'credential-issuer');
    await expect(page.locator('#issuer-artifact-0-toggle')).toContainText('openid-credential-issuer');
    await expect(page.locator('#issuer-artifact-1-toggle')).toContainText('openid-federation');
    await expect(page.locator('#issuer-mismatch-0')).toHaveCount(0);
    await expandArtifact(page, 'issuer-artifact', 0);
    await expect(
      page.locator('#credential-issuer a[href="https://pre.issuer.wallet.ipzs.it/.well-known/openid-credential-issuer"]'),
    ).toBeVisible();
    await expect(page.locator('#issuer-artifact-0-signed')).toContainText('credential_issuer');
    await expect(page.locator('#issuer-artifact-0-payload-tab')).toBeVisible();
    await page.locator('#issuer-artifact-0-payload-tab').click();
    await expect(page.locator('#issuer-artifact-0-payload')).toContainText('credential_configurations_supported');
    await page.locator('#issuer-artifact-0-excerpt-tab').click();
    await expect(page.locator('#issuer-artifact-0-excerpt')).toContainText('dc_sd_jwt_mDL');
    await expect(page.locator('#issuer-artifact-0-excerpt')).toContainText('mso_mdoc_mDL');
    await expect(page.locator('#issuer-artifact-0-excerpt')).not.toContainText('dc_sd_jwt_pid');
    await expandArtifact(page, 'issuer-artifact', 1);
    await expect(
      page.locator('#credential-issuer a[href="https://pre.issuer.wallet.ipzs.it/.well-known/openid-federation"]'),
    ).toBeVisible();
    await expect(page.locator('#issuer-artifact-1-signed-tab')).toBeVisible();
    await page.locator('#issuer-artifact-1-payload-tab').click();
    await expect(page.locator('#issuer-artifact-1-payload')).toContainText('openid_credential_issuer');
    await expect(page.locator('#issuer-artifact-1-excerpt')).toBeHidden();
    await page.locator('#issuer-artifact-1-excerpt-tab').click();
    await expect(page.locator('#issuer-artifact-1-excerpt')).toContainText('dc_sd_jwt_mDL');
    await expect(page.locator('#credential-example')).toBeVisible();
    await expect(page.locator('#example-heading')).toBeVisible();
    await expect(page.locator('#credential-example-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expandDetailSection(page, 'credential-example');
    const demoWarn = page.locator('#example-warning');
    await expect(demoWarn).toBeVisible();
    await expect(demoWarn).toHaveClass(/alert-warning/);
    await expect(demoWarn).toHaveAttribute('role', 'alert');
    await expect(page.locator('#example-disclaimer')).toContainText(/esemplificazione|illustration only/i);
    await expect(page.locator('#example-cards-heading')).toBeVisible();
    await expect(page.locator('#example-card-0-name')).toContainText('Patente');
    await expect(page.locator('#example-card-0-fullname')).toContainText('Mario Rossi');
    await expect(page.locator('#example-card-0-claims')).toContainText('Numero');
    await expect(page.locator('#example-card-0-claims')).toContainText('IT-DEMO-0001');
    await expect(page.locator('#example-card-0-config')).toHaveText('dc_sd_jwt_mDL');
    await expect(page.locator('#example-card-1-config')).toHaveText('mso_mdoc_mDL');
    const keysLink = page.locator('#example-keys-link');
    await expect(keysLink).toBeVisible();
    await expect(keysLink).toHaveText('demo/keys/');
    await expect(keysLink).toHaveAttribute(
      'href',
      'https://github.com/italia/eid-wallet-it-attestations-registry-browser/tree/main/demo/keys',
    );
    await expandArtifact(page, 'example-artifact', 0);
    await expect(page.locator('#example-artifact-0-signed')).toContainText('eyJ');
    await page.locator('#example-artifact-0-excerpt-tab').click();
    await expect(page.locator('#example-artifact-0-excerpt')).toContainText('Mario');
    await expect(page.locator('#example-artifact-0-excerpt')).toContainText('given_name');
    await expect(page.locator('#example-artifact-0-excerpt')).toContainText('kb+jwt');
    await expandArtifact(page, 'example-artifact', 1);
    await expect(page.locator('#example-artifact-1-signed-tab')).toBeVisible();
    await expect(page.locator('#credential-example')).toContainText('mso_mdoc');
    const mdocHex = (await page.locator('#example-artifact-1-signed').innerText()).trim();
    expect(mdocHex).toMatch(/^[0-9a-f]+$/);
    expect(mdocHex.startsWith('a36776657273696f6e')).toBe(true);
    await expect(page.locator('#example-artifact-1-diagnostic-tab')).toBeVisible();
    await page.locator('#example-artifact-1-diagnostic-tab').click();
    await expect(page.locator('#example-artifact-1-diagnostic')).toContainText('24(<<');
    await expect(page.locator('#example-artifact-1-diagnostic')).toContainText('family_name');
    await expect(page.locator('#example-artifact-1-diagnostic')).toContainText('issuerSigned');
    await page.locator('#example-artifact-1-excerpt-tab').click();
    await expect(page.locator('#example-artifact-1-excerpt')).toContainText('org.iso.18013.5.1.mDL');
    await expect(page.locator('#example-artifact-1-excerpt')).toContainText('issuerSigned');
    await expect(page.locator('#example-artifact-1-excerpt')).toContainText('family_name');
  });

  test('credential offer href and QR are present', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await page.locator('#results-list button[data-node-id="credential:mDL"]').click();
    await expect(page.locator('#credential-offer-toggle')).toBeVisible();
    await expect(page.locator('#credential-offer-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expandDetailSection(page, 'credential-offer');
    const offerLink = page.locator('.accordion-collapse.show #offer-link');
    await expect(offerLink).toHaveAttribute('href', /^openid-credential-offer:\/\//);
    await expect(offerLink).toHaveAttribute('href', /issuer_state/);
    const href = await offerLink.getAttribute('href');
    await expect(page.locator('.accordion-collapse.show #offer-qr')).toHaveAttribute('alt', href);
    const qrBox = await page.locator('.accordion-collapse.show #offer-qr').boundingBox();
    expect(qrBox?.width).toBeGreaterThan(80);
    await expect(page.locator('.accordion-collapse.show #offer-json')).toContainText('"credential_issuer"');
    await expect(page.locator('.accordion-collapse.show #offer-json')).toContainText('authorization_code');
    await expect(page.locator('.accordion-collapse.show #offer-json')).toContainText('issuer_state');
    await expect(page.locator('#offer-url-label')).toHaveText(/URL same device flow/);
    await expect(page.locator('#offer-qr-label')).toHaveText(/QR-Code cross device flow/);
    await expect(page.locator('#offer-object-id')).toBeVisible();
    await expect(page.locator('#offer-enc-key')).toHaveValue(/BEGIN PUBLIC KEY/);
    await expect(page.locator('#offer-urn')).toContainText('urn:it-wallet:credential-offer:');
    await expect(page.locator('#offer-decrypt-hint')).toBeVisible();
    await expect(page.locator('#offer-decrypt-help')).toBeVisible();
    await expect(page.locator('#offer-decrypted')).toContainText('urn:it-wallet:credential-offer:');
    await page.locator('#offer-decrypt-summary').click();
    await expect(page.locator('#offer-decrypt-command')).toContainText('decrypt-issuer-state.mjs');
  });

  test('credential offer stays filled after switching credentials', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await page.locator('#results-list button[data-node-id="credential:mDL"]').click();
    await expect(page.locator('#credential-offer-toggle')).toBeVisible();
    await page.locator('#results-list button[data-node-id="credential:pid"]').click();
    await expect(page.locator('#results-list button[data-node-id="credential:pid"]')).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expandDetailSection(page, 'credential-offer');
    const pidLink = page.locator('.accordion-collapse.show #offer-link');
    await expect(pidLink).toHaveAttribute('href', /^openid-credential-offer:\/\//);
    await expect(pidLink).toHaveAttribute('href', /issuer_state/);
    await expect(page.locator('.accordion-collapse.show #offer-qr')).toHaveAttribute('src', /^data:image\/png/);
    await page.locator('#results-list button[data-node-id="credential:mDL"]').click();
    await expect(page.locator('#results-list button[data-node-id="credential:mDL"]')).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expandDetailSection(page, 'credential-offer');
    const mdlLink = page.locator('.accordion-collapse.show #offer-link');
    await expect(mdlLink).toHaveAttribute('href', /^openid-credential-offer:\/\//);
    await expect(mdlLink).toHaveAttribute('href', /issuer_state/);
    await expect(page.locator('.accordion-collapse.show #offer-qr')).toHaveAttribute('src', /^data:image\/png/);
    await expect(page.locator('#node-detail')).toHaveCount(1);
  });

  test('deep link restores env, query and node', async ({ page }) => {
    await page.goto('/?env=pre&q=legal_type:pub-eaa&node=credential:mDL', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await expect(page.locator('#registry-env')).toHaveValue('pre');
    await expect(page.locator('#registry-search')).toHaveValue(/legal_type:pub-eaa/);
    await page.waitForFunction(() => window.__ITW_EXPLORER__?.selectedId === 'credential:mDL');
    expect(new URL(page.url()).searchParams.get('node')).toBe('credential:mDL');
  });

  test('CORS warning banner when live Trust Anchor requests fail', async ({ page }) => {
    await page.route('https://pre.ta.wallet.ipzs.it/**', (route) => route.abort());
    await page.route('https://ta.wallet.ipzs.it/**', (route) => route.abort());
    await page.goto('/?live=1', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    const alert = page.locator('#cors-fault-alert');
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toHaveClass(/alert-warning/);
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(page.locator('#cors-fault-text')).toContainText(/CORS|HTTP/i);
    const link = page.locator('#cors-fault-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveClass(/alert-link/);
    await expect(link).toHaveAttribute(
      'href',
      'https://github.com/italia/eid-wallet-it-attestations-registry-browser/blob/main/docs/CACHE-AND-CI.md#cors-and-waf',
    );
    await page.locator('#message-board-toggle').click();
    await expect(page.locator('#board-cors-help')).toBeVisible();
    await expect(page.locator('#board-cors-link')).toHaveAttribute(
      'href',
      'https://github.com/italia/eid-wallet-it-attestations-registry-browser/blob/main/docs/CACHE-AND-CI.md#cors-and-waf',
    );
  });
});
