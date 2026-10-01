import { expect } from '@playwright/test';

export async function waitForGraph(page) {
  await page.waitForSelector('#registry-graph[data-ready="true"]', {
    state: 'attached',
    timeout: 30_000,
  });
  await page.waitForFunction(() => window.__ITW_EXPLORER__?.kinds?.credential >= 10, null, {
    timeout: 10_000,
  });
}

export async function search(page, query) {
  await page.locator('#registry-search').fill(query);
  await page.locator('#search-btn').click();
  await page.waitForFunction((q) => window.__ITW_EXPLORER__?.query === q, query);
}

export async function openGraphPane(page) {
  const section = page.locator('#section-graph');
  if (!(await section.isVisible())) await page.locator('#nav-graph').click();
  await expect(section).toBeVisible();
  await expect(page.locator('#registry-graph canvas[data-id="layer2-node"]')).toBeVisible();
}

export async function openResultsPane(page) {
  const section = page.locator('#section-results');
  if (!(await section.isVisible())) await page.locator('#nav-results').click();
  await expect(section).toBeVisible();
}

export async function expandDetailSection(page, id) {
  return expandArtifact(page, id);
}

export async function expandArtifact(page, prefix, index) {
  const toggleId = Number.isInteger(index) ? `${prefix}-${index}-toggle` : `${prefix}-toggle`;
  const panelId = Number.isInteger(index) ? `${prefix}-${index}-panel` : `${prefix}-panel`;
  const toggle = page.locator(`#${toggleId}`);
  await expect(toggle).toBeVisible();
  await expect(page.locator('#results-list > .accordion-item > .accordion-collapse.show')).toBeVisible();
  await expect.poll(async () => {
    if ((await toggle.getAttribute('aria-expanded')) === 'true') return 'true';
    await toggle.click({ force: true });
    return toggle.getAttribute('aria-expanded');
  }).toBe('true');
  await expect(page.locator(`#${panelId}`)).toHaveClass(/show/);
}

export async function clickGraphNode(page, nodeId) {
  await page.evaluate((id) => {
    const cy = window.__ITW_CY__ || window.__ITW_EXPLORER__?.cy;
    if (!cy) throw new Error('graph is not ready');
    const node = cy.getElementById(id);
    if (!node.nonempty()) throw new Error(`graph node ${id} not found`);
    node.emit('tap');
  }, nodeId);
  await page.waitForFunction((id) => window.__ITW_EXPLORER__?.selectedId === id, nodeId, {
    timeout: 5_000,
  });
}
