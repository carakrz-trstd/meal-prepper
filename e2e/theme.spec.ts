import { test, expect, type Page } from '@playwright/test';

/** Dungeon mode: a dark alternative to the parchment look, remembered per browser. */

/** relative luminance (0 = black, 1 = white) of a computed CSS colour like "rgb(230, 223, 206)" */
async function luminance(page: Page, selector: string, property: 'color' | 'backgroundColor'): Promise<number> {
  return page.locator(selector).first().evaluate((el, prop) => {
    const m = getComputedStyle(el)[prop as 'color'].match(/[\d.]+/g)!.map(Number);
    const [r, g, b] = m.slice(0, 3).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }, property);
}

const toggle = (page: Page) => page.getByRole('button', { name: 'Dungeon mode' });

test('the parchment look is the default; dark text on light paper', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await luminance(page, 'body', 'color')).toBeLessThan(0.05); // dark ink
  expect(await luminance(page, 'main h1', 'color')).toBeLessThan(0.1); // burgundy heading
});

test('dungeon mode turns the pages dark, is remembered and can be switched off again', async ({ page }) => {
  await page.goto('/plan');
  await toggle(page).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dungeon');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await luminance(page, 'body', 'color')).toBeGreaterThan(0.6); // light bone-coloured text
  expect(await luminance(page, 'main h1', 'color')).toBeGreaterThan(0.4); // ember-coloured heading
  expect(await luminance(page, 'html', 'backgroundColor')).toBeLessThan(0.05); // dark stone

  // remembered across pages and reloads, and no flash of the other theme before the page script runs
  await page.getByRole('link', { name: 'Shopping list', exact: true }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dungeon');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dungeon');
  expect(await page.evaluate(() => localStorage.getItem('mealprepper-theme'))).toBe('dungeon');

  await toggle(page).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment');
});

test('the theme is already applied before the app code runs (no flash)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mealprepper-theme', 'dungeon'));
  let themeAtFirstPaint: string | undefined;
  await page.exposeFunction('reportTheme', (t: string) => { themeAtFirstPaint ??= t; });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => (window as unknown as { reportTheme(t: string): void }).reportTheme(document.documentElement.dataset.theme ?? ''));
  });
  await page.goto('/');
  await expect.poll(() => themeAtFirstPaint).toBe('dungeon');
});

test('the print view stays plain black on white in dungeon mode', async ({ page }) => {
  await page.goto('/shopping');
  await toggle(page).click();
  await page.emulateMedia({ media: 'print' });
  expect(await luminance(page, 'body', 'backgroundColor')).toBeGreaterThan(0.95);
  expect(await luminance(page, 'h1', 'color')).toBeLessThan(0.05);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
});
