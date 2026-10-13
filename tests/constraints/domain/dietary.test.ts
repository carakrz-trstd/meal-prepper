import { describe, it, expect } from 'vitest';
import { checkMeal, classifyIngredient } from '../../../src/shared/constraints/dietary';
import type { RestrictionKeyword } from '../../../src/shared/constraints/types';
import { participant, seededKeywords } from '../support';

const kw = seededKeywords();
const ing = (...names: string[]) => names.map((name) => ({ name }));

describe('classifyIngredient (T-3, AC-8, AC-9, NFR-3)', () => {
  it('chicken violates vegetarian', () => {
    expect(classifyIngredient('Chicken breast', 'vegetarian', kw)).toBe('violating');
  });

  it('"rice flour" is safe for gluten-free while "wheat flour" violates', () => {
    expect(classifyIngredient('Rice flour', 'gluten-free', kw)).toBe('verified');
    expect(classifyIngredient('Wheat flour', 'gluten-free', kw)).toBe('violating');
    expect(classifyIngredient('Flour', 'gluten-free', kw)).toBe('violating');
  });

  it('"coconut milk" is safe for lactose-free, "milk" violates', () => {
    expect(classifyIngredient('Coconut milk', 'lactose-free', kw)).toBe('verified');
    expect(classifyIngredient('Milk', 'lactose-free', kw)).toBe('violating');
  });

  it('"peanut butter" violates nut-free; "nutmeg" and "coconut" are safe', () => {
    expect(classifyIngredient('Peanut butter', 'nut-free', kw)).toBe('violating');
    expect(classifyIngredient('Nutmeg', 'nut-free', kw)).toBe('verified');
    expect(classifyIngredient('Coconut', 'nut-free', kw)).toBe('verified');
    expect(classifyIngredient('Mixed nuts', 'nut-free', kw)).toBe('violating');
  });

  it('vegan forbids egg, honey and cheese; vegetarian allows them', () => {
    for (const name of ['Egg', 'Honey', 'Cheese']) {
      expect(classifyIngredient(name, 'vegan', kw)).toBe('violating');
      expect(classifyIngredient(name, 'vegetarian', kw)).toBe('verified');
    }
  });

  it('seafood-free forbids shrimp and fish, but not chicken', () => {
    expect(classifyIngredient('Shrimp', 'seafood-free', kw)).toBe('violating');
    expect(classifyIngredient('Fish sauce', 'seafood-free', kw)).toBe('violating');
    expect(classifyIngredient('Chicken', 'seafood-free', kw)).toBe('verified');
  });

  it('an unmatched ingredient ("dragon fruit") is unknown for every restriction', () => {
    for (const r of ['vegetarian', 'vegan', 'gluten-free', 'lactose-free', 'nut-free', 'seafood-free'] as const) {
      expect(classifyIngredient('Dragon fruit', r, kw)).toBe('unknown');
    }
  });

  it('plain safe ingredients are verified, ignoring case and whitespace', () => {
    expect(classifyIngredient('  CARROT ', 'vegan', kw)).toBe('verified');
    expect(classifyIngredient('Olive oil', 'gluten-free', kw)).toBe('verified');
  });

  it('safe words match whole words only ("peach" is not "pea")', () => {
    const custom: RestrictionKeyword[] = [{ restriction: 'vegan', keyword: 'pea', effect: 'safe' }];
    expect(classifyIngredient('Pea', 'vegan', custom)).toBe('verified');
    expect(classifyIngredient('Peach', 'vegan', custom)).toBe('unknown');
  });

  it('on equal keyword length the forbidden keyword wins (caution)', () => {
    const custom: RestrictionKeyword[] = [
      { restriction: 'vegan', keyword: 'cream', effect: 'forbidden' },
      { restriction: 'vegan', keyword: 'cream', effect: 'safe' },
    ];
    expect(classifyIngredient('Cream', 'vegan', custom)).toBe('violating');
  });

  it('extending the mapping by adding a row changes the result without code changes (NFR-3)', () => {
    expect(classifyIngredient('Dragon fruit', 'vegan', kw)).toBe('unknown');
    const extended: RestrictionKeyword[] = [...kw, { restriction: 'vegan', keyword: 'dragon fruit', effect: 'safe' }];
    expect(classifyIngredient('Dragon fruit', 'vegan', extended)).toBe('verified');
  });
});

describe('checkMeal (T-3, AC-8, AC-9)', () => {
  const anna = participant(1, 'Anna', ['vegetarian']);
  const ben = participant(2, 'Ben', ['gluten-free']);

  it('reports a violation of participant B (not A) with B\'s name and the restriction (AC-8)', () => {
    const r = checkMeal({ ingredients: ing('Carrot', 'Wheat flour') }, [anna, ben], kw);
    expect(r.violations).toEqual([{ participant: 'Ben', restriction: 'gluten-free', ingredient: 'Wheat flour' }]);
  });

  it('a violation by any one participant is detected (AC-8)', () => {
    const r = checkMeal({ ingredients: ing('Chicken', 'Wheat flour') }, [anna, ben], kw);
    expect(r.violations.map((v) => v.participant).sort()).toEqual(['Anna', 'Ben']);
  });

  it('lists unknown ingredients once and does not list violating ones as unknown (AC-9)', () => {
    const r = checkMeal({ ingredients: ing('Dragon fruit', 'Chicken') }, [anna], kw);
    expect(r.unknownIngredients).toEqual(['Dragon fruit']);
    expect(r.violations).toHaveLength(1);
  });

  it('a meal with a violation and an unknown ingredient reports both; callers treat it as violating', () => {
    const r = checkMeal({ ingredients: ing('Chicken', 'Dragon fruit') }, [anna], kw);
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.unknownIngredients).toContain('Dragon fruit');
  });

  it('zero participants -> no check', () => {
    expect(checkMeal({ ingredients: ing('Chicken', 'Dragon fruit') }, [], kw)).toEqual({ violations: [], unknownIngredients: [] });
  });

  it('participants without restrictions are not checked', () => {
    expect(checkMeal({ ingredients: ing('Chicken', 'Dragon fruit') }, [participant(3, 'Cleo', [])], kw)).toEqual({ violations: [], unknownIngredients: [] });
  });

  it('a fully verified meal has no findings', () => {
    expect(checkMeal({ ingredients: ing('Carrot', 'Rice', 'Olive oil') }, [anna, ben], kw)).toEqual({ violations: [], unknownIngredients: [] });
  });
});
