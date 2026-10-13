import { describe, it, expect } from 'vitest';
import { makeApp, addParticipant, meal, THIS_WEEK } from './support';

const warnings = async (app: Awaited<ReturnType<typeof makeApp>>['app'], week = THIS_WEEK) =>
  (await app.inject({ method: 'GET', url: `/api/plan-warnings?weekStart=${week}` })).json();

describe('plan warnings API (T-15, AC-25)', () => {
  it('reports a violation after a restriction is added that the planned meal violates; clears when removed', async () => {
    const { app, db } = await makeApp();
    const anna = await addParticipant(app, 'Anna', []);
    const m = meal(db, 'Curry', ['Chicken', 'Rice']);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/3`, payload: { mealId: m, servings: 2, participantIds: [anna.id] } });
    expect(await warnings(app)).toEqual([]);

    await app.inject({ method: 'PUT', url: `/api/participants/${anna.id}`, payload: { name: 'Anna', restrictions: ['vegetarian'] } });
    const w = await warnings(app);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ day: 3, mealName: 'Curry', mealId: m });
    expect(w[0].violations).toEqual([{ participant: 'Anna', restriction: 'vegetarian', ingredient: 'Chicken' }]);

    await app.inject({ method: 'PUT', url: `/api/participants/${anna.id}`, payload: { name: 'Anna', restrictions: [] } });
    expect(await warnings(app)).toEqual([]);
  });

  it('reports a blacklisted ingredient added later; the planned meal is never removed', async () => {
    const { app, db } = await makeApp();
    const m = meal(db, 'Salad', ['Lettuce', 'Walnuts']);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: m, servings: 2 } });
    expect(await warnings(app)).toEqual([]);
    const item = (await app.inject({ method: 'POST', url: '/api/blacklist', payload: { term: 'walnut' } })).json();
    const w = await warnings(app);
    expect(w[0]).toMatchObject({ day: 1, blacklisted: ['walnut'] });
    const view = (await app.inject({ method: 'GET', url: `/api/plan/${THIS_WEEK}` })).json();
    expect(view.days[0].entry).toMatchObject({ mealName: 'Salad' });
    await app.inject({ method: 'DELETE', url: `/api/blacklist/${item.id}` });
    expect(await warnings(app)).toEqual([]);
  });

  it('meals without stored participants report only blacklist hits', async () => {
    const { app, db } = await makeApp();
    await addParticipant(app, 'Anna', ['vegan']);
    const m = meal(db, 'Curry', ['Chicken']);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: m, servings: 2 } });
    expect(await warnings(app)).toEqual([]);
  });

  it('only the days with findings are listed, each with its day number', async () => {
    const { app, db } = await makeApp();
    const anna = await addParticipant(app, 'Anna', ['vegan']);
    const bad = meal(db, 'Bad', ['Cheese']);
    const good = meal(db, 'Good', ['Carrot']);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: good, servings: 2, participantIds: [anna.id] } });
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/5`, payload: { mealId: bad, servings: 2, participantIds: [anna.id] } });
    const w = await warnings(app);
    expect(w.map((x: { day: number }) => x.day)).toEqual([5]);
  });

  it('an invalid week -> 400', async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/api/plan-warnings?weekStart=2026-10-14' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/plan-warnings' })).statusCode).toBe(400);
  });
});
