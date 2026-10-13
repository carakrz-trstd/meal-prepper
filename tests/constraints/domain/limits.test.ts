import { describe, it, expect } from 'vitest';
import { evaluateLimits, describeLimits } from '../../../src/shared/constraints/limits';
import { mealOf } from '../support';

const m = (over: Omit<Parameters<typeof mealOf>[0], 'id' | 'name'> = {}) => mealOf({ id: 1, name: 'M', ...over });

describe('evaluateLimits (T-4, AC-1..AC-4, AC-12, AC-22)', () => {
  it('calories: 500 per serving passes limits 500 and 501 and fails 450 (AC-1)', () => {
    const meal = m({ caloriesPerServing: 500 });
    expect(evaluateLimits(meal, { calorieLimit: 450 }, 4).ok).toBe(false);
    expect(evaluateLimits(meal, { calorieLimit: 500 }, 4).ok).toBe(true);
    expect(evaluateLimits(meal, { calorieLimit: 501 }, 4).ok).toBe(true);
  });

  it('budget scales with servings: cost 12 EUR at base 4 for 2 servings is 6 (AC-2)', () => {
    const meal = m({ totalCostEur: 12, baseServings: 4 });
    expect(evaluateLimits(meal, { budgetLimit: 6 }, 2).ok).toBe(true);
    expect(evaluateLimits(meal, { budgetLimit: 5.99 }, 2).ok).toBe(false);
    expect(evaluateLimits(meal, { budgetLimit: 12 }, 4).ok).toBe(true);
    expect(evaluateLimits(meal, { budgetLimit: 12 }, 8).ok).toBe(false); // 24 EUR for 8 servings
  });

  it('time is prep + cook: 10 + 20 = 30 passes limit 30 and fails 29 (AC-3)', () => {
    const meal = m({ prepMinutes: 10, cookMinutes: 20 });
    expect(evaluateLimits(meal, { timeLimit: 30 }, 4).ok).toBe(true);
    expect(evaluateLimits(meal, { timeLimit: 29 }, 4).ok).toBe(false);
  });

  it('combined limits require all of them (AC-4)', () => {
    const meal = m({ caloriesPerServing: 400, totalCostEur: 8, prepMinutes: 10, cookMinutes: 20 });
    expect(evaluateLimits(meal, { calorieLimit: 500, budgetLimit: 10, timeLimit: 30 }, 4).ok).toBe(true);
    expect(evaluateLimits(meal, { calorieLimit: 500, budgetLimit: 10, timeLimit: 25 }, 4).ok).toBe(false);
    expect(evaluateLimits(meal, { calorieLimit: 300, budgetLimit: 10, timeLimit: 30 }, 4).ok).toBe(false);
    expect(evaluateLimits(meal, { calorieLimit: 500, budgetLimit: 7, timeLimit: 30 }, 4).ok).toBe(false);
  });

  it('missing calories with a calorie limit -> excluded, with the reason (AC-12)', () => {
    const r = evaluateLimits(m({ caloriesPerServing: null }), { calorieLimit: 500 }, 4);
    expect(r.ok).toBe(false);
    expect(r.excludedBecauseMissing).toEqual(['calories']);
  });

  it('missing cost with a budget limit -> excluded (AC-12)', () => {
    const r = evaluateLimits(m({ totalCostEur: null }), { budgetLimit: 10 }, 4);
    expect(r).toMatchObject({ ok: false, excludedBecauseMissing: ['budget'] });
  });

  it('a missing value is ignored when its limit is not set (AC-12)', () => {
    const r = evaluateLimits(m({ totalCostEur: null, caloriesPerServing: 300 }), { calorieLimit: 500 }, 4);
    expect(r).toMatchObject({ ok: true, excludedBecauseMissing: [] });
  });

  it('treats null, undefined and empty limits as "not set"; no limits -> always ok', () => {
    expect(evaluateLimits(m({ caloriesPerServing: null, totalCostEur: null }), {}, 4).ok).toBe(true);
    expect(evaluateLimits(m(), { calorieLimit: null, budgetLimit: undefined, timeLimit: null }, 4).ok).toBe(true);
  });

  it('usedEstimate is true only when an estimated value was used for a set limit (AC-22)', () => {
    const est = m({ caloriesPerServing: 300, caloriesEstimated: true, totalCostEur: 5, costEstimated: true });
    expect(evaluateLimits(est, { calorieLimit: 500 }, 4)).toMatchObject({ usedEstimate: true, estimateUsed: { calories: true, cost: false } });
    expect(evaluateLimits(est, { budgetLimit: 50 }, 4)).toMatchObject({ usedEstimate: true, estimateUsed: { calories: false, cost: true } });
    expect(evaluateLimits(est, { timeLimit: 60 }, 4).usedEstimate).toBe(false);
    expect(evaluateLimits(est, {}, 4).usedEstimate).toBe(false);
    expect(evaluateLimits(m({ caloriesPerServing: 300 }), { calorieLimit: 500 }, 4).usedEstimate).toBe(false);
  });
});

describe('describeLimits (AC-5)', () => {
  it('names each applied limit', () => {
    expect(describeLimits({ calorieLimit: 500, budgetLimit: 10, timeLimit: 45 })).toEqual([
      'calories: at most 500 kcal per serving',
      'budget: at most 10 EUR',
      'time: at most 45 min',
    ]);
  });
  it('is empty when no limit is set', () => {
    expect(describeLimits({})).toEqual([]);
  });
});
