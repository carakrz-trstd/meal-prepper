import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Epic 3 e2e: suggestions within limits, blacklist, participants, dietary checks and the online search.
 * The app runs with APP_FIXED_DATE=2026-10-14 (current week starts Monday 2026-10-12). Google, allrecipes.com and
 * the recipe pages are served by the local stub server (e2e/stub-server.ts); no real website is contacted.
 */
const BASE = 'http://127.0.0.1:4173';
const SHORT_DEADLINE_BASE = 'http://127.0.0.1:4174'; // second app instance: ONLINE_SEARCH_DEADLINE_MS=2000
const STUB = 'http://127.0.0.1:4180';
const THIS_WEEK = '2026-10-12';
const TODAY = new Date('2026-10-14T09:00:00');

test.describe.configure({ mode: 'serial' });

let api: APIRequestContext;
let stub: APIRequestContext;

type Ing = { name: string; quantity: number; unit: string };
const ing = (...names: string[]): Ing[] => names.map((name) => ({ name, quantity: 100, unit: 'g' }));

interface SeedMeal {
  name: string; ingredients: Ing[]; caloriesPerServing?: number; totalCostEur?: number;
  prepMinutes?: number; cookMinutes: number; favourite?: boolean; sourceUrl?: string;
}

async function seed(client: APIRequestContext, m: SeedMeal): Promise<number> {
  const { favourite, ...body } = m;
  const res = await client.post('/api/meals', { data: { baseServings: 4, ...body } });
  expect(res.status(), await res.text()).toBe(201);
  const id = (await res.json()).id as number;
  if (favourite) await client.put(`/api/meals/${id}/favourite`, { data: { value: true } });
  return id;
}

/** The standard library of the suggestion tests (limits are chosen so that the expectations below hold). */
const LIBRARY: SeedMeal[] = [
  { name: 'Chicken Curry', ingredients: ing('Chicken'), caloriesPerServing: 450, totalCostEur: 12, prepMinutes: 25, cookMinutes: 20 },
  { name: 'Veggie Pasta', ingredients: ing('Pasta', 'Tomato'), caloriesPerServing: 520, totalCostEur: 8, prepMinutes: 10, cookMinutes: 15, favourite: true },
  { name: 'Lentil Soup', ingredients: ing('Lentils', 'Carrot'), caloriesPerServing: 300, totalCostEur: 6, prepMinutes: 10, cookMinutes: 30 },
  { name: 'Mystery Stew', ingredients: ing('Dragon fruit'), caloriesPerServing: 400, totalCostEur: 9, prepMinutes: 10, cookMinutes: 20 },
  { name: 'No Cost Salad', ingredients: ing('Lettuce'), caloriesPerServing: 200, prepMinutes: 0, cookMinutes: 15 },
  { name: 'Nutty Bar', ingredients: ing('Mixed nuts'), caloriesPerServing: 350, totalCostEur: 5, prepMinutes: 0, cookMinutes: 5 },
];

async function wipe(client: APIRequestContext) {
  for (const week of [THIS_WEEK, '2026-10-19', '2026-10-26']) for (let d = 1; d <= 7; d++) await client.delete(`/api/plan/${week}/days/${d}`);
  for (const m of await (await client.get('/api/meals')).json()) await client.delete(`/api/meals/${m.id}`);
  for (const p of await (await client.get('/api/participants')).json()) await client.delete(`/api/participants/${p.id}`);
  for (const b of await (await client.get('/api/blacklist')).json()) await client.delete(`/api/blacklist/${b.id}`);
  await client.put('/api/suggestion-prefs', { data: { calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [] } });
  // the last used servings are an app setting; forget them so that other specs start from the default
  if (client === api) await (await pwRequest.newContext()).post('http://127.0.0.1:4175/reset-settings');
}

const control = (body: object) => stub.post('/__control', { data: body });
const counts = async () => (await stub.get('/__counts')).json() as Promise<{ google: number; allrecipes: number; recipePages: number; fetched: string[] }>;

test.beforeAll(async () => {
  api = await pwRequest.newContext({ baseURL: BASE });
  stub = await pwRequest.newContext({ baseURL: STUB });
});
test.afterAll(async () => {
  await wipe(api);
  await api.dispose();
  await stub.dispose();
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await stub.get('/__reset');
  await wipe(api);
});

// ---- helpers for the UI ----
const day = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const picker = (page: Page) => page.getByRole('dialog', { name: 'Choose a meal' });

