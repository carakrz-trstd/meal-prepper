import { describe, it, expect } from 'vitest';
import { RESTRICTIONS } from '../../../src/shared/constraints/types';
import { seededKeywords } from '../support';

describe('restriction keyword seed (T-3, NFR-3)', () => {
  const kw = seededKeywords();

  it('every restriction has at least one forbidden and one safe keyword', () => {
    for (const r of RESTRICTIONS) {
      expect(kw.filter((k) => k.restriction === r && k.effect === 'forbidden').length, `${r} forbidden`).toBeGreaterThan(0);
      expect(kw.filter((k) => k.restriction === r && k.effect === 'safe').length, `${r} safe`).toBeGreaterThan(0);
    }
  });

  it('keywords are stored trimmed and lower-case', () => {
    for (const k of kw) expect(k.keyword).toBe(k.keyword.trim().toLowerCase());
  });

  it('contains the starter examples of the spec', () => {
    const has = (restriction: string, keyword: string, effect: string) =>
      kw.some((k) => k.restriction === restriction && k.keyword === keyword && k.effect === effect);
    expect(has('vegetarian', 'chicken', 'forbidden')).toBe(true);
    expect(has('gluten-free', 'rice flour', 'safe')).toBe(true);
    expect(has('lactose-free', 'coconut milk', 'safe')).toBe(true);
    expect(has('nut-free', 'nutmeg', 'safe')).toBe(true);
    expect(has('seafood-free', 'shrimp', 'forbidden')).toBe(true);
  });
});
