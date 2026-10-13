import { test, expect, type Page } from '@playwright/test';

const STUB = 'http://127.0.0.1:4180';
const CONTROL = 'http://127.0.0.1:4175';

interface NewMeal {
  name: string;
  ingredient?: string;
  quantity?: string;
  unit?: string;
  cook?: string;
  prep?: string;
  calories?: string;
  cost?: string;
}

async function fillMeal(page: Page, m: NewMeal) {
  await page.getByLabel('Name', { exact: true }).fill(m.name);
  await page.getByLabel('Ingredient name').first().fill(m.ingredient ?? 'Carrot');
  await page.getByLabel('Quantity').first().fill(m.quantity ?? '200');
  await page.getByLabel('Unit').first().selectOption(m.unit ?? 'g');
  await page.getByLabel('Cooking time (min)').fill(m.cook ?? '30');
  if (m.prep) await page.getByLabel('Preparation time (min)').fill(m.prep);
  if (m.calories) await page.getByLabel('Calories per serving').fill(m.calories);
  if (m.cost) await page.getByLabel('Total cost (EUR)').fill(m.cost);
}

async function addMeal(page: Page, m: NewMeal) {
  await page.goto('/meals/new');
  await fillMeal(page, m);
  await page.getByRole('button', { name: 'Save meal' }).click();
  await expect(page.getByTestId(`meal-row-${m.name}`).first()).toBeVisible();
}

async function importUrl(page: Page, path: string) {
  await page.goto('/import');
  await page.getByLabel('Recipe URL').fill(`${STUB}${path}`);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
}

const stub = (request: import('@playwright/test').APIRequestContext, body: object) =>
  request.post(`${STUB}/__control`, { data: body });

test.beforeEach(async ({ request }) => {
  await request.get(`${STUB}/__reset`);
});

test('J1 add a meal manually (AC-1, 2, 7, 11, 12, 14, 16, 20)', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Add meal' }).click();

  // AC-14, AC-12
  await expect(page.getByLabel('Base servings')).toHaveValue('4');
  await expect(page.getByLabel('Unit').first().getByRole('option')).toHaveText(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'pinch']);

  // AC-11: an empty form is refused with a message per missing field
  await page.getByRole('button', { name: 'Save meal' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /^Name is required\.$/ })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /^Ingredient name is required\.$/ })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /^Cooking time is required/ })).toBeVisible();
  await expect(page).toHaveURL(/\/meals\/new$/);

  // AC-1, AC-2, AC-16
  await fillMeal(page, { name: 'E2E Soup' });
  await page.getByRole('button', { name: 'Save meal' }).click();
  const soup = page.getByTestId('meal-row-E2E Soup');
  await expect(soup).toContainText('Calories: missing');
  await expect(soup).toContainText('Cost: missing');
  await expect(soup).toContainText('Prep 0 min');
  await expect(soup).toContainText('Cook 30 min');
  await expect(soup).toContainText('Total 30 min');
  await expect(soup).not.toContainText('Calories: 0');

  await addMeal(page, { name: 'E2E Stew', prep: '10', cook: '20', calories: '300', cost: '6.5' });
  const stew = page.getByTestId('meal-row-E2E Stew');
  await expect(stew).toContainText('Total 30 min');
  await expect(stew).toContainText('300 kcal per serving');
  await expect(stew).toContainText('6.50 EUR');

  // AC-20: same name -> warning, then "Save anyway"
  await page.goto('/meals/new');
  await fillMeal(page, { name: 'E2E Soup' });
  await page.getByRole('button', { name: 'Save meal' }).click();
  await expect(page.getByText(/meal with this name already exists/i)).toBeVisible();
  await page.getByRole('button', { name: 'Save anyway' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('meal-row-E2E Soup')).toHaveCount(2);

  // AC-7: survives a restart of the server on the same database file
  await request.post(`${CONTROL}/restart`);
  await page.reload();
  await expect(page.getByTestId('meal-row-E2E Stew')).toBeVisible();
  await expect(page.getByTestId('meal-row-E2E Soup')).toHaveCount(2);
});

