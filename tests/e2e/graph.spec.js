import { test, expect } from '@playwright/test';
import { clickGraphNode, openGraphPane, search, waitForGraph } from './helpers.js';

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

  test('clicking a graph node shows raw artifacts', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await openGraphPane(page, testInfo.project.name);
    await clickGraphNode(page, 'credential:mDL');
    await expect(page.locator('#node-detail')).toBeVisible();
    await expect(page.locator('#node-artifacts')).toBeVisible();
    await expect(page.locator('#artifact-0-signed-tab')).toBeVisible();
    await expect(page.locator('#artifact-0-header-tab')).toBeVisible();
    await expect(page.locator('#artifact-0-payload-tab')).toBeVisible();
    await page.locator('#artifact-0-signed-tab').click();
    await expect(page.locator('#artifact-0-signed')).toContainText('eyJ');
  });

  test('selecting a credential shows signed artifact and JOSE header/payload', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await page.locator('#tab-list').click({ force: true }).catch(() => {});
    await page.locator('#results-list button[data-node-id="credential:mDL"]').click();
    await expect(page.locator('#node-artifacts')).toBeVisible();
    await expect(page.locator('#artifacts-heading')).toBeVisible();
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
    await expect(page.locator('#credential-example')).toBeVisible();
    await expect(page.locator('#example-heading')).toBeVisible();
    const demoWarn = page.locator('#example-warning');
    await expect(demoWarn).toBeVisible();
    await expect(demoWarn).toHaveClass(/alert-warning/);
    await expect(demoWarn).toHaveAttribute('role', 'alert');
    await expect(page.locator('#example-disclaimer')).toContainText(/esemplificazione|illustration only/i);
    const keysLink = page.locator('#example-keys-link');
    await expect(keysLink).toBeVisible();
    await expect(keysLink).toHaveText('demo/keys/');
    await expect(keysLink).toHaveAttribute(
      'href',
      'https://github.com/italia/eid-wallet-it-attestations-registry-browser/tree/main/demo/keys',
    );
    await expect(page.locator('#example-artifact-0-signed')).toContainText('eyJ');
    await page.locator('#example-artifact-0-excerpt-tab').click();
    await expect(page.locator('#example-artifact-0-excerpt')).toContainText('Mario');
    await expect(page.locator('#example-artifact-0-excerpt')).toContainText('given_name');
    await expect(page.locator('#example-artifact-0-excerpt')).toContainText('kb+jwt');
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
    await expect(page.locator('#offer-link')).toHaveAttribute('href', /^openid-credential-offer:\/\//);
    await expect(page.locator('#offer-link')).toHaveAttribute('href', /issuer_state/);
    const href = await page.locator('#offer-link').getAttribute('href');
    await expect(page.locator('#offer-qr')).toHaveAttribute('alt', href);
    const qrBox = await page.locator('#offer-qr').boundingBox();
    expect(qrBox?.width).toBeGreaterThan(80);
    await expect(page.locator('#offer-json')).toContainText('"credential_issuer"');
    await expect(page.locator('#offer-json')).toContainText('authorization_code');
    await expect(page.locator('#offer-json')).toContainText('issuer_state');
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

  test('deep link restores env, query and node', async ({ page }) => {
    await page.goto('/?env=pre&q=legal_type:pub-eaa&node=credential:mDL', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await expect(page.locator('#registry-env')).toHaveValue('pre');
    await expect(page.locator('#registry-search')).toHaveValue(/legal_type:pub-eaa/);
    await page.waitForFunction(() => window.__ITW_EXPLORER__?.selectedId === 'credential:mDL');
    expect(new URL(page.url()).searchParams.get('node')).toBe('credential:mDL');
  });
});
