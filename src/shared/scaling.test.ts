import { describe, it, expect } from 'vitest';
import { scaleQuantity } from './scaling';

describe('scaleQuantity (AC-8)', () => {
  it('doubles 200 g when servings go from 4 to 8', () => {
    expect(scaleQuantity(200, 4, 8)).toBe(400);
  });
  it('halves when servings go from 4 to 2', () => {
    expect(scaleQuantity(200, 4, 2)).toBe(100);
  });
  it('keeps the quantity at the same servings', () => {
    expect(scaleQuantity(200, 4, 4)).toBe(200);
  });
  it('keeps decimals', () => {
    expect(scaleQuantity(300, 3, 4)).toBeCloseTo(400);
    expect(scaleQuantity(100, 3, 4)).toBeCloseTo(133.333, 2);
  });
});
