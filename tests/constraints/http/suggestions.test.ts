import { describe, it, expect } from 'vitest';
import { makeApp, addParticipant, meal, THIS_WEEK } from './support';

const suggest = (app: Awaited<ReturnType<typeof makeApp>>['app'], body: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url: '/api/suggestions', payload: { weekStart: THIS_WEEK, participantIds: [], servings: 4, ...body } });

describe('suggestions API (T-9)', () => {
  it('returns the ordered library matches (AC-1, AC-14)', async () => {
    const { app, db } = await makeApp();
    meal(db, 'Zebra stew', ['Carrot']);
    meal(db, 'Apple pie', ['Apple']);
    const fav = meal(db, 'Mango bowl', ['Rice']);
    await app.inject({ method: 'PUT', url: `/api/meals/${fav}/favourite`, payload: { value: true } });
    const res = await suggest(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().matches.map((m: { meal: { name: string } }) => m.meal.name)).toEqual(['Mango bowl', 'Apple pie', 'Zebra stew']);
    expect(res.json().matches[0]).toMatchObject({ source: 'library', favourite: true, unknownIngredients: [] });
  });

  it('applies the calorie, budget and time limits (AC-1..AC-4)', async () => {
    const { app, db } = await makeApp();
    meal(db, 'Light', ['Rice'], { caloriesPerServing: 300, totalCostEur: 4, prepMinutes: 5, cookMinutes: 10 });
    meal(db, 'Heavy', ['Rice'], { caloriesPerServing: 900, totalCostEur: 4, prepMinutes: 5, cookMinutes: 10 });
    meal(db, 'Slow', ['Rice'], { caloriesPerServing: 300, totalCostEur: 4, prepMinutes: 50, cookMinutes: 60 });
    meal(db, 'Pricey', ['Rice'], { caloriesPerServing: 300, totalCostEur: 40, prepMinutes: 5, cookMinutes: 10 });
    const res = await suggest(app, { calorieLimit: 500, budgetLimit: 10, timeLimit: 30 });
    expect(res.json().matches.map((m: { meal: { name: string } }) => m.meal.name)).toEqual(['Light']);
  });

  it('skips meals planned in the selected week (AC-14)', async () => {
    const { app, db } = await makeApp();
    const a = meal(db, 'A', ['Rice']);
    meal(db, 'B', ['Rice']);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: a, servings: 2 } });
    const res = await suggest(app);
    expect(res.json().matches.map((m: { meal: { name: string } }) => m.meal.name)).toEqual(['B']);
  });

  it('applies the blacklist and the ticked participants\' restrictions (AC-6, AC-8, AC-11)', async () => {
    const { app, db } = await makeApp();
    meal(db, 'Curry', ['Chicken']);
    meal(db, 'Salad', ['Lettuce']);
    meal(db, 'Nutty', ['Mixed nuts']);
    meal(db, 'Odd', ['Dragon fruit']);
    await app.inject({ method: 'POST', url: '/api/blacklist', payload: { term: 'nuts' } });
    const anna = await addParticipant(app, 'Anna', ['vegetarian']);
    const res = await suggest(app, { participantIds: [anna.id] });
    const matches = res.json().matches;
    expect(matches.map((m: { meal: { name: string } }) => m.meal.name)).toEqual(['Salad', 'Odd']);
    expect(matches[1].unknownIngredients).toEqual(['Dragon fruit']);
  });

  it('an empty result has a message naming each applied limit (AC-5)', async () => {
    const { app, db } = await makeApp();
    meal(db, 'Big', ['Rice'], { caloriesPerServing: 900 });
    const res = await suggest(app, { calorieLimit: 100, budgetLimit: 1, timeLimit: 5 });
    const body = res.json();
    expect(body.matches).toEqual([]);
    expect(body.message).toMatch(/no meal matches/i);
    expect(body.appliedLimits).toHaveLength(3);
    expect(body.message).toContain('calories');
    expect(body.message).toContain('budget');
    expect(body.message).toContain('time');
  });

  it('saves the request as the new prefs (AC-26)', async () => {
    const { app } = await makeApp();
    const anna = await addParticipant(app, 'Anna');
    await suggest(app, { calorieLimit: 500, budgetLimit: null, timeLimit: 45, participantIds: [anna.id] });
    expect((await app.inject({ method: 'GET', url: '/api/suggestion-prefs' })).json()).toEqual({
      calorieLimit: 500, budgetLimit: null, timeLimit: 45, participantIds: [anna.id],
    });
  });

  it('invalid limits (negative, non-numeric) -> 400', async () => {
    const { app } = await makeApp();
    for (const body of [{ calorieLimit: -1 }, { budgetLimit: 'cheap' }, { timeLimit: 0 }, { calorieLimit: '500' }]) {
      const res = await suggest(app, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().code).toBe('VALIDATION');
    }
  });

  it('invalid servings or week -> 400', async () => {
    const { app } = await makeApp();
    expect((await suggest(app, { servings: 0 })).statusCode).toBe(400);
    expect((await suggest(app, { servings: 21 })).statusCode).toBe(400);
    expect((await suggest(app, { servings: 2.5 })).statusCode).toBe(400);
    expect((await suggest(app, { weekStart: '2026-10-14' })).statusCode).toBe(400);
    expect((await suggest(app, { participantIds: 'all' })).statusCode).toBe(400);
  });

  it('flags a used estimate (AC-22)', async () => {
    const { app, db } = await makeApp();
    db.prepare("INSERT INTO meals (name, base_servings, calories_per_serving, calories_estimated, prep_minutes, cook_minutes, created_at, updated_at) VALUES ('Est', 4, 300, 1, 0, 10, 'n', 'n')").run();
    const id = (db.prepare("SELECT id FROM meals WHERE name = 'Est'").get() as { id: number }).id;
    db.prepare("INSERT INTO ingredients (meal_id, position, name, name_key, quantity, unit) VALUES (?, 0, 'Rice', 'rice', 1, 'g')").run(id);
    const res = await suggest(app, { calorieLimit: 500 });
    expect(res.json().matches[0].usedEstimate).toEqual({ calories: true, cost: false });
  });
});
