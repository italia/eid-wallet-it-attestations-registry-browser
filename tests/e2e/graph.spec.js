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
  });

  test('credential offer href and QR are present', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await page.locator('#results-list button[data-node-id="credential:mDL"]').click();
    const href = await page.locator('#offer-link').getAttribute('href');
    expect(href).toMatch(/^openid-credential-offer:\/\//);
    expect(href).not.toContain('issuer_state');
    await expect(page.locator('#offer-qr')).toHaveAttribute('alt', href);
    const qrBox = await page.locator('#offer-qr').boundingBox();
    expect(qrBox?.width).toBeGreaterThan(80);
  });
});
