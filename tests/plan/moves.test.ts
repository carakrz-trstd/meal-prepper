import { describe, it, expect } from 'vitest';
import { PlanService, PlanError } from '../../src/server/plan/plan.service';
import { PlannedParticipantRepository } from '../../src/server/constraints/repo/PlannedParticipantRepository';
import { buildApp } from '../../src/server/http/app';
import { fixedClock, freshDb, seedMeal, THIS_WEEK, NEXT_WEEK } from '../helpers';

const setup = () => {
  const db = freshDb();
  const links = new PlannedParticipantRepository(db);
  const service = new PlanService(db, fixedClock(), links);
  const person = (name: string) => Number(db.prepare('INSERT INTO participant (name) VALUES (?)').run(name).lastInsertRowid);
  return { db, service, person };
};
const code = (fn: () => unknown) => {
  try {
    fn();
    return 'no error';
  } catch (e) {
    return e instanceof PlanError ? e.code : `other: ${(e as Error).message}`;
  }
};

describe('moving a planned meal to another day (drag and drop)', () => {
  it('moves a meal to an empty day and keeps its servings and participants', () => {
    const { service, db, person } = setup();
    const anna = person('Anna');
    const m = seedMeal(db, { name: 'Soup' });
    service.planDay(THIS_WEEK, 2, { mealId: m, servings: 5, participantIds: [anna] });
    const view = service.moveDay(THIS_WEEK, 2, 5);
    expect(view.days[1].entry).toBeNull();
    expect(view.days[4].entry).toMatchObject({ mealName: 'Soup', servings: 5, participantIds: [anna] });
  });

  it('swaps two planned meals, each keeping its own servings and participants', () => {
    const { service, db, person } = setup();
    const anna = person('Anna');
    const ben = person('Ben');
    const a = seedMeal(db, { name: 'A' });
    const b = seedMeal(db, { name: 'B' });
    service.planDay(THIS_WEEK, 1, { mealId: a, servings: 2, participantIds: [anna] });
    service.planDay(THIS_WEEK, 4, { mealId: b, servings: 7, participantIds: [ben] });
    const view = service.moveDay(THIS_WEEK, 1, 4);
    expect(view.days[0].entry).toMatchObject({ mealName: 'B', servings: 7, participantIds: [ben] });
    expect(view.days[3].entry).toMatchObject({ mealName: 'A', servings: 2, participantIds: [anna] });
    // the one-meal-per-day and no-repeat rules still hold
    expect(db.prepare('SELECT COUNT(*) c FROM planned_meal').get()).toEqual({ c: 2 });
  });

  it('moving a meal back restores the original plan (this is how "Undo" works)', () => {
    const { service, db } = setup();
    const a = seedMeal(db, { name: 'A' });
    const b = seedMeal(db, { name: 'B' });
    service.planDay(THIS_WEEK, 1, { mealId: a, servings: 2 });
    service.planDay(THIS_WEEK, 3, { mealId: b, servings: 6 });
    service.moveDay(THIS_WEEK, 1, 3);
    const view = service.moveDay(THIS_WEEK, 3, 1);
    expect(view.days[0].entry).toMatchObject({ mealName: 'A', servings: 2 });
    expect(view.days[2].entry).toMatchObject({ mealName: 'B', servings: 6 });
  });

  it('moving onto the same day changes nothing', () => {
    const { service, db } = setup();
    service.planDay(THIS_WEEK, 2, { mealId: seedMeal(db, { name: 'A' }), servings: 3 });
    expect(service.moveDay(THIS_WEEK, 2, 2).days[1].entry).toMatchObject({ mealName: 'A', servings: 3 });
  });

  it('the shopping list follows the move (sources show the new days)', () => {
    const { service, db } = setup();
    service.planDay(THIS_WEEK, 1, { mealId: seedMeal(db, { name: 'A', ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] }), servings: 4 });
    const view = service.moveDay(THIS_WEEK, 1, 6);
    expect(view.shopping[0].sources).toEqual([{ day: 6, mealName: 'A' }]);
  });

  it('does not change the last used servings', () => {
    const { service, db } = setup();
    service.planDay(THIS_WEEK, 1, { mealId: seedMeal(db), servings: 9 });
    expect(service.moveDay(THIS_WEEK, 1, 2).lastServings).toBe(9);
  });

  it('an empty source day -> DAY_EMPTY; invalid days -> INVALID_DAY; past weeks -> WEEK_IN_PAST', () => {
    const { service, db } = setup();
    service.planDay(THIS_WEEK, 1, { mealId: seedMeal(db), servings: 2 });
    expect(code(() => service.moveDay(THIS_WEEK, 3, 4))).toBe('DAY_EMPTY');
    expect(code(() => service.moveDay(THIS_WEEK, 1, 8))).toBe('INVALID_DAY');
    expect(code(() => service.moveDay(THIS_WEEK, 0, 2))).toBe('INVALID_DAY');
    expect(code(() => service.moveDay('2026-10-05', 1, 2))).toBe('WEEK_IN_PAST');
    expect(code(() => service.moveDay(NEXT_WEEK, 1, 2))).toBe('DAY_EMPTY');
  });
});

describe('the participants of a planned meal are part of the week view', () => {
  it('lists the stored participant ids of every planned meal, [] when there are none', () => {
    const { service, db, person } = setup();
    const anna = person('Anna');
    service.planDay(THIS_WEEK, 1, { mealId: seedMeal(db), servings: 2, participantIds: [anna] });
    const view = service.planDay(THIS_WEEK, 2, { mealId: seedMeal(db), servings: 2 });
    expect(view.days[0].entry?.participantIds).toEqual([anna]);
    expect(view.days[1].entry?.participantIds).toEqual([]);
  });
});

describe('POST /api/plan/:week/moves', () => {
  it('moves or swaps and answers with the new week view', async () => {
    const db = freshDb();
    const app = await buildApp({ db, clock: fixedClock() });
    const a = seedMeal(db, { name: 'A' });
    const b = seedMeal(db, { name: 'B' });
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/1`, payload: { mealId: a, servings: 2 } });
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: b, servings: 3 } });
    const res = await app.inject({ method: 'POST', url: `/api/plan/${THIS_WEEK}/moves`, payload: { fromDay: 1, toDay: 2 } });
    expect(res.statusCode).toBe(200);
    const view = res.json();
    expect(view.days[0].entry).toMatchObject({ mealName: 'B', servings: 3 });
    expect(view.days[1].entry).toMatchObject({ mealName: 'A', servings: 2 });
  });

  it('errors: empty source 404, invalid day 400, malformed body 400', async () => {
    const db = freshDb();
    const app = await buildApp({ db, clock: fixedClock() });
    const post = (payload: object) => app.inject({ method: 'POST', url: `/api/plan/${THIS_WEEK}/moves`, payload });
    expect((await post({ fromDay: 3, toDay: 4 })).statusCode).toBe(404);
    expect((await post({ fromDay: 1, toDay: 9 })).json().code).toBe('INVALID_DAY');
    expect((await post({})).statusCode).toBe(400);
  });
});
