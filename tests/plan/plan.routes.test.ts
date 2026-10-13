import { describe, it, expect } from 'vitest';
import { buildApp } from '../../src/server/http/app';
import { fixedClock, freshDb, seedMeal, THIS_WEEK, NEXT_WEEK } from '../helpers';

const make = async () => {
  const db = freshDb();
  const app = await buildApp({ db, clock: fixedClock() });
  return { db, app };
};

describe('plan routes (T-7, T-8)', () => {
  it('GET returns seven days Monday to Sunday with dates and lastServings 4 (AC-11)', async () => {
    const { app } = await make();
    const res = await app.inject({ method: 'GET', url: `/api/plan/${THIS_WEEK}` });
    expect(res.statusCode).toBe(200);
    const view = res.json();
    expect(view.weekStart).toBe(THIS_WEEK);
    expect(view.days).toHaveLength(7);
    expect(view.days[0].date).toBe('2026-10-12');
    expect(view.days[6].date).toBe('2026-10-18');
    expect(view.lastServings).toBe(4);
    expect(view.shopping).toEqual([]);
  });

  it('PUT happy path returns the week view including shopping entries (AC-8)', async () => {
    const { app, db } = await make();
    const m = seedMeal(db, { name: 'Pasta', baseServings: 4, ingredients: [{ name: 'Spaghetti', quantity: 400, unit: 'g' }] });
    const res = await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/3`, payload: { mealId: m, servings: 8 } });
    expect(res.statusCode).toBe(200);
    const view = res.json();
    expect(view.days[2].entry).toMatchObject({ mealName: 'Pasta', servings: 8 });
    expect(view.shopping[0]).toMatchObject({ name: 'Spaghetti', quantity: 800, unit: 'g', ticked: false });
  });

  it('every mutation response contains the updated shopping list (AC-8)', async () => {
    const { app, db } = await make();
    const m = seedMeal(db, { ingredients: [{ name: 'Flour', quantity: 400, unit: 'g' }] });
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: m, servings: 4 } });
    const patched = (await app.inject({ method: 'PATCH', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { servings: 2 } })).json();
    expect(patched.shopping[0].quantity).toBe(200);
    const ticked = (await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/ticks`, payload: { entryId: 'mass:flour', ticked: true } })).json();
    expect(ticked.shopping[0].ticked).toBe(true);
    const removed = (await app.inject({ method: 'DELETE', url: `/api/plan/${THIS_WEEK}/days/1` })).json();
    expect(removed.shopping).toEqual([]);
  });

  it('PUT without servings -> 400 INVALID_SERVINGS (AC-5); out-of-range too (AC-20)', async () => {
    const { app, db } = await make();
    const m = seedMeal(db);
    const missing = await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: m } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().code).toBe('INVALID_SERVINGS');
    const big = await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: m, servings: 21 } });
    expect(big.json().code).toBe('INVALID_SERVINGS');
  });

  it('409 bodies carry codes and the other day (AC-3)', async () => {
    const { app, db } = await make();
    const m = seedMeal(db);
    const other = seedMeal(db);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: m, servings: 2 } });
    const repeat = await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/4`, payload: { mealId: m, servings: 2 } });
    expect(repeat.statusCode).toBe(409);
    expect(repeat.json()).toMatchObject({ code: 'MEAL_ALREADY_PLANNED', day: 2 });
    const occupied = await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: other, servings: 2 } });
    expect(occupied.statusCode).toBe(409);
    expect(occupied.json().code).toBe('DAY_OCCUPIED');
  });

  it('PATCH and DELETE on an empty day -> 404 DAY_EMPTY', async () => {
    const { app } = await make();
    const p = await app.inject({ method: 'PATCH', url: `/api/plan/${THIS_WEEK}/days/5`, payload: { servings: 2 } });
    expect(p.statusCode).toBe(404);
    expect(p.json().code).toBe('DAY_EMPTY');
    expect((await app.inject({ method: 'DELETE', url: `/api/plan/${THIS_WEEK}/days/5` })).statusCode).toBe(404);
  });

  it('a past week -> 400 WEEK_IN_PAST; a non-Monday -> 400 INVALID_WEEK (AC-11)', async () => {
    const { app } = await make();
    const past = await app.inject({ method: 'GET', url: '/api/plan/2026-10-05' });
    expect(past.statusCode).toBe(400);
    expect(past.json().code).toBe('WEEK_IN_PAST');
    const bad = await app.inject({ method: 'GET', url: '/api/plan/2026-10-14' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('INVALID_WEEK');
  });

  it('unknown meal -> 404 MEAL_NOT_FOUND; unknown tick entry -> 404 ENTRY_NOT_FOUND', async () => {
    const { app } = await make();
    const meal = await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: 999, servings: 2 } });
    expect(meal.statusCode).toBe(404);
    expect(meal.json().code).toBe('MEAL_NOT_FOUND');
    const tick = await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/ticks`, payload: { entryId: 'mass:x', ticked: true } });
    expect(tick.statusCode).toBe(404);
    expect(tick.json().code).toBe('ENTRY_NOT_FOUND');
  });

  it('null calories serialise as null; cost scales: 8 EUR at base 4 for 6 servings is 12; null cost stays null (AC-23)', async () => {
    const { app, db } = await make();
    const a = seedMeal(db, { caloriesPerServing: null, totalCostEur: 8 });
    const b = seedMeal(db, { totalCostEur: null, caloriesPerServing: 500 });
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: a, servings: 6 } });
    const view = (await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: b, servings: 2 } })).json();
    expect(view.days[0].entry).toMatchObject({ caloriesPerServing: null, totalCostEur: 12 });
    expect(view.days[1].entry).toMatchObject({ caloriesPerServing: 500, totalCostEur: null });
  });

  it('a partly planned week is valid and the list covers only planned days (AC-12)', async () => {
    const { app, db } = await make();
    const m = seedMeal(db, { ingredients: [{ name: 'Rice', quantity: 200, unit: 'g' }] });
    const view = (await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/6`, payload: { mealId: m, servings: 4 } })).json();
    expect(view.days.filter((d: { entry: unknown }) => d.entry !== null)).toHaveLength(1);
    expect(view.shopping.map((e: { name: string }) => e.name)).toEqual(['Rice']);
  });

  it('a one-week plan is assembled quickly (NFR-3)', async () => {
    const { app, db } = await make();
    for (let day = 1; day <= 7; day++) {
      const m = seedMeal(db, { ingredients: Array.from({ length: 10 }, (_, i) => ({ name: `Ing ${i}`, quantity: 10 + i, unit: 'g' as const })) });
      await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/${day}`, payload: { mealId: m, servings: 4 } });
    }
    const t0 = performance.now();
    const res = await app.inject({ method: 'GET', url: `/api/plan/${THIS_WEEK}` });
    expect(res.statusCode).toBe(200);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('meal edits show up in the plan and list without extra steps (AC-17)', async () => {
    const { app, db } = await make();
    const m = seedMeal(db, { name: 'Pancakes', ingredients: [{ name: 'Flour', quantity: 500, unit: 'g' }] });
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: m, servings: 4 } });
    const meal = (await app.inject({ method: 'GET', url: `/api/meals/${m}` })).json();
    await app.inject({
      method: 'PUT', url: `/api/meals/${m}`,
      payload: { name: 'Pancakes', baseServings: 4, cookMinutes: 20, ingredients: [{ name: 'Flour', quantity: 750, unit: 'g' }], prepMinutes: meal.prepMinutes },
    });
    const view = (await app.inject({ method: 'GET', url: `/api/plan/${THIS_WEEK}` })).json();
    expect(view.shopping[0].quantity).toBe(750);
  });

  describe('plan usage and delete cascade (T-8, AC-18)', () => {
    it('GET /api/plan/usage/:mealId counts planned rows across weeks; 0 when unplanned; 404 for an unknown meal', async () => {
      const { app, db } = await make();
      const planned = seedMeal(db);
      const unplanned = seedMeal(db);
      await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: planned, servings: 2 } });
      await app.inject({ method: 'PUT', url: `/api/plan/${NEXT_WEEK}/days/1`, payload: { mealId: planned, servings: 2 } });
      expect((await app.inject({ method: 'GET', url: `/api/plan/usage/${planned}` })).json()).toEqual({ plannedCount: 2 });
      expect((await app.inject({ method: 'GET', url: `/api/plan/usage/${unplanned}` })).json()).toEqual({ plannedCount: 0 });
      expect((await app.inject({ method: 'GET', url: '/api/plan/usage/9999' })).statusCode).toBe(404);
    });

    it('deleting the meal through the Epic 1 endpoint empties its days and removes its ingredients from the list', async () => {
      const { app, db } = await make();
      const a = seedMeal(db, { name: 'A', ingredients: [{ name: 'Flour', quantity: 100, unit: 'g' }] });
      const b = seedMeal(db, { name: 'B', ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] });
      await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: a, servings: 4 } });
      await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: b, servings: 4 } });
      expect((await app.inject({ method: 'DELETE', url: `/api/meals/${a}` })).statusCode).toBe(204);
      const view = (await app.inject({ method: 'GET', url: `/api/plan/${THIS_WEEK}` })).json();
      expect(view.days[0].entry).toBeNull();
      expect(view.days[1].entry).toMatchObject({ mealName: 'B' });
      expect(view.shopping.map((e: { name: string }) => e.name)).toEqual(['Rice']);
    });
  });
});
