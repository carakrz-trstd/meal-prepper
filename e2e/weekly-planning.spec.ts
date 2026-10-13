import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Epic 2 e2e: weekly plan and shopping list. The app runs with APP_FIXED_DATE=2026-10-14 (a Wednesday), so the
 * current week starts on Monday 2026-10-12. Meals are seeded through the Epic 1 API; nothing external is contacted.
 */
const BASE = 'http://127.0.0.1:4173';
const CONTROL = 'http://127.0.0.1:4175';
const THIS_WEEK = '2026-10-12';
const NEXT_WEEK = '2026-10-19';
const TODAY = new Date('2026-10-14T09:00:00');

let api: APIRequestContext;
const ids: Record<string, number> = {};

type NewMeal = {
  name: string; baseServings: number; cookMinutes: number; prepMinutes?: number;
  caloriesPerServing?: number; totalCostEur?: number;
  ingredients: { name: string; quantity: number; unit: string }[];
};

async function seed(meal: NewMeal, favourite = false) {
  const res = await api.post('/api/meals', { data: meal });
  expect(res.status()).toBe(201);
  const created = await res.json();
  if (favourite) await api.put(`/api/meals/${created.id}/favourite`, { data: { value: true } });
  ids[meal.name] = created.id;
}

const plan = (week: string, day: number, name: string, servings: number) =>
  api.put(`/api/plan/${week}/days/${day}`, { data: { mealId: ids[name], servings } });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  api = await pwRequest.newContext({ baseURL: BASE });
  await seed({
    name: 'Pasta Bolognese', baseServings: 4, prepMinutes: 10, cookMinutes: 25, caloriesPerServing: 600, totalCostEur: 8,
    ingredients: [{ name: 'Spaghetti', quantity: 400, unit: 'g' }, { name: 'Onion', quantity: 2, unit: 'piece' }, { name: 'Olive oil', quantity: 2, unit: 'tbsp' }],
  });
  await seed({
    name: 'Onion Soup', baseServings: 2, cookMinutes: 30,
    ingredients: [{ name: 'Onion', quantity: 3, unit: 'piece' }, { name: 'Olive oil', quantity: 1, unit: 'tbsp' }, { name: 'Spaghetti', quantity: 0.2, unit: 'kg' }],
  });
  await seed(
    {
      name: 'Pancakes', baseServings: 4, cookMinutes: 20, caloriesPerServing: 400, totalCostEur: 4,
      ingredients: [{ name: 'Flour', quantity: 500, unit: 'g' }, { name: 'Milk', quantity: 500, unit: 'ml' }],
    },
    true,
  );
  await seed({
    name: 'Milk Rice', baseServings: 2, cookMinutes: 40,
    ingredients: [{ name: 'Milk', quantity: 1, unit: 'piece' }, { name: 'Rice', quantity: 200, unit: 'g' }],
  });
});

test.afterAll(async () => {
  await api.dispose();
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  // reset the plan of the weeks used by these tests
  for (const week of [THIS_WEEK, NEXT_WEEK, '2026-10-26']) {
    for (let day = 1; day <= 7; day++) await api.delete(`/api/plan/${week}/days/${day}`);
  }
});

const day = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const picker = (page: Page) => page.getByRole('dialog', { name: 'Choose a meal' });
// match the entry by its exact name (the sources line of other entries may mention e.g. "Onion Soup")
const listItem = (page: Page, name: string) =>
  page
    .getByRole('list', { name: 'Shopping list' })
    .getByRole('listitem')
    .filter({ has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) });

async function planViaUi(page: Page, dayName: string, meal: string, servings?: string) {
  await day(page, dayName).getByRole('button', { name: `Plan meal for ${dayName}` }).click();
  await picker(page).getByRole('button', { name: meal, exact: true }).click();
  if (servings) await picker(page).getByLabel('Servings').fill(servings);
  await picker(page).getByRole('button', { name: 'Add to plan' }).click();
  await expect(picker(page)).toHaveCount(0);
}

