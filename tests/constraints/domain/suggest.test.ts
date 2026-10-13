import { describe, it, expect } from 'vitest';
import { suggestFromLibrary, type SuggestContext } from '../../../src/shared/constraints/suggest';
import { mealOf, participant, seededKeywords } from '../support';

const keywords = seededKeywords();
const ctx = (over: Partial<SuggestContext> & Pick<SuggestContext, 'meals'>): SuggestContext => ({
  blacklist: [],
  keywords,
  participants: [],
  plannedMealIds: [],
  limits: {},
  servings: 4,
  ...over,
});
const names = (r: ReturnType<typeof suggestFromLibrary>) => r.matches.map((x) => x.meal.name);

describe('suggestFromLibrary (T-7)', () => {
  it('puts favourites before non-favourites, in stable name order (AC-14)', () => {
    const r = suggestFromLibrary(ctx({
      meals: [mealOf({ id: 1, name: 'Zebra' }), mealOf({ id: 2, name: 'Apple pie', isFavourite: false }), mealOf({ id: 3, name: 'Mango', isFavourite: true })],
    }));
    expect(names(r)).toEqual(['Mango', 'Apple pie', 'Zebra']);
  });

  it('verified meals come before unknown-ingredient meals, each group favourites first; unknown ones carry their ingredients (AC-9)', () => {
    const r = suggestFromLibrary(ctx({
      participants: [participant(1, 'Anna', ['vegan'])],
      meals: [
        mealOf({ id: 1, name: 'Mystery Fav', isFavourite: true, ingredients: ['Dragon fruit'] }),
        mealOf({ id: 2, name: 'Plain', ingredients: ['Carrot', 'Rice'] }),
        mealOf({ id: 3, name: 'Verified Fav', isFavourite: true, ingredients: ['Carrot'] }),
        mealOf({ id: 4, name: 'Mystery', ingredients: ['Dragon fruit'] }),
      ],
    }));
    expect(names(r)).toEqual(['Verified Fav', 'Plain', 'Mystery Fav', 'Mystery']);
    expect(r.matches[2].unknownIngredients).toEqual(['Dragon fruit']);
    expect(r.matches[0].unknownIngredients).toEqual([]);
  });

  it('skips meals planned in the selected week (AC-14)', () => {
    const r = suggestFromLibrary(ctx({ plannedMealIds: [2], meals: [mealOf({ id: 1, name: 'A' }), mealOf({ id: 2, name: 'B' })] }));
    expect(names(r)).toEqual(['A']);
  });

  it('excludes blacklisted meals (AC-6)', () => {
    const r = suggestFromLibrary(ctx({
      blacklist: ['nuts'],
      meals: [mealOf({ id: 1, name: 'Nutty', ingredients: ['Mixed nuts'] }), mealOf({ id: 2, name: 'Fine' })],
    }));
    expect(names(r)).toEqual(['Fine']);
  });

  it('excludes meals violating a ticked participant\'s restriction, keeps unknown ones flagged (AC-11)', () => {
    const r = suggestFromLibrary(ctx({
      participants: [participant(1, 'Anna', ['vegetarian'])],
      meals: [
        mealOf({ id: 1, name: 'Curry', ingredients: ['Chicken'] }),
        mealOf({ id: 2, name: 'Salad', ingredients: ['Lettuce'] }),
        mealOf({ id: 3, name: 'Odd', ingredients: ['Dragon fruit'] }),
      ],
    }));
    expect(names(r)).toEqual(['Salad', 'Odd']);
  });

  it('excludes a meal with both a violation and an unknown ingredient (AC-11)', () => {
    const r = suggestFromLibrary(ctx({
      participants: [participant(1, 'Anna', ['vegetarian'])],
      meals: [mealOf({ id: 1, name: 'Both', ingredients: ['Chicken', 'Dragon fruit'] })],
    }));
    expect(r.matches).toEqual([]);
  });

  it('excludes meals missing a value for a set limit (AC-12)', () => {
    const r = suggestFromLibrary(ctx({
      limits: { calorieLimit: 500 },
      meals: [mealOf({ id: 1, name: 'NoCal', caloriesPerServing: null }), mealOf({ id: 2, name: 'Ok', caloriesPerServing: 300 }), mealOf({ id: 3, name: 'TooMuch', caloriesPerServing: 900 })],
    }));
    expect(names(r)).toEqual(['Ok']);
  });

  it('applies combined limits and scales the budget to the servings (AC-2, AC-4)', () => {
    const meals = [mealOf({ id: 1, name: 'Cheap', totalCostEur: 8, baseServings: 4 })];
    expect(names(suggestFromLibrary(ctx({ meals, limits: { budgetLimit: 4 }, servings: 2 })))).toEqual(['Cheap']); // 4 EUR for 2
    expect(names(suggestFromLibrary(ctx({ meals, limits: { budgetLimit: 4 }, servings: 3 })))).toEqual([]); // 6 EUR for 3
  });

  it('no matches -> empty list naming the applied limits (AC-5)', () => {
    const r = suggestFromLibrary(ctx({ limits: { calorieLimit: 10, timeLimit: 5 }, meals: [mealOf({ id: 1, name: 'Big' })] }));
    expect(r.matches).toEqual([]);
    expect(r.appliedLimits).toEqual(['calories: at most 10 kcal per serving', 'time: at most 5 min']);
    expect(r.message).toMatch(/no meal matches/i);
    expect(r.message).toContain('calories');
    expect(r.message).toContain('time');
  });

  it('with no meals at all the message says so', () => {
    const r = suggestFromLibrary(ctx({ meals: [] }));
    expect(r.matches).toEqual([]);
    expect(r.message).toMatch(/no meal matches/i);
  });

  it('lists every match once, in a stable order, and flags used estimates (AC-22)', () => {
    const meals = [
      mealOf({ id: 1, name: 'B', caloriesPerServing: 300, caloriesEstimated: true }),
      mealOf({ id: 2, name: 'A', caloriesPerServing: 300 }),
    ];
    const r = suggestFromLibrary(ctx({ meals, limits: { calorieLimit: 500 } }));
    expect(names(r)).toEqual(['A', 'B']);
    expect(r.matches[1].usedEstimate).toEqual({ calories: true, cost: false });
    expect(r.matches[0].usedEstimate).toEqual({ calories: false, cost: false });
    expect(r.matches.every((x) => x.source === 'library')).toBe(true);
    expect(suggestFromLibrary(ctx({ meals, limits: { calorieLimit: 500 } }))).toEqual(r);
  });

  it('describes each match for the client', () => {
    const r = suggestFromLibrary(ctx({ meals: [mealOf({ id: 7, name: 'Soup', prepMinutes: 5, cookMinutes: 15, isFavourite: true })] }));
    expect(r.matches[0]).toMatchObject({
      mealId: 7,
      favourite: true,
      meal: { id: 7, name: 'Soup', totalMinutes: 20, caloriesPerServing: 400 },
    });
  });
});
