import { test, expect, request as pwRequest, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Interaction e2e: drag and drop planning, undo toasts, stat blocks, shopping progress and reduced motion.
 * The app runs with APP_FIXED_DATE=2026-10-14; this spec plans in the week of 2026-11-02 so it cannot clash with
 * the other specs. The meals it seeds are deleted again at the end. Nothing external is contacted.
 */
const BASE = 'http://127.0.0.1:4173';
const WEEK = '2026-11-02';
const TODAY = new Date('2026-10-14T09:00:00');

let api: APIRequestContext;
const ids: Record<string, number> = {};

async function seed(name: string, extra: Record<string, unknown> = {}) {
  const res = await api.post('/api/meals', {
    data: {
      name, baseServings: 4, prepMinutes: 10, cookMinutes: 20, caloriesPerServing: 750, totalCostEur: 9,
      ingredients: [{ name: `${name} herb`, quantity: 1, unit: 'pinch' }, { name: `${name} root`, quantity: 300, unit: 'g' }],
      ...extra,
    },
  });
  expect(res.status()).toBe(201);
  ids[name] = (await res.json()).id;
}

test.describe.configure({ mode: 'serial' });
// tall enough to show the whole week: a drag cannot end below the visible page
test.use({ viewport: { width: 1280, height: 1800 } });

test.beforeAll(async () => {
  api = await pwRequest.newContext({ baseURL: BASE });
  await seed('Dragon Stew');
  await seed('Goblin Pie');
  await seed('Troll Broth');
});

test.afterAll(async () => {
  // the "last servings" default is global: leave it as other specs expect it
  await api.put(`/api/plan/${WEEK}/days/1`, { data: { mealId: ids['Dragon Stew'], servings: 4 } });
  for (let day = 1; day <= 7; day++) await api.delete(`/api/plan/${WEEK}/days/${day}`);
  for (const id of Object.values(ids)) await api.delete(`/api/meals/${id}`);
  await api.dispose();
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  for (let day = 1; day <= 7; day++) await api.delete(`/api/plan/${WEEK}/days/${day}`);
});

const day = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
/**
 * Drags with real mouse events. Locator.dragTo jumps straight to the target, which Chromium does not always
 * treat as the start of a drag; a small first move over the drag threshold does.
 */
async function drag(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + 6, from.y + 6);
  await page.mouse.down();
  await page.mouse.move(from.x + 16, from.y + 16, { steps: 3 });
  await page.mouse.move(to.x + 24, to.y + 12, { steps: 12 });
  await page.mouse.up();
}

const open = (page: Page) => page.goto(`/plan?week=${WEEK}`);