test('J1 plan a meal (AC-1, 11, 12, 15, 23, 25)', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Week of 12 Oct 2026' })).toBeVisible();
  for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    await expect(day(page, d)).toContainText('Nothing planned');
  }
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeDisabled();

  await day(page, 'Wednesday').getByRole('button', { name: 'Plan meal for Wednesday' }).click();
  const dialog = picker(page);
  await dialog.getByLabel('Search meals').fill('past');
  await expect(dialog.getByRole('button', { name: 'Pasta Bolognese', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Pancakes', exact: true })).toHaveCount(0);
  await dialog.getByLabel('Search meals').fill('');
  await dialog.getByLabel('Favourites only').check();
  await expect(dialog.getByRole('button', { name: 'Pancakes', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Pasta Bolognese', exact: true })).toHaveCount(0);
  await dialog.getByLabel('Favourites only').uncheck();

  await dialog.getByRole('button', { name: 'Pasta Bolognese', exact: true }).click();
  await expect(dialog.getByLabel('Servings')).toHaveValue('4'); // AC-15: initially 4
  await dialog.getByLabel('Servings').fill('6');
  await dialog.getByRole('button', { name: 'Add to plan' }).click();

  const wed = day(page, 'Wednesday');
  await expect(wed).toContainText('Pasta Bolognese');
  await expect(wed).toContainText('6 servings');
  await expect(wed).toContainText('600 kcal per serving');
  await expect(wed).toContainText('12 EUR'); // 8 EUR x 6 / 4
  await expect(wed).toContainText('35 min');

  // AC-15: the servings of the previous meal are pre-filled; AC-23: missing values are shown as missing
  await day(page, 'Friday').getByRole('button', { name: 'Plan meal for Friday' }).click();
  await picker(page).getByRole('button', { name: 'Onion Soup', exact: true }).click();
  await expect(picker(page).getByLabel('Servings')).toHaveValue('6');
  await picker(page).getByRole('button', { name: 'Add to plan' }).click();
  await expect(day(page, 'Friday')).toContainText('calories: missing');
  await expect(day(page, 'Friday')).toContainText('cost: missing');

  // AC-25: meals already planned this week are marked
  await day(page, 'Monday').getByRole('button', { name: 'Plan meal for Monday' }).click();
  await expect(picker(page).getByTestId('picker-meal-Pasta Bolognese')).toContainText('Planned this week');
  await expect(picker(page).getByTestId('picker-meal-Onion Soup')).toContainText('Planned this week');
  await expect(picker(page).getByTestId('picker-meal-Pancakes')).not.toContainText('Planned this week');
  await picker(page).getByRole('button', { name: 'Cancel' }).click();

  // AC-12: days without a meal stay empty
  for (const d of ['Monday', 'Tuesday', 'Thursday', 'Saturday', 'Sunday']) {
    await expect(day(page, d)).toContainText('Nothing planned');
  }
});

test('J2 a meal cannot repeat within a week, but in another week (AC-3, 4)', async ({ page }) => {
  await plan(THIS_WEEK, 3, 'Pasta Bolognese', 4);
  await page.goto('/plan');

  await day(page, 'Thursday').getByRole('button', { name: 'Plan meal for Thursday' }).click();
  await picker(page).getByRole('button', { name: 'Pasta Bolognese', exact: true }).click();
  await expect(picker(page).getByRole('alert')).toContainText(/already planned on Wednesday this week/i);
  await picker(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(day(page, 'Thursday')).toContainText('Nothing planned');

  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByRole('heading', { name: 'Week of 19 Oct 2026' })).toBeVisible();
  await planViaUi(page, 'Monday', 'Pasta Bolognese', '2');
  await expect(day(page, 'Monday')).toContainText('Pasta Bolognese');
  await expect(day(page, 'Monday')).toContainText('2 servings');

  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(day(page, 'Wednesday')).toContainText('Pasta Bolognese');
});

test('J2b servings must be a whole number from 1 to 20 (AC-5, 20)', async ({ page }) => {
  await page.goto('/plan');
  await day(page, 'Monday').getByRole('button', { name: 'Plan meal for Monday' }).click();
  await picker(page).getByRole('button', { name: 'Pancakes', exact: true }).click();
  for (const bad of ['0', '21', '2.5', '']) {
    await picker(page).getByLabel('Servings').fill(bad);
    await picker(page).getByRole('button', { name: 'Add to plan' }).click();
    await expect(picker(page).getByRole('alert')).toContainText('Servings must be a whole number from 1 to 20');
  }
  await expect(day(page, 'Monday')).toContainText('Nothing planned');
  await picker(page).getByLabel('Servings').fill('20');
  await picker(page).getByRole('button', { name: 'Add to plan' }).click();
  await expect(day(page, 'Monday')).toContainText('20 servings');
});

test('J3 change the plan; the list follows (AC-2, 8, 13)', async ({ page }) => {
  await plan(THIS_WEEK, 1, 'Pasta Bolognese', 4); // Monday = a past day of the current week (AC-13)

  await page.goto('/shopping');
  await expect(listItem(page, 'Spaghetti')).toContainText('400 g');

  await page.goto('/plan');
  const mon = day(page, 'Monday');
  await mon.getByRole('button', { name: 'Change servings' }).click();
  await mon.getByLabel('Servings').fill('8');
  await mon.getByRole('button', { name: 'Save servings' }).click();
  await expect(mon).toContainText('8 servings');
  await page.getByRole('link', { name: 'Shopping list', exact: true }).first().click();
  await expect(listItem(page, 'Spaghetti')).toContainText('800 g');

  await page.goto('/plan');
  await mon.getByRole('button', { name: 'Replace meal' }).click();
  await picker(page).getByRole('button', { name: 'Pancakes', exact: true }).click();
  await picker(page).getByLabel('Servings').fill('4');
  await picker(page).getByRole('button', { name: 'Continue' }).click();
  await expect(picker(page)).toContainText("Replace 'Pasta Bolognese' with 'Pancakes'?");
  await picker(page).getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(mon).toContainText('Pancakes');
  await expect(mon).not.toContainText('Pasta Bolognese');

  await page.goto('/shopping');
  await expect(listItem(page, 'Flour')).toContainText('500 g');
  await expect(listItem(page, 'Milk')).toContainText('500 ml');
  await expect(listItem(page, 'Spaghetti')).toHaveCount(0);

  await page.goto('/plan');
  await mon.getByRole('button', { name: 'Remove' }).click();
  await expect(mon).toContainText('Nothing planned');
  await page.goto('/shopping');
  await expect(page.getByText(/No meals are planned for this week/i)).toBeVisible();
});

test('J4 shopping list: merged, scaled, ticked, copied, printed (AC-6, 7, 10, 14, 16, 19, 21, 22, 24; NFR-1)', async ({ page, browser, context }) => {
  await plan(THIS_WEEK, 1, 'Pasta Bolognese', 4);
  await plan(THIS_WEEK, 2, 'Onion Soup', 4);
  await plan(THIS_WEEK, 3, 'Milk Rice', 2);
  await plan(THIS_WEEK, 4, 'Pancakes', 4);

  await page.goto('/shopping');
  const items = page.getByRole('list', { name: 'Shopping list' }).getByRole('listitem');
  await expect(items).toHaveCount(7);
  const texts = await items.allTextContents();
  const order = ['Flour', 'Milk', 'Milk', 'Olive oil', 'Onion', 'Rice', 'Spaghetti'];
  order.forEach((name, i) => expect(texts[i]).toContain(name));
  expect(texts[1]).toContain('500 ml'); // Milk (volume) before Milk (piece)
  expect(texts[2]).toContain('1 piece');

  await expect(listItem(page, 'Spaghetti')).toContainText('800 g'); // 400 g + 0.4 kg
  await expect(listItem(page, 'Onion')).toContainText('8 piece');
  await expect(listItem(page, 'Olive oil')).toContainText('4 tbsp'); // 6 tsp + 6 tsp
  await expect(listItem(page, 'Rice')).toContainText('200 g');
  await expect(listItem(page, 'Spaghetti')).toContainText('Mon Pasta Bolognese, Tue Onion Soup');

  // AC-16: ticks persist on the server (a fresh browser context sees them)
  await listItem(page, 'Spaghetti').getByRole('checkbox').check();
  await expect(listItem(page, 'Spaghetti').getByRole('checkbox')).toBeChecked();
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await page2.clock.setFixedTime(TODAY);
  await page2.goto(`${BASE}/shopping`);
  await expect(listItem(page2, 'Spaghetti').getByRole('checkbox')).toBeChecked();
  await other.close();

  // AC-19: lower need keeps the tick, a higher need clears it
  await api.patch(`/api/plan/${THIS_WEEK}/days/1`, { data: { servings: 2 } }); // 200 + 400 = 600 g
  await page.reload();
  await expect(listItem(page, 'Spaghetti')).toContainText('600 g');
  await expect(listItem(page, 'Spaghetti').getByRole('checkbox')).toBeChecked();
  await api.patch(`/api/plan/${THIS_WEEK}/days/1`, { data: { servings: 8 } }); // 800 + 400 = 1200 g
  await page.reload();
  await expect(listItem(page, 'Spaghetti')).toContainText('1.2 kg');
  await expect(listItem(page, 'Spaghetti').getByRole('checkbox')).not.toBeChecked();

  await api.delete(`/api/plan/${THIS_WEEK}/days/2`); // Onion Soup removed
  await page.reload();
  await expect(listItem(page, 'Onion')).toContainText('4 piece');
  await expect(listItem(page, 'Spaghetti')).toContainText('800 g');

  // AC-22: copy as text
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.getByRole('button', { name: 'Copy as text' }).click();
  await expect(page.getByRole('status')).toContainText('Copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // the Windows clipboard returns CRLF line breaks, the app itself writes "\n"
  expect(copied.split(/\r?\n/)).toEqual(expect.arrayContaining(['800 g Spaghetti', '4 piece Onion']));

  // AC-22: the print view hides navigation and buttons but keeps the list
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Copy as text' })).toBeHidden();
  await expect(page.getByRole('list', { name: 'Shopping list' })).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  // NFR-1: usable while shopping (readable text size, large tap targets)
  const row = listItem(page, 'Rice');
  const size = await row.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const box = await row.boundingBox();
  expect(size).toBeGreaterThanOrEqual(16);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('J4b an empty week shows an empty state with a link to the plan (AC-26)', async ({ page }) => {
  await page.goto(`/shopping?week=${NEXT_WEEK}`);
  await expect(page.getByText(/No meals are planned for this week/i)).toBeVisible();
  await page.getByRole('link', { name: 'Go to the plan' }).click();
  await expect(page).toHaveURL(new RegExp(`/plan\\?week=${NEXT_WEEK}$`));
  await expect(page.getByRole('heading', { name: 'Week of 19 Oct 2026' })).toBeVisible();
});

test('J5 edit and delete a planned meal (AC-17, 18)', async ({ page }) => {
  await seed({
    name: 'Pancakes To Delete', baseServings: 4, cookMinutes: 20,
    ingredients: [{ name: 'Flour', quantity: 500, unit: 'g' }],
  });
  await plan(THIS_WEEK, 1, 'Pancakes To Delete', 4);

  // AC-17: an edit in the meal library flows into the shopping list
  await page.goto('/');
  await page.getByRole('link', { name: 'Edit Pancakes To Delete' }).click();
  await page.getByLabel('Quantity').first().fill('750');
  await page.getByRole('button', { name: 'Save meal' }).click();
  await page.goto('/shopping');
  await expect(listItem(page, 'Flour')).toContainText('750 g');

  // AC-18: the delete confirmation mentions the plan; cancel keeps everything
  await page.goto('/');
  await page.getByRole('button', { name: 'Delete Pancakes To Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(/planned/i);
  await expect(dialog).toContainText(/removed from the plan/i);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('meal-row-Pancakes To Delete')).toBeVisible();
  await page.goto('/plan');
  await expect(day(page, 'Monday')).toContainText('Pancakes To Delete');

  // confirm: the meal is gone from the library, the plan and the list
  await page.goto('/');
  await page.getByRole('button', { name: 'Delete Pancakes To Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete meal', exact: true }).click();
  await expect(page.getByTestId('meal-row-Pancakes To Delete')).toHaveCount(0);
  await page.goto('/plan');
  await expect(day(page, 'Monday')).toContainText('Nothing planned');
  await page.goto('/shopping');
  await expect(page.getByText(/No meals are planned for this week/i)).toBeVisible();
});

test('J6 the plan and the ticks survive a server restart (AC-9, 16)', async ({ page }) => {
  await plan(THIS_WEEK, 5, 'Pancakes', 3);
  await page.goto('/shopping');
  await listItem(page, 'Flour').getByRole('checkbox').check();
  await expect(listItem(page, 'Flour').getByRole('checkbox')).toBeChecked();

  expect((await (await pwRequest.newContext()).post(`${CONTROL}/restart`)).ok()).toBe(true);

  await page.goto('/plan');
  await expect(day(page, 'Friday')).toContainText('Pancakes');
  await expect(day(page, 'Friday')).toContainText('3 servings');
  await page.goto('/shopping');
  await expect(listItem(page, 'Flour').getByRole('checkbox')).toBeChecked();
});

test('J7 past weeks cannot be opened (AC-11)', async ({ page }) => {
  await page.goto('/plan?week=2026-10-05');
  await expect(page.getByRole('heading', { name: 'Week of 12 Oct 2026' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeDisabled();
  const past = await api.get('/api/plan/2026-10-05');
  expect(past.status()).toBe(400);
});
