import { describe, it, expect } from 'vitest';
import { normalizeIngredientName } from './normalize';

describe('normalizeIngredientName (AC-22)', () => {
  it('treats whitespace and case variants as equal', () => {
    expect(normalizeIngredientName('  Milk ')).toBe('milk');
    expect(normalizeIngredientName('MILK')).toBe('milk');
    expect(normalizeIngredientName('milk')).toBe('milk');
  });
  it('does no plural or synonym handling', () => {
    expect(normalizeIngredientName('Eggs')).not.toBe(normalizeIngredientName('Egg'));
    expect(normalizeIngredientName('olive oil')).not.toBe(normalizeIngredientName('oil, olive'));
  });
});
