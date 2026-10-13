import { describe, it, expect } from 'vitest';
import { containsTerm, findBlacklisted, matchedTerms, normalizeTerm } from '../../../src/shared/constraints/blacklist';

const ing = (...names: string[]) => names.map((name) => ({ name }));

describe('blacklist matching (T-2, AC-6, AC-13)', () => {
  it('normalises a term by trimming and lower-casing', () => {
    expect(normalizeTerm('  Mixed NUTS ')).toBe('mixed nuts');
  });

  it('"nuts" matches "mixed nuts" and "  NUTS " (equal or contains, ignoring case and whitespace)', () => {
    expect(containsTerm('mixed nuts', 'nuts')).toBe(true);
    expect(containsTerm('  NUTS ', 'nuts')).toBe(true);
    expect(containsTerm('Mixed Nuts', ' Nuts ')).toBe(true);
  });

  it('"nut" matches "walnut" (contains)', () => {
    expect(containsTerm('walnut', 'nut')).toBe(true);
  });

  it('"nuts" does not match "milk"', () => {
    expect(containsTerm('milk', 'nuts')).toBe(false);
  });

  it('an empty term never matches', () => {
    expect(containsTerm('milk', '')).toBe(false);
    expect(containsTerm('milk', '   ')).toBe(false);
  });

  it('an empty blacklist matches nothing', () => {
    expect(findBlacklisted(ing('Milk', 'Mixed nuts'), [])).toEqual([]);
    expect(matchedTerms(ing('Milk'), [])).toEqual([]);
  });

  it('multiple terms return each matched ingredient name', () => {
    expect(findBlacklisted(ing('Mixed nuts', 'Carrot', 'Peanut butter', 'Milk'), ['nuts', 'peanut'])).toEqual(['Mixed nuts', 'Peanut butter']);
  });

  it('matchedTerms returns the blacklisted terms that hit, once each', () => {
    expect(matchedTerms(ing('Mixed nuts', 'Salted nuts', 'Carrot'), ['nuts', 'milk'])).toEqual(['nuts']);
  });
});
