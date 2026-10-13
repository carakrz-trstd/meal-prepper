import { describe, it, expect } from 'vitest';
import { makeApp, addParticipant, meal } from './support';

const check = (app: Awaited<ReturnType<typeof makeApp>>['app'], mealId: number, participantIds: number[]) =>
  app.inject({ method: 'POST', url: '/api/meals/check', payload: { mealId, participantIds } });

describe('meal check API (T-14, AC-8, AC-11, AC-13)', () => {
  it('returns violations naming participant, restriction and ingredient for any ticked participant', async () => {
    const { app, db } = await makeApp();
    const anna = await addParticipant(app, 'Anna', ['vegetarian']);
    const ben = await addParticipant(app, 'Ben', ['gluten-free']);
    const m = meal(db, 'Chicken pasta', ['Chicken', 'Wheat flour']);
    const body = (await check(app, m, [anna.id, ben.id])).json();
    expect(body.violations).toEqual(
      expect.arrayContaining([
        { participant: 'Anna', restriction: 'vegetarian', ingredient: 'Chicken' },
        { participant: 'Ben', restriction: 'gluten-free', ingredient: 'Wheat flour' },
      ]),
    );
    expect(body.violations).toHaveLength(2);
  });

  it('a participant who is not ticked is not checked', async () => {
    const { app, db } = await makeApp();
    await addParticipant(app, 'Anna', ['vegetarian']);
    const ben = await addParticipant(app, 'Ben', []);
    const m = meal(db, 'Chicken', ['Chicken']);
    expect((await check(app, m, [ben.id])).json().violations).toEqual([]);
  });

  it('lists unknown ingredients and blacklisted terms', async () => {
    const { app, db } = await makeApp();
    await app.inject({ method: 'POST', url: '/api/blacklist', payload: { term: 'nuts' } });
    const anna = await addParticipant(app, 'Anna', ['vegan']);
    const m = meal(db, 'Odd', ['Dragon fruit', 'Mixed nuts']);
    const body = (await check(app, m, [anna.id])).json();
    expect(body.unknownIngredients).toContain('Dragon fruit');
    expect(body.blacklisted).toEqual(['nuts']);
  });

  it('with no ticked participants only the blacklist result is reported', async () => {
    const { app, db } = await makeApp();
    await app.inject({ method: 'POST', url: '/api/blacklist', payload: { term: 'nuts' } });
    await addParticipant(app, 'Anna', ['vegan']);
    const m = meal(db, 'Nutty', ['Chicken', 'Mixed nuts']);
    expect((await check(app, m, [])).json()).toEqual({ violations: [], unknownIngredients: [], blacklisted: ['nuts'] });
  });

  it('an unknown meal -> 404; a malformed body -> 400', async () => {
    const { app } = await makeApp();
    expect((await check(app, 999, [])).statusCode).toBe(404);
    const bad = await app.inject({ method: 'POST', url: '/api/meals/check', payload: { mealId: 'x', participantIds: 'y' } });
    expect(bad.statusCode).toBe(400);
  });
});
