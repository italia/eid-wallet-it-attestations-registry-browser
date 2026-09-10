import { test, expect } from '@playwright/test';
import { waitForGraph } from './helpers.js';

test.describe('responsive navigation', () => {
  test('header, search and graph remain usable', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);

    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();

    await expect(page.locator('#page-heading')).toBeVisible();
    await expect(page.locator('#registry-search')).toBeVisible();
    await expect(page.locator('#message-board-toggle')).toBeVisible();

    const slim = page.locator('.it-header-slim-wrapper');
    const slimBox = await slim.boundingBox();
    expect(slimBox?.width).toBeGreaterThan(300);
    expect(slimBox?.height).toBeGreaterThan(24);

    const isMobile = testInfo.project.name === 'mobile' || (viewport?.width ?? 0) < 992;
    if (isMobile) {
      await expect(page.locator('.explorer-mobile-tabs')).toBeVisible();
      await expect(page.locator('#section-results')).toBeVisible();
      await expect(page.locator('#section-graph')).toBeVisible();
      const graph = page.locator('#registry-graph');
      const gBox = await graph.boundingBox();
      expect(gBox?.width).toBeGreaterThan(250);
      expect(gBox?.height).toBeGreaterThan(200);
      const canvas = page.locator('#registry-graph canvas[data-id="layer2-node"]');
      await expect(canvas).toBeVisible();
      await page.locator('#graph-zoom-in').click();
      await page.locator('#graph-zoom-fit').click();
      await page.locator('#tab-list').click();
      await expect(page.locator('#results-list button').first()).toBeVisible();
    } else {
      await expect(page.locator('#section-search')).toBeVisible();
      await expect(page.locator('#section-results')).toBeVisible();
      await expect(page.locator('#section-graph')).toBeVisible();
      await expect(page.locator('#registry-graph canvas[data-id="layer2-node"]')).toBeVisible();
    }
  });

  test('does not overflow the viewport horizontally', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scroll: doc.scrollWidth, client: doc.clientWidth };
    });
    expect(overflow.scroll - overflow.client).toBeLessThan(8);
  });
});
