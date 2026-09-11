import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForGraph } from './helpers.js';

test.describe('accessibility', () => {
  test('skip links, labelled search, live results, board in slim header', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);

    await expect(page.locator('#skip-main')).toHaveAttribute('href', '#main-content');
    await expect(page.locator('#skip-footer')).toHaveAttribute('href', '#page-footer');
    await expect(page.locator('#skip-graph')).toHaveAttribute('href', '#registry-graph');
    await expect(page.locator('#registry-search')).toHaveAttribute('id', 'registry-search');
    await expect(page.locator('label[for="registry-search"]')).toBeVisible();
    await expect(page.locator('label[for="registry-env"]')).toBeVisible();
    await expect(page.locator('label[for="facet-legal-type"]')).toBeVisible();
    await expect(page.locator('label[for="facet-issuer"]')).toBeVisible();
    await expect(page.locator('label[for="facet-as"]')).toBeVisible();
    await expect(page.locator('label[for="facet-claim"]')).toBeVisible();
    await expect(page.locator('#results-count')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#graph-caption')).toHaveAttribute('aria-live', 'polite');

    const logo = page.locator('#header-it-wallet-logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('src', /IT-Wallet-Symbol-Negative-White\.svg/);
    await expect(logo).toHaveAttribute('aria-hidden', 'true');
    const logoBeforeBrand = await page.evaluate(() => {
      const mark = document.getElementById('header-it-wallet-logo');
      const name = document.getElementById('header-region-name');
      return Boolean(mark && name && (mark.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(logoBeforeBrand).toBe(true);

    const boardBtn = page.locator('#message-board-toggle');
    await expect(boardBtn).toBeVisible();
    await expect(boardBtn).toHaveClass(/nav-link/);
    await expect(page.locator('#languagesDropButton')).toHaveClass(/nav-link dropdown-toggle/);
    await expect(page.locator('.it-header-lang-dropdown .link-list-wrapper')).toHaveCount(1);
    await expect(page.locator('#languagesDropButton svg.icon')).toHaveCount(1);
    const header = page.locator('header [role="banner"], header.it-header-wrapper');
    await expect(header.locator('#message-board-toggle')).toHaveCount(1);
    const box = await boardBtn.boundingBox();
    expect(box).toBeTruthy();
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);

    await expect(page.locator('#cache-loading')).toBeHidden();
    await expect(page.locator('#cache-loading')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#cors-fault-alert')).toBeHidden();

    await boardBtn.click();
    await expect(page.locator('#message-board')).toBeVisible();
    await expect(page.locator('#message-board-list li.board-call')).not.toHaveCount(0);
    await expect(page.locator('#message-board-list li.board-call-pending')).toHaveCount(0);
    await expect(page.locator('#message-board-list')).toContainText('GET https://');
    await expect(page.locator('#message-board-list')).toContainText('HTTP 200');
    await expect(page.locator('#message-board-list')).toContainText('ms');
    await expect(page.locator('#message-board-list')).toContainText('application/json');
    await expect(page.locator('#message-board-list')).toContainText('it-wallet-registry');
    const callCount = await page.evaluate(() => window.__ITW_EXPLORER__?.httpCalls?.length || 0);
    expect(callCount).toBeGreaterThan(10);
    const listed = page.locator('#message-board-list li.board-call');
    expect(await listed.count()).toBeGreaterThanOrEqual(callCount);
    const firstCard = page.locator('#message-board-list li.board-call').first();
    const secondCard = page.locator('#message-board-list li.board-call').nth(1);
    await expect(firstCard).toBeVisible();
    await expect(secondCard).toBeVisible();
    const gap = await page.evaluate(() => {
      const list = document.getElementById('message-board-list');
      const items = [...list.querySelectorAll('li.board-call')];
      if (items.length < 2) return 0;
      const a = items[0].getBoundingClientRect();
      const b = items[1].getBoundingClientRect();
      return b.top - a.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(8);
    await page.locator('#message-board-close').click();
  });

  test('axe wcag2a + wcag2aa excluding the canvas graph', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('#registry-graph')
      .exclude('#offer-qr')
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('keyboard can reach search and a result', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await page.locator('#registry-search').focus();
    await expect(page.locator('#registry-search')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.locator('#results-list button').first().focus();
    await expect(page.locator('#results-list button').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#credential-offer')).toBeVisible();
  });

  test('language switch updates document lang', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGraph(page);
    await page.locator('#languagesDropButton').click();
    await page.locator('.it-lang-option[data-lang="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#page-heading')).toContainText('IT-Wallet Attestations Explorer and Demo');
  });
});