async function openSuggest(page: Page, dayName = 'Thursday') {
  await page.goto('/plan');
  await day(page, dayName).getByRole('button', { name: `Plan meal for ${dayName}` }).click();
  await picker(page).getByRole('button', { name: 'Suggest a meal' }).click();
}
const showSuggestion = (page: Page) => picker(page).getByRole('button', { name: 'Show suggestion' }).click();
const card = (page: Page) => picker(page).getByTestId('suggestion-card');
const another = (page: Page) => picker(page).getByRole('button', { name: 'Another suggestion' });

/** Walks through all suggestions with "Another suggestion" and returns their names in order. */
async function walk(page: Page): Promise<string[]> {
  const names: string[] = [];
  await expect(card(page)).toBeVisible();
  for (let i = 0; i < 30; i++) {
    names.push((await card(page).getByRole('heading').innerText()).trim());
    if (await another(page).isDisabled()) break;
    await another(page).click();
  }
  return names;
}

test('J1 suggestion within limits, checked against the ticked participants (AC-1, 2, 4, 5, 9, 14, 21, 26)', async ({ page }) => {
  await seedAll();
  const anna = await (await api.post('/api/participants', { data: { name: 'Anna', restrictions: ['vegetarian'] } })).json();

  await openSuggest(page);
  const dialog = picker(page);
  await dialog.getByLabel('Calorie limit').fill('500');
  await dialog.getByLabel('Cooking time limit (min)').fill('45');
  await dialog.getByLabel('Anna').check();
  await expect(dialog.getByLabel('Servings')).toHaveValue('1'); // AC-15: the number ticked
  await showSuggestion(page);

  // Anna is vegetarian: no chicken; limits: <= 500 kcal and <= 45 min: no Veggie Pasta (520 kcal);
  // verified meals first (by name), then meals with ingredients that cannot be checked (flagged, AC-9)
  const sequence = await walk(page);
  expect(sequence).toEqual(['Lentil Soup', 'No Cost Salad', 'Mystery Stew', 'Nutty Bar']);
  await expect(card(page)).toContainText(/could not verify against the restrictions/i);
  await expect(card(page)).toContainText('Mixed nuts');
  await expect(dialog.getByText(/no more library matches/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Search online' })).toBeEnabled();

  // AC-12: a meal without cost is excluded as soon as a budget limit is set; nothing is left at 1 EUR (AC-5)
  await dialog.getByLabel('Budget limit (EUR)').fill('1');
  await showSuggestion(page);
  await expect(dialog.getByText(/No meal matches/)).toBeVisible();
  await expect(dialog.getByText(/calories: at most 500 kcal/)).toBeVisible();
  await expect(dialog.getByText(/budget: at most 1 EUR/)).toBeVisible();
  await expect(dialog.getByText(/time: at most 45 min/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Plan this meal' })).toHaveCount(0);

  // AC-26: the last request is pre-filled next time, "Clear" empties it
  await page.reload();
  await day(page, 'Thursday').getByRole('button', { name: 'Plan meal for Thursday' }).click();
  await picker(page).getByRole('button', { name: 'Suggest a meal' }).click();
  await expect(picker(page).getByLabel('Calorie limit')).toHaveValue('500');
  await expect(picker(page).getByLabel('Budget limit (EUR)')).toHaveValue('1');
  await expect(picker(page).getByLabel('Cooking time limit (min)')).toHaveValue('45');
  await expect(picker(page).getByLabel('Anna')).toBeChecked();
  await picker(page).getByRole('button', { name: 'Clear' }).click();
  await expect(picker(page).getByLabel('Calorie limit')).toHaveValue('');
  await expect(picker(page).getByLabel('Anna')).not.toBeChecked();
  void anna;
});

test('J1b the budget is scaled to the servings, planned meals are skipped, a suggestion can be planned (AC-2, 14, 15)', async ({ page }) => {
  const lentil = await seed(api, LIBRARY[2]); // 6 EUR for 4 servings
  await seed(api, LIBRARY[4]);
  await api.put(`/api/plan/${THIS_WEEK}/days/1`, { data: { mealId: lentil, servings: 2 } });

  await openSuggest(page);
  await picker(page).getByLabel('Servings').fill('2');
  await showSuggestion(page);
  expect(await walk(page)).toEqual(['No Cost Salad']); // Lentil Soup is already planned this week

  await picker(page).getByRole('button', { name: 'Clear' }).click();
  await picker(page).getByLabel('Budget limit (EUR)').fill('3');
  await picker(page).getByLabel('Servings').fill('2');
  await showSuggestion(page);
  await expect(picker(page).getByText(/No meal matches/)).toBeVisible(); // no cost for the salad; the soup is planned

  await picker(page).getByLabel('Budget limit (EUR)').fill('');
  await showSuggestion(page);
  await card(page).getByRole('button', { name: 'Plan this meal' }).click();
  await expect(picker(page).getByLabel('Servings')).toHaveValue('2');
  await picker(page).getByRole('button', { name: 'Add to plan' }).click();
  await expect(day(page, 'Thursday')).toContainText('No Cost Salad');
});

test('J2 online search: only on request, checked, deduplicated, reviewed and saved (AC-16, 17, 18, 23, 24)', async ({ page }) => {
  await seed(api, { name: 'Imported Chili', ingredients: ing('Beans'), caloriesPerServing: 400, totalCostEur: 4, prepMinutes: 5, cookMinutes: 20, sourceUrl: `${STUB}/r/online-dup` });
  await api.post('/api/blacklist', { data: { term: 'nuts' } });
  await control({ stagger: 150 });

  await openSuggest(page);
  await picker(page).getByLabel('Calorie limit').fill('600');
  await showSuggestion(page);
  await expect(card(page).getByRole('heading')).toHaveText('Imported Chili');
  expect((await counts()).google).toBe(0); // AC-16: nothing is requested without the click

  await picker(page).getByRole('button', { name: 'Search online' }).click();
  await expect(picker(page).getByRole('status')).toContainText(/searching online/i);
  await expect(picker(page).getByRole('status')).toHaveCount(0, { timeout: 15_000 }); // search finished

  // library match first, then the online matches that passed the checks (not the duplicate, the unparsable page, the nutty one)
  const sequence = await walk(page);
  expect(sequence[0]).toBe('Imported Chili');
  expect(sequence.slice(1).sort()).toEqual(['Online Lentil Bowl', 'Online Pasta Bake', 'Online Veggie Stew']);
  const c = await counts();
  expect(c.google).toBe(1);
  expect(c.fetched).not.toContain('/r/online-dup'); // AC-23: a recipe already in the library is never fetched
  expect(c.fetched.length).toBeLessThanOrEqual(5); // at most 5 result pages are imported

  // pick the online recipe that is shown last: Epic 1 review form, saved to the library, then planned
  const picked = sequence[sequence.length - 1];
  const known: Record<string, { calories: string; cost: string; url: string }> = {
    'Online Lentil Bowl': { calories: '300', cost: '6', url: `${STUB}/r/online-lentil` },
    'Online Pasta Bake': { calories: '520', cost: '8', url: `${STUB}/r/online-pasta` },
    'Online Veggie Stew': { calories: '350', cost: '5', url: `${STUB}/r/online-extra` },
  };
  await expect(card(page)).toContainText('From the web');
  await card(page).getByRole('button', { name: 'Plan this meal' }).click();
  await expect(picker(page).getByRole('heading', { name: 'Review the online recipe' })).toBeVisible();
  await expect(picker(page).getByLabel('Name', { exact: true })).toHaveValue(picked);
  await expect(picker(page).getByLabel('Calories per serving')).toHaveValue(known[picked].calories);
  await expect(picker(page).getByLabel('Total cost (EUR)')).toHaveValue(known[picked].cost);
  let library: { name: string; sourceUrl: string | null }[] = await (await api.get('/api/meals')).json();
  expect(library.map((m) => m.name)).not.toContain(picked); // nothing saved before the review

  await picker(page).getByRole('button', { name: 'Save meal' }).click();
  await picker(page).getByRole('button', { name: 'Add to plan' }).click();
  await expect(day(page, 'Thursday')).toContainText(picked);
  library = await (await api.get('/api/meals')).json();
  expect(library.find((m) => m.name === picked)?.sourceUrl).toBe(known[picked].url);
});

test('J2b Google blocks -> allrecipes.com is used without user action (AC-27)', async ({ page }) => {
  await control({ google: 'captcha' });
  await openSuggest(page);
  await showSuggestion(page); // empty library
  await expect(picker(page).getByText(/No meal matches/)).toBeVisible();
  await picker(page).getByRole('button', { name: 'Search online' }).click();
  await expect(card(page).getByRole('heading')).toContainText(/Allrecipes/, { timeout: 15_000 });
  await expect(picker(page).getByRole('status')).toHaveCount(0, { timeout: 15_000 });
  expect((await walk(page)).sort()).toEqual(['Allrecipes Bowl', 'Allrecipes Stew']);
  const c = await counts();
  expect(c.google).toBe(1);
  expect(c.allrecipes).toBe(1);
});

test('J2c both sources fail: a message, the library suggestions stay usable (AC-19)', async ({ page }) => {
  await seed(api, LIBRARY[2]);
  await seed(api, LIBRARY[4]);
  await control({ google: '429', allrecipes: 'error' });
  await openSuggest(page);
  await showSuggestion(page);
  await expect(card(page).getByRole('heading')).toHaveText('Lentil Soup');
  await picker(page).getByRole('button', { name: 'Search online' }).click();
  await expect(picker(page).getByRole('status')).toContainText(/online search failed or found nothing/i, { timeout: 15_000 });
  await another(page).click();
  await expect(card(page).getByRole('heading')).toHaveText('No Cost Salad');
});

test('J2d a search without any usable result says so (AC-19)', async ({ page }) => {
  await control({ google: 'empty' });
  await openSuggest(page);
  await showSuggestion(page);
  await picker(page).getByRole('button', { name: 'Search online' }).click();
  await expect(picker(page).getByRole('status')).toContainText(/online search failed or found nothing/i, { timeout: 15_000 });
});

test.describe('J2e shared 30 s cap (AC-17), shortened to 2 s in this app instance', () => {
  test.use({ baseURL: SHORT_DEADLINE_BASE });

  test('slow result pages are discarded, finished ones are kept, the search ends', async ({ page }) => {
    const short = await pwRequest.newContext({ baseURL: SHORT_DEADLINE_BASE });
    await wipe(short);
    await control({ slowRecipe: 10_000 });
    const started = Date.now();
    await page.clock.setFixedTime(TODAY);
    await page.goto('/plan');
    await day(page, 'Thursday').getByRole('button', { name: 'Plan meal for Thursday' }).click();
    await picker(page).getByRole('button', { name: 'Suggest a meal' }).click();
    await showSuggestion(page); // empty library
    await picker(page).getByRole('button', { name: 'Search online' }).click();
    await expect(card(page).getByRole('heading')).toBeVisible({ timeout: 8_000 });
    await expect(picker(page).getByRole('status')).toHaveCount(0, { timeout: 8_000 });
    expect(Date.now() - started).toBeLessThan(9_000); // deadline 2 s, not the 10 s of the slow page
    const names = await walk(page);
    expect(names).not.toContain('Online Slow Roast');
    expect(names.length).toBeGreaterThan(0);
    await short.dispose();
  });
});

test('J3 blacklist: never suggested, warning when planned manually (AC-6, 13, 21)', async ({ page }) => {
  await seedAll();
  await page.goto('/blacklist');
  await page.getByLabel('Ingredient').fill('nuts');
  await page.getByRole('button', { name: 'Add to blacklist' }).click();
  await expect(page.getByRole('list').getByText('nuts', { exact: true })).toBeVisible();

  await openSuggest(page);
  await showSuggestion(page);
  expect(await walk(page)).not.toContain('Nutty Bar');

  // planning it manually only warns
  await picker(page).getByRole('button', { name: 'Back to the list' }).click();
  await picker(page).getByRole('button', { name: 'Nutty Bar', exact: true }).click();
  await picker(page).getByRole('button', { name: 'Add to plan' }).click();
  await expect(picker(page).getByTestId('dietary-warning')).toContainText(/blacklisted ingredient: nuts/i);
  await picker(page).getByRole('button', { name: 'Confirm anyway' }).click();
  await expect(day(page, 'Thursday')).toContainText('Nutty Bar');

  // removed again: the meal can be suggested
  await page.goto('/blacklist');
  await page.getByRole('button', { name: 'Remove nuts' }).click();
  await expect(page.getByText(/nothing is blacklisted/i)).toBeVisible();
  await api.delete(`/api/plan/${THIS_WEEK}/days/4`);
  await openSuggest(page, 'Friday');
  await showSuggestion(page);
  expect(await walk(page)).toContain('Nutty Bar');
});

test('J4 participants with restrictions from the predefined list (AC-7, 20, 21)', async ({ page }) => {
  await page.goto('/participants');
  const form = page.getByRole('form', { name: 'Add participant' });
  await expect(form.getByRole('checkbox')).toHaveCount(6);
  for (const r of ['vegetarian', 'vegan', 'gluten-free', 'lactose-free', 'nut-free', 'seafood-free']) {
    await expect(form.getByLabel(r, { exact: true })).toBeVisible();
  }
  await form.getByLabel('Name', { exact: true }).fill('Anna');
  await form.getByLabel('vegetarian', { exact: true }).check();
  await form.getByRole('button', { name: 'Add participant' }).click();
  await expect(page.getByTestId('participant-Anna')).toContainText('vegetarian');

  await page.getByRole('button', { name: 'Edit Anna' }).click();
  await page.getByTestId('participant-Anna').getByLabel('nut-free', { exact: true }).check();
  await page.getByRole('button', { name: 'Save participant' }).click();
  await expect(page.getByTestId('participant-Anna')).toContainText('nut-free, vegetarian');

  await form.getByLabel('Name', { exact: true }).fill('Ben');
  await form.getByRole('button', { name: 'Add participant' }).click();
  await expect(page.getByTestId('participant-Ben')).toContainText('no restrictions');
  await page.getByRole('button', { name: 'Remove Ben' }).click();
  await expect(page.getByTestId('participant-Ben')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('participant-Anna')).toContainText('nut-free, vegetarian'); // AC-7: persisted
  await expect(page.getByTestId('participant-Ben')).toHaveCount(0);
});

test('J5 dietary check when planning, stored participants and plan warnings (AC-8, 11, 15, 25)', async ({ page }) => {
  await seedAll();
  const anna = await (await api.post('/api/participants', { data: { name: 'Anna', restrictions: ['vegetarian'] } })).json();
  const ben = await (await api.post('/api/participants', { data: { name: 'Ben', restrictions: ['gluten-free'] } })).json();

  // suggestions exclude what violates the ticked participants; servings follow the ticks (AC-11, AC-15)
  await openSuggest(page);
  await picker(page).getByLabel('Anna').check();
  await expect(picker(page).getByLabel('Servings')).toHaveValue('1');
  await picker(page).getByLabel('Ben').check();
  await expect(picker(page).getByLabel('Servings')).toHaveValue('2');
  await picker(page).getByLabel('Servings').fill('3'); // editable
  await showSuggestion(page);
  const sequence = await walk(page);
  expect(sequence).not.toContain('Chicken Curry'); // Anna: vegetarian
  expect(sequence).not.toContain('Veggie Pasta'); // Ben: gluten-free (pasta)
  await picker(page).getByRole('button', { name: 'Cancel', exact: true }).click();

  // manual planning: a warning names participant, restriction and ingredient; the user may confirm (AC-8, AC-11)
  await day(page, 'Wednesday').getByRole('button', { name: 'Plan meal for Wednesday' }).click();
  await picker(page).getByRole('button', { name: 'Chicken Curry', exact: true }).click();
  await picker(page).getByLabel('Anna').check();
  await picker(page).getByRole('button', { name: 'Add to plan' }).click();
  const warning = picker(page).getByTestId('dietary-warning');
  await expect(warning).toContainText('Anna');
  await expect(warning).toContainText('vegetarian');
  await expect(warning).toContainText('Chicken');
  await warning.getByRole('button', { name: 'Cancel' }).click();
  await picker(page).getByRole('button', { name: 'Add to plan' }).click();
  await picker(page).getByRole('button', { name: 'Confirm anyway' }).click();
  await expect(day(page, 'Wednesday')).toContainText('Chicken Curry');

  // Ben + pasta: the warning, cancelled -> nothing planned
  await day(page, 'Friday').getByRole('button', { name: 'Plan meal for Friday' }).click();
  await picker(page).getByRole('button', { name: 'Veggie Pasta', exact: true }).click();
  await picker(page).getByLabel('Ben').check();
  await picker(page).getByRole('button', { name: 'Add to plan' }).click();
  await expect(picker(page).getByTestId('dietary-warning')).toContainText(/gluten-free/);
  await picker(page).getByTestId('dietary-warning').getByRole('button', { name: 'Cancel' }).click();
  await picker(page).getByRole('button', { name: 'Cancel', exact: true }).last().click();
  await expect(day(page, 'Friday')).toContainText('Nothing planned');

  // AC-25: the participants are stored with the planned meal; the plan view warns, the meal stays
  await page.reload();
  await expect(day(page, 'Wednesday')).toContainText(/Warning: Anna \(vegetarian\): Chicken/);
  await api.put(`/api/participants/${anna.id}`, { data: { name: 'Anna', restrictions: [] } });
  await page.reload();
  await expect(day(page, 'Wednesday')).toContainText('Chicken Curry');
  await expect(day(page, 'Wednesday')).not.toContainText('Warning');

  // a blacklist change later also warns (AC-25)
  const item = await (await api.post('/api/blacklist', { data: { term: 'chicken' } })).json();
  await page.reload();
  await expect(day(page, 'Wednesday')).toContainText(/Warning:.*blacklisted: chicken/);
  await api.delete(`/api/blacklist/${item.id}`);
  await page.reload();
  await expect(day(page, 'Wednesday')).not.toContainText('Warning');
  void ben;
});

async function seedAll() {
  for (const m of LIBRARY) await seed(api, m);
}