test('J2 favourites (AC-3, 7)', async ({ page, request }) => {
  await addMeal(page, { name: 'E2E Fav' });
  await addMeal(page, { name: 'E2E Plain' });

  const star = page.getByRole('button', { name: 'Mark E2E Fav as favourite' });
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('checkbox', { name: 'Favourites only' }).check();
  await expect(page.getByTestId('meal-row-E2E Fav')).toBeVisible();
  await expect(page.getByTestId('meal-row-E2E Plain')).toHaveCount(0);

  await star.click(); // unmark inside the filtered view
  await expect(page.getByTestId('meal-row-E2E Fav')).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Favourites only' }).uncheck();
  await page.getByRole('button', { name: 'Mark E2E Fav as favourite' }).click();
  await request.post(`${CONTROL}/restart`);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mark E2E Fav as favourite' })).toHaveAttribute('aria-pressed', 'true');
});

test('J3 import with scraped estimates (AC-4, 5, 9, 10, 17, 19, 23, 24, 25)', async ({ page, request }) => {
  await importUrl(page, '/recipe-jsonld');
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review the imported recipe' })).toBeVisible();

  // AC-4: nothing is saved before the review
  const before = await (await request.get('/api/meals')).json();
  expect(before.map((m: { name: string }) => m.name)).not.toContain('Stub Pasta');

  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Stub Pasta');
  await expect(page.getByLabel('Ingredient name')).toHaveCount(3);
  await expect(page.getByLabel('Preparation time (min)')).toHaveValue('10');
  await expect(page.getByLabel('Cooking time (min)')).toHaveValue('20');
  await expect(page.getByLabel('Base servings')).toHaveValue('2');
  // AC-10, AC-24, AC-25: (200 g*3.5 + 400 g*0.2 + 15 g*8.8) / 2 = 456 kcal; 615 g at 2 EUR/kg = 1.23 EUR
  await expect(page.getByText('Estimate: 456 kcal per serving')).toBeVisible();
  await expect(page.getByText('Estimate: 1.23 EUR')).toBeVisible();

  await page.getByRole('button', { name: 'Accept calories estimate' }).click();
  await page.getByLabel('Total cost (EUR)').fill('7.50'); // overwrite: a plain value, not an estimate
  await expect(page.getByText(/Estimate: 1.23/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save meal' }).click();

  const row = page.getByTestId('meal-row-Stub Pasta');
  await expect(row).toContainText('456 kcal per serving');
  await expect(row).toContainText('7.50 EUR');
  await expect(row.getByText('estimated')).toHaveCount(1); // calories only (AC-19)
  await expect(row.getByRole('link', { name: 'Source' })).toHaveAttribute('href', `${STUB}/recipe-jsonld`); // AC-17

  // AC-19: editing the estimated value removes the marker
  await page.getByRole('link', { name: 'Edit Stub Pasta' }).click();
  await page.getByLabel('Calories per serving').fill('500');
  await page.getByRole('button', { name: 'Save meal' }).click();
  await expect(page.getByTestId('meal-row-Stub Pasta').getByText('estimated')).toHaveCount(0);
  await expect(page.getByTestId('meal-row-Stub Pasta')).toContainText('500 kcal per serving');

  // AC-9: a page without JSON-LD is parsed from the HTML
  await importUrl(page, '/recipe-html');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Kartoffelsuppe');
  await expect(page.getByLabel('Ingredient name')).toHaveCount(3);
  await expect(page.getByLabel('Ingredient name').first()).toHaveValue('Kartoffeln');

  // AC-23: no yield -> servings 4 marked for confirmation; AC-5: missing values are marked
  await importUrl(page, '/recipe-noyield');
  await expect(page.getByLabel('Base servings')).toHaveValue('4');
  await expect(page.getByText(/please confirm/i)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm servings' }).click();
  await expect(page.getByText(/please confirm/i)).toHaveCount(0);
  await expect(page.getByText('missing', { exact: true }).first()).toBeVisible();

  // AC-24: an ingredient without a match keeps calories missing instead of a guess
  await importUrl(page, '/recipe-unmatched');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Mystery Dish');
  await expect(page.getByText(/Estimate: .* kcal/)).toHaveCount(0);
  await expect(page.getByText(/Estimate: .* EUR/)).toHaveCount(0);
});

test('J3b scraping fails: import continues with missing values (AC-18)', async ({ page, request }) => {
  await stub(request, { nutrition: 'error', price: 'error' });
  await importUrl(page, '/recipe-jsonld');
  await expect(page.getByRole('heading', { name: 'Review the imported recipe' })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Stub Pasta');
  await expect(page.getByText(/Estimate:/)).toHaveCount(0);
  await expect(page.getByText('missing', { exact: true })).toHaveCount(2); // calories and cost

  await page.getByLabel('Name', { exact: true }).fill('E2E Manual Fill');
  await page.getByLabel('Calories per serving').fill('400');
  await page.getByLabel('Total cost (EUR)').fill('5');
  await page.getByRole('button', { name: 'Save meal' }).click();
  const row = page.getByTestId('meal-row-E2E Manual Fill');
  await expect(row).toContainText('400 kcal per serving');
  await expect(row.getByText('estimated')).toHaveCount(0);
});

test('J4 import fails (AC-6)', async ({ page, request }) => {
  const countBefore = (await (await request.get('/api/meals')).json()).length;

  await importUrl(page, '/not-a-recipe');
  await expect(page.getByRole('alert')).toContainText(/could not be imported/i);
  await expect(page.getByRole('alert')).toContainText(/no recipe was found/i);
  await expect(page.getByLabel('Recipe URL')).toBeEditable();

  await importUrl(page, '/unreachable');
  await expect(page.getByRole('alert')).toContainText(/could not be imported/i);

  expect((await (await request.get('/api/meals')).json()).length).toBe(countBefore);

  await page.getByRole('link', { name: 'Add meal manually' }).click();
  await expect(page.getByRole('heading', { name: 'Add meal' })).toBeVisible();
});

test('J5 edit and delete (AC-15)', async ({ page }) => {
  await addMeal(page, { name: 'E2E Edit', cook: '30' });
  await page.getByRole('button', { name: 'Mark E2E Edit as favourite' }).click();

  await page.getByRole('link', { name: 'Edit E2E Edit' }).click();
  await page.getByLabel('Name', { exact: true }).fill('E2E Edited');
  await page.getByLabel('Cooking time (min)').fill('45');
  await page.getByRole('button', { name: 'Save meal' }).click();
  await expect(page.getByTestId('meal-row-E2E Edited')).toContainText('Cook 45 min');
  await page.reload();
  await expect(page.getByTestId('meal-row-E2E Edited')).toContainText('Cook 45 min');

  // cancel keeps the meal
  await page.getByRole('button', { name: 'Delete E2E Edited' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('meal-row-E2E Edited')).toBeVisible();

  // confirm removes it, also from the favourites view
  await page.getByRole('button', { name: 'Delete E2E Edited' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete meal', exact: true }).click();
  await expect(page.getByTestId('meal-row-E2E Edited')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Favourites only' }).check();
  await expect(page.getByTestId('meal-row-E2E Edited')).toHaveCount(0);
});

test.describe('J3c 30-second deadline (AC-21)', () => {
  test.use({ baseURL: 'http://127.0.0.1:4174' });

  test('slow estimates are skipped when the deadline passes', async ({ page, request }) => {
    await stub(request, { nutrition: 'slow', price: 'slow', slowMs: 5000 });
    const started = Date.now();
    await importUrl(page, '/recipe-jsonld');
    await expect(page.getByRole('heading', { name: 'Review the imported recipe' })).toBeVisible({ timeout: 10_000 });
    expect(Date.now() - started).toBeLessThan(8_000); // deadline 2 s in this instance, not the 5 s stub delay
    await expect(page.getByText(/estimates were skipped/i)).toBeVisible();
    await expect(page.getByText(/Estimate:/)).toHaveCount(0);
    await expect(page.getByText('missing', { exact: true })).toHaveCount(2);
  });
});