test('a meal dragged from the pantry onto an empty day is planned, and Undo takes it back', async ({ page }) => {
  await open(page);
  await expect(day(page, 'Thursday')).toContainText('Nothing planned');
  await drag(page, page.getByTestId('pantry-Dragon Stew'), day(page, 'Thursday'));
  await expect(day(page, 'Thursday')).toContainText('Dragon Stew');
  await expect(page.getByText('Dragon Stew planned for Thursday')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(day(page, 'Thursday')).toContainText('Nothing planned');
});

test('a planned meal dragged onto an empty day moves; onto another meal it swaps', async ({ page }) => {
  await api.put(`/api/plan/${WEEK}/days/1`, { data: { mealId: ids['Dragon Stew'], servings: 4 } });
  await api.put(`/api/plan/${WEEK}/days/3`, { data: { mealId: ids['Goblin Pie'], servings: 2 } });
  await open(page);

  await drag(page, day(page, 'Monday').getByTestId('drag-handle'), day(page, 'Friday'));
  await expect(day(page, 'Friday')).toContainText('Dragon Stew');
  await expect(day(page, 'Monday')).toContainText('Nothing planned');
  await expect(page.getByText('Dragon Stew moved to Friday')).toBeVisible();

  await drag(page, day(page, 'Friday').getByTestId('drag-handle'), day(page, 'Wednesday'));
  await expect(day(page, 'Wednesday')).toContainText('Dragon Stew');
  await expect(day(page, 'Friday')).toContainText('Goblin Pie');
  await expect(day(page, 'Friday')).toContainText('2 servings'); // servings travel with the meal
  await expect(page.getByText('Dragon Stew and Goblin Pie swapped')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(day(page, 'Friday')).toContainText('Dragon Stew');
  await expect(day(page, 'Wednesday')).toContainText('Goblin Pie');
});

test('without a mouse: "Move to day" moves a planned meal', async ({ page }) => {
  await api.put(`/api/plan/${WEEK}/days/2`, { data: { mealId: ids['Troll Broth'], servings: 4 } });
  await open(page);
  await day(page, 'Tuesday').getByLabel('Move to day').selectOption('Sunday');
  await expect(day(page, 'Sunday')).toContainText('Troll Broth');
  await expect(day(page, 'Tuesday')).toContainText('Nothing planned');
});

test('removing a meal can be undone', async ({ page }) => {
  await api.put(`/api/plan/${WEEK}/days/2`, { data: { mealId: ids['Troll Broth'], servings: 6 } });
  await open(page);
  await day(page, 'Tuesday').getByRole('button', { name: 'Remove' }).click();
  await expect(day(page, 'Tuesday')).toContainText('Nothing planned');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(day(page, 'Tuesday')).toContainText('Troll Broth');
  await expect(day(page, 'Tuesday')).toContainText('6 servings');
});

test('a meal that is planned already is not planned twice', async ({ page }) => {
  await api.put(`/api/plan/${WEEK}/days/1`, { data: { mealId: ids['Dragon Stew'], servings: 4 } });
  await open(page);
  await drag(page, page.getByTestId('pantry-Dragon Stew'), day(page, 'Saturday'));
  await expect(page.getByText("'Dragon Stew' is already planned on Monday this week.")).toBeVisible();
  await expect(day(page, 'Saturday')).toContainText('Nothing planned');
});

test('the library shows a meal as a stat block with a calorie meter and its ingredients as loot', async ({ page }) => {
  await page.goto('/');
  const row = page.getByTestId('meal-row-Dragon Stew');
  await expect(row.locator('.stat')).toHaveCount(4);
  await expect(row.locator('.meter')).toHaveCSS('--pct', '75%');
  await expect(row.getByRole('list', { name: 'Ingredients' })).toContainText('Dragon Stew root');
});

test('the shopping list shows how much is in the bag and celebrates when it is full', async ({ page }) => {
  await api.put(`/api/plan/${WEEK}/days/1`, { data: { mealId: ids['Goblin Pie'], servings: 4 } });
  await page.goto(`/shopping?week=${WEEK}`);
  const bar = page.getByRole('progressbar', { name: 'Items in the bag' });
  await expect(bar).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByText('0 of 2 items in the bag')).toBeVisible();
  await page.getByRole('checkbox', { name: /Goblin Pie herb/ }).check();
  await expect(page.getByText('1 of 2 items in the bag')).toBeVisible();
  await expect(page.getByText(/all provisions gathered/i)).toBeHidden();
  await page.getByRole('checkbox', { name: /Goblin Pie root/ }).check();
  await expect(page.getByText('2 of 2 items in the bag')).toBeVisible();
  await expect(page.getByText(/all provisions gathered/i)).toBeVisible();
});

test('animations run by default and are switched off when the system asks for reduced motion', async ({ page }) => {
  await api.put(`/api/plan/${WEEK}/days/2`, { data: { mealId: ids['Troll Broth'], servings: 4 } });
  await open(page);
  await day(page, 'Tuesday').getByRole('button', { name: 'Remove' }).click();
  const toast = page.locator('.toast').first();
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((el) => getComputedStyle(el).animationName)).toBe('toast-in');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Undo' }).click(); // brings the meal back
  await day(page, 'Tuesday').getByRole('button', { name: 'Remove' }).click();
  const calm = page.locator('.toast').first();
  await expect(calm).toBeVisible();
  expect(await calm.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});
