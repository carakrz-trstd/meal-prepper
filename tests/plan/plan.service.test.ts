import { describe, it, expect, vi } from 'vitest';
import { PlanService, PlanError } from '../../src/server/plan/plan.service';
import { fixedClock, freshDb, seedMeal, THIS_WEEK, NEXT_WEEK } from '../helpers';

const setup = () => {
  const db = freshDb();
  const service = new PlanService(db, fixedClock());
  return { db, service };
};

const code = (fn: () => unknown): string => {
  try {
    fn();
    return 'no error';
  } catch (e) {
    return e instanceof PlanError ? e.code : `other: ${(e as Error).message}`;
  }
};

describe('PlanService (T-5)', () => {
  it('plans a meal on Wednesday and stores it with its servings (AC-1)', () => {
    const { service, db } = setup();
    const m = seedMeal(db, { name: 'Pasta' });
    const view = service.planDay(THIS_WEEK, 3, { mealId: m, servings: 6 });
    expect(view.days[2].entry).toMatchObject({ mealId: m, mealName: 'Pasta', servings: 6 });
    expect(view.days[0].entry).toBeNull();
  });

  it('an occupied day without replace -> DAY_OCCUPIED; with replace the day holds exactly the new meal (AC-2)', () => {
    const { service, db } = setup();
    const a = seedMeal(db, { name: 'A' });
    const b = seedMeal(db, { name: 'B' });
    service.planDay(THIS_WEEK, 3, { mealId: a, servings: 2 });
    expect(code(() => service.planDay(THIS_WEEK, 3, { mealId: b, servings: 2 }))).toBe('DAY_OCCUPIED');
    const view = service.planDay(THIS_WEEK, 3, { mealId: b, servings: 3, replace: true });
    expect(view.days[2].entry).toMatchObject({ mealName: 'B', servings: 3 });
    expect(db.prepare('SELECT COUNT(*) c FROM planned_meal').get()).toEqual({ c: 1 });
  });

  it('the same meal on another day of the same week -> MEAL_ALREADY_PLANNED with the other day (AC-3)', () => {
    const { service, db } = setup();
    const m = seedMeal(db);
    service.planDay(THIS_WEEK, 3, { mealId: m, servings: 2 });
    try {
      service.planDay(THIS_WEEK, 4, { mealId: m, servings: 2 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).code).toBe('MEAL_ALREADY_PLANNED');
      expect((e as PlanError).extra).toEqual({ day: 3 });
    }
  });

  it('replacing with a meal planned on a different day of the same week is MEAL_ALREADY_PLANNED', () => {
    const { service, db } = setup();
    const a = seedMeal(db);
    const b = seedMeal(db);
    service.planDay(THIS_WEEK, 1, { mealId: a, servings: 2 });
    service.planDay(THIS_WEEK, 2, { mealId: b, servings: 2 });
    expect(code(() => service.planDay(THIS_WEEK, 2, { mealId: a, servings: 2, replace: true }))).toBe('MEAL_ALREADY_PLANNED');
  });

  it('the same meal in the next week succeeds (AC-4)', () => {
    const { service, db } = setup();
    const m = seedMeal(db);
    service.planDay(THIS_WEEK, 3, { mealId: m, servings: 2 });
    expect(code(() => service.planDay(NEXT_WEEK, 3, { mealId: m, servings: 2 }))).toBe('no error');
  });

  it('servings 0, 21, 2.5, "3" and missing -> INVALID_SERVINGS; 1 and 20 are accepted (AC-20, AC-5)', () => {
    const { service, db } = setup();
    const m = seedMeal(db);
    for (const bad of [0, 21, 2.5, '3', undefined, null, NaN]) {
      expect(code(() => service.planDay(THIS_WEEK, 1, { mealId: m, servings: bad as number }))).toBe('INVALID_SERVINGS');
    }
    expect(code(() => service.planDay(THIS_WEEK, 1, { mealId: m, servings: 1 }))).toBe('no error');
    expect(code(() => service.planDay(THIS_WEEK, 2, { mealId: seedMeal(db), servings: 20 }))).toBe('no error');
  });

  it('weeks before the current Monday -> WEEK_IN_PAST, non-Mondays -> INVALID_WEEK (AC-11)', () => {
    const { service, db } = setup();
    const m = seedMeal(db);
    expect(code(() => service.getWeek('2026-10-05'))).toBe('WEEK_IN_PAST');
    expect(code(() => service.planDay('2026-10-05', 1, { mealId: m, servings: 2 }))).toBe('WEEK_IN_PAST');
    expect(code(() => service.getWeek('2026-10-14'))).toBe('INVALID_WEEK');
    expect(code(() => service.getWeek('nonsense'))).toBe('INVALID_WEEK');
    expect(code(() => service.getWeek(THIS_WEEK))).toBe('no error');
  });

  it('an unknown meal -> MEAL_NOT_FOUND; an invalid day -> INVALID_DAY', () => {
    const { service, db } = setup();
    expect(code(() => service.planDay(THIS_WEEK, 1, { mealId: 999, servings: 2 }))).toBe('MEAL_NOT_FOUND');
    expect(code(() => service.planDay(THIS_WEEK, 8, { mealId: seedMeal(db), servings: 2 }))).toBe('INVALID_DAY');
  });

  it('a past day of the current week can be added, replaced, changed and removed (AC-13)', () => {
    const { service, db } = setup();
    const a = seedMeal(db, { name: 'A' });
    const b = seedMeal(db, { name: 'B' });
    // Monday 2026-10-12 is before "today" (Wednesday)
    service.planDay(THIS_WEEK, 1, { mealId: a, servings: 2 });
    expect(service.planDay(THIS_WEEK, 1, { mealId: b, servings: 5, replace: true }).days[0].entry?.mealName).toBe('B');
    expect(service.changeServings(THIS_WEEK, 1, 7).days[0].entry?.servings).toBe(7);
    expect(service.removeDay(THIS_WEEK, 1).days[0].entry).toBeNull();
  });

  it('replacing a day with its own meal only changes the servings', () => {
    const { service, db } = setup();
    const a = seedMeal(db);
    service.planDay(THIS_WEEK, 2, { mealId: a, servings: 2 });
    const view = service.planDay(THIS_WEEK, 2, { mealId: a, servings: 9, replace: true });
    expect(view.days[1].entry).toMatchObject({ mealId: a, servings: 9 });
  });

  it('changeServings and removeDay on an empty day -> DAY_EMPTY', () => {
    const { service } = setup();
    expect(code(() => service.changeServings(THIS_WEEK, 2, 3))).toBe('DAY_EMPTY');
    expect(code(() => service.removeDay(THIS_WEEK, 2))).toBe('DAY_EMPTY');
  });

  it('last servings is 4 initially and follows the latest saved servings (AC-15)', () => {
    const { service, db } = setup();
    expect(service.getWeek(THIS_WEEK).lastServings).toBe(4);
    const a = seedMeal(db);
    expect(service.planDay(THIS_WEEK, 1, { mealId: a, servings: 7 }).lastServings).toBe(7);
    expect(service.changeServings(THIS_WEEK, 1, 3).lastServings).toBe(3);
    expect(service.getWeek(NEXT_WEEK).lastServings).toBe(3);
  });

  it('a rejected plan does not change the last servings', () => {
    const { service, db } = setup();
    const a = seedMeal(db);
    service.planDay(THIS_WEEK, 1, { mealId: a, servings: 5 });
    expect(code(() => service.planDay(THIS_WEEK, 2, { mealId: a, servings: 9 }))).toBe('MEAL_ALREADY_PLANNED');
    expect(service.getWeek(THIS_WEEK).lastServings).toBe(5);
  });

  it('calls assertPlannable before every insert and replace', () => {
    const { service, db } = setup();
    const spy = vi.spyOn(service, 'assertPlannable');
    const a = seedMeal(db);
    const b = seedMeal(db);
    service.planDay(THIS_WEEK, 1, { mealId: a, servings: 2 });
    service.planDay(THIS_WEEK, 1, { mealId: b, servings: 2, replace: true });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, THIS_WEEK, 1, a);
  });

  it('week view numbers: cost scales with servings, total minutes = prep + cook, null stays null (AC-23)', () => {
    const { service, db } = setup();
    const withCost = seedMeal(db, { baseServings: 4, totalCostEur: 8, prepMinutes: 10, cookMinutes: 25, caloriesPerServing: 600 });
    const noValues = seedMeal(db, { caloriesPerServing: null, totalCostEur: null, prepMinutes: undefined, cookMinutes: 20 });
    service.planDay(THIS_WEEK, 1, { mealId: withCost, servings: 6 });
    const view = service.planDay(THIS_WEEK, 2, { mealId: noValues, servings: 2 });
    expect(view.days[0].entry).toMatchObject({ caloriesPerServing: 600, totalCostEur: 12, totalMinutes: 35 });
    expect(view.days[1].entry).toMatchObject({ caloriesPerServing: null, totalCostEur: null, totalMinutes: 20 });
  });

  it('week days run Monday to Sunday with dates', () => {
    const { service } = setup();
    const view = service.getWeek(THIS_WEEK);
    expect(view.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(view.days[0].date).toBe('2026-10-12');
    expect(view.days[6].date).toBe('2026-10-18');
  });
});
