import { describe, it, expect } from 'vitest';
import { openDatabase } from '../db/open';
import { MealRepository } from '../db/MealRepository';
import { MealService } from './MealService';
import type { MealInput } from '../../shared/types';

const input = (over: Partial<MealInput> = {}): MealInput => ({
  name: 'Soup',
  baseServings: 4,
  ingredients: [{ name: 'Carrot', quantity: 200, unit: 'g' }],
  cookMinutes: 30,
  ...over,
});

const svc = () => new MealService(new MealRepository(openDatabase(':memory:')));

describe('MealService (T-4)', () => {
  it('invalid input yields a validation error listing each missing field (AC-11)', () => {
    const r = svc().create({ name: '', baseServings: 4, ingredients: [], cookMinutes: undefined as never });
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') {
      const f = r.errors.map((e) => e.field);
      expect(f).toEqual(expect.arrayContaining(['name', 'ingredients', 'cookMinutes']));
    }
  });

  it('a duplicate name without allowDuplicateName yields DUPLICATE_NAME and saves nothing (AC-20)', () => {
    const s = svc();
    expect(s.create(input()).kind).toBe('ok');
    expect(s.create(input({ name: ' soup ' })).kind).toBe('duplicate');
    expect(s.list()).toHaveLength(1);
  });

  it('with allowDuplicateName the duplicate is saved (AC-20)', () => {
    const s = svc();
    s.create(input());
    expect(s.create(input(), { allowDuplicateName: true }).kind).toBe('ok');
    expect(s.list()).toHaveLength(2);
  });

  it('stores the estimate marker for a confirmed estimate (AC-19)', () => {
    const s = svc();
    const r = s.create(input({ caloriesPerServing: 300, caloriesEstimated: true }));
    expect(r.kind === 'ok' && r.meal.caloriesEstimated).toBe(true);
    expect(r.kind === 'ok' && r.meal.costEstimated).toBe(false);
  });

  it('ignores an estimated flag when the value is missing (AC-19)', () => {
    const s = svc();
    const r = s.create(input({ caloriesPerServing: null, caloriesEstimated: true }));
    expect(r.kind === 'ok' && r.meal.caloriesEstimated).toBe(false);
  });

  it('update changing calories clears calories_estimated; unchanged keeps it (AC-19)', () => {
    const s = svc();
    const created = s.create(input({ caloriesPerServing: 300, caloriesEstimated: true, totalCostEur: 5, costEstimated: true }));
    if (created.kind !== 'ok') throw new Error('create failed');
    const id = created.meal.id;

    const same = s.update(id, input({ caloriesPerServing: 300, caloriesEstimated: true, totalCostEur: 5, costEstimated: true }));
    expect(same.kind === 'ok' && same.meal.caloriesEstimated).toBe(true);
    expect(same.kind === 'ok' && same.meal.costEstimated).toBe(true);

    const cal = s.update(id, input({ caloriesPerServing: 310, caloriesEstimated: true, totalCostEur: 5, costEstimated: true }));
    expect(cal.kind === 'ok' && cal.meal.caloriesEstimated).toBe(false);
    expect(cal.kind === 'ok' && cal.meal.costEstimated).toBe(true);

    const cost = s.update(id, input({ caloriesPerServing: 310, totalCostEur: 6, costEstimated: true }));
    expect(cost.kind === 'ok' && cost.meal.costEstimated).toBe(false);
  });

  it('editing only the name keeps both markers (AC-19)', () => {
    const s = svc();
    const created = s.create(input({ caloriesPerServing: 300, caloriesEstimated: true, totalCostEur: 5, costEstimated: true }));
    if (created.kind !== 'ok') throw new Error('create failed');
    const r = s.update(created.meal.id, input({ name: 'Renamed', caloriesPerServing: 300, caloriesEstimated: true, totalCostEur: 5, costEstimated: true }));
    expect(r.kind === 'ok' && r.meal.caloriesEstimated && r.meal.costEstimated).toBe(true);
  });

  it('updating a meal under its own name is not a duplicate (AC-20)', () => {
    const s = svc();
    const created = s.create(input());
    if (created.kind !== 'ok') throw new Error('create failed');
    expect(s.update(created.meal.id, input()).kind).toBe('ok');
  });

  it('update of an unknown meal is not found; delete and favourites work (AC-15, AC-3)', () => {
    const s = svc();
    expect(s.update(999, input()).kind).toBe('not_found');
    const created = s.create(input());
    if (created.kind !== 'ok') throw new Error('create failed');
    expect(s.setFavourite(created.meal.id, true)?.isFavourite).toBe(true);
    expect(s.delete(created.meal.id)).toBe(true);
    expect(s.get(created.meal.id)).toBeNull();
  });
});
