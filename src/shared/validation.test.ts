import { describe, it, expect } from 'vitest';
import { validateMealInput } from './validation';
import { UNITS } from './units';
import type { MealInput } from './types';

const valid = (over: Partial<MealInput> = {}): MealInput => ({
  name: 'Soup',
  baseServings: 4,
  ingredients: [{ name: 'Carrot', quantity: 200, unit: 'g' }],
  cookMinutes: 30,
  ...over,
});

const fields = (input: unknown) => {
  const r = validateMealInput(input);
  return r.ok ? [] : r.errors.map((e) => e.field);
};

describe('validateMealInput', () => {
  it('accepts a minimal valid meal with empty calories and cost (AC-1, AC-11)', () => {
    expect(validateMealInput(valid()).ok).toBe(true);
  });
  it('rejects an empty or whitespace name', () => {
    expect(fields(valid({ name: '' }))).toContain('name');
    expect(fields(valid({ name: '   ' }))).toContain('name');
  });
  it('rejects zero ingredients', () => {
    expect(fields(valid({ ingredients: [] }))).toContain('ingredients');
  });
  it('rejects a missing cook time', () => {
    expect(fields(valid({ cookMinutes: undefined as unknown as number }))).toContain('cookMinutes');
  });
  it('rejects cook time 0 or non-integer', () => {
    expect(fields(valid({ cookMinutes: 0 }))).toContain('cookMinutes');
    expect(fields(valid({ cookMinutes: 2.5 }))).toContain('cookMinutes');
  });
  it('accepts a missing prep time (treated as 0)', () => {
    expect(validateMealInput(valid({ prepMinutes: undefined })).ok).toBe(true);
    expect(validateMealInput(valid({ prepMinutes: 0 })).ok).toBe(true);
  });
  it('rejects base servings 0, 2.5 and empty (AC-14)', () => {
    expect(fields(valid({ baseServings: 0 }))).toContain('baseServings');
    expect(fields(valid({ baseServings: 2.5 }))).toContain('baseServings');
    expect(fields(valid({ baseServings: undefined as unknown as number }))).toContain('baseServings');
  });
  it('rejects unit cup (AC-12)', () => {
    const r = fields(valid({ ingredients: [{ name: 'Flour', quantity: 1, unit: 'cup' as never }] }));
    expect(r).toContain('ingredients[0].unit');
  });
  it('accepts each of the seven units', () => {
    expect(UNITS).toEqual(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece']);
    for (const unit of UNITS) {
      expect(validateMealInput(valid({ ingredients: [{ name: 'X', quantity: 1, unit }] })).ok).toBe(true);
    }
  });
  it('rejects quantity 0 or negative', () => {
    expect(fields(valid({ ingredients: [{ name: 'X', quantity: 0, unit: 'g' }] }))).toContain('ingredients[0].quantity');
    expect(fields(valid({ ingredients: [{ name: 'X', quantity: -1, unit: 'g' }] }))).toContain('ingredients[0].quantity');
  });
  it('rejects an ingredient without a name', () => {
    expect(fields(valid({ ingredients: [{ name: ' ', quantity: 1, unit: 'g' }] }))).toContain('ingredients[0].name');
  });
  it('accepts empty calories and cost, rejects negative values', () => {
    expect(validateMealInput(valid({ caloriesPerServing: null, totalCostEur: null })).ok).toBe(true);
    expect(fields(valid({ caloriesPerServing: -1 }))).toContain('caloriesPerServing');
    expect(fields(valid({ totalCostEur: -0.5 }))).toContain('totalCostEur');
  });
  it('rejects negative prep time', () => {
    expect(fields(valid({ prepMinutes: -5 }))).toContain('prepMinutes');
  });
});
