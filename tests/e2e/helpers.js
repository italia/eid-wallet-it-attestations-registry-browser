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

export async function openGraphPane(page, projectName) {
  if (projectName !== 'desktop') {
    const tab = page.locator('#tab-graph');
    if (await tab.isVisible()) await tab.click();
  }
}

export async function expandDetailSection(page, id) {
  return expandArtifact(page, id);
}

export async function expandArtifact(page, prefix, index) {
  const toggleId = Number.isInteger(index) ? `${prefix}-${index}-toggle` : `${prefix}-toggle`;
  const panelId = Number.isInteger(index) ? `${prefix}-${index}-panel` : `${prefix}-panel`;
  const toggle = page.locator(`#${toggleId}`);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click({ force: true });
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
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
