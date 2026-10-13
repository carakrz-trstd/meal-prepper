import { describe, it, expect } from 'vitest';
import { buildShoppingList, type PlannedMealInput } from '../../src/shared/aggregate';
import { normalizeIngredientName } from '../../src/shared/normalize';
import type { Unit } from '../../src/shared/units';

const ing = (name: string, quantity: number, unit: Unit) => ({ name, nameKey: normalizeIngredientName(name), quantity, unit });
const meal = (over: Partial<PlannedMealInput> & Pick<PlannedMealInput, 'ingredients'>): PlannedMealInput => ({
  day: 1, mealName: 'Meal', servings: 4, baseServings: 4, ...over,
});
const find = (list: ReturnType<typeof buildShoppingList>, name: string) => list.find((e) => e.name.toLowerCase() === name.toLowerCase());

describe('buildShoppingList (T-4)', () => {
  it('scales by servings / base servings: 200 g at base 2 planned for 6 -> 600 g (AC-6)', () => {
    const list = buildShoppingList([meal({ servings: 6, baseServings: 2, ingredients: [ing('Flour', 200, 'g')] })]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Flour', quantity: 600, unit: 'g' });
  });

  it('merges the same ingredient across meals, ignoring case and surrounding whitespace (AC-7)', () => {
    const list = buildShoppingList([
      meal({ day: 1, ingredients: [ing('Flour', 100, 'g')] }),
      meal({ day: 2, mealName: 'B', ingredients: [ing(' flour ', 250, 'g')] }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].quantity).toBe(350);
  });

  it('adds g and kg of the same ingredient: 600 g + 0.5 kg -> 1.1 kg (AC-14)', () => {
    const list = buildShoppingList([
      meal({ day: 1, ingredients: [ing('Flour', 600, 'g')] }),
      meal({ day: 2, ingredients: [ing('Flour', 0.5, 'kg')] }),
    ]);
    expect(list[0]).toMatchObject({ quantity: 1.1, unit: 'kg' });
  });

  it('adds ml and l: 500 ml + 1 l -> 1.5 l (AC-14)', () => {
    const list = buildShoppingList([
      meal({ day: 1, ingredients: [ing('Milk', 500, 'ml')] }),
      meal({ day: 2, ingredients: [ing('Milk', 1, 'l')] }),
    ]);
    expect(list[0]).toMatchObject({ quantity: 1.5, unit: 'l' });
  });

  it('adds tsp and tbsp: 2 tsp + 1 tbsp -> 5 tsp shown as 1.7 tbsp (AC-14)', () => {
    const list = buildShoppingList([
      meal({ day: 1, ingredients: [ing('Sugar', 2, 'tsp')] }),
      meal({ day: 2, ingredients: [ing('Sugar', 1, 'tbsp')] }),
    ]);
    expect(list[0]).toMatchObject({ quantity: 1.7, unit: 'tbsp' });
  });

  it('keeps different unit families separate: Milk in ml and Milk in piece (AC-14)', () => {
    const list = buildShoppingList([
      meal({ day: 1, ingredients: [ing('Milk', 500, 'ml')] }),
      meal({ day: 2, ingredients: [ing('Milk', 1, 'piece')] }),
    ]);
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.unit).sort()).toEqual(['ml', 'piece']);
  });

  it('adds pinches of the same ingredient but keeps them apart from spoons and grams', () => {
    const list = buildShoppingList([
      meal({ day: 1, ingredients: [ing('Salt', 1, 'pinch'), ing('Salt', 1, 'tsp')] }),
      meal({ day: 2, servings: 8, ingredients: [ing('Salt', 1, 'pinch'), ing('Salt', 5, 'g')] }), // 8 / 4 servings: 2 pinch
    ]);
    const salt = list.filter((e) => e.name === 'Salt');
    expect(salt.map((e) => [e.family, e.quantity, e.unit])).toEqual([
      ['mass', 10, 'g'],
      ['spoon', 1, 'tsp'],
      ['pinch', 3, 'pinch'],
    ]);
    expect(salt[2].id).toBe('pinch:salt');
  });

  it('rounds pieces up after summing (AC-21)', () => {
    const list = buildShoppingList([
      meal({ day: 1, servings: 6, baseServings: 4, ingredients: [ing('Onion', 1, 'piece')] }), // 1.5
      meal({ day: 2, ingredients: [ing('Onion', 1, 'piece')] }), // + 1 = 2.5 -> 3
    ]);
    expect(list[0]).toMatchObject({ name: 'Onion', quantity: 3, unit: 'piece' });
  });

  it('sorts alphabetically, case-insensitively, with the German collator', () => {
    const list = buildShoppingList([
      meal({ ingredients: [ing('zucker', 1, 'g'), ing('Äpfel', 1, 'piece'), ing('Birne', 1, 'piece'), ing('aubergine', 1, 'piece')] }),
    ]);
    // German collation treats Ä like A: "Äpfel" (apfel) sorts before "aubergine" (p < u)
    expect(list.map((e) => e.name)).toEqual(['Äpfel', 'aubergine', 'Birne', 'zucker']);
  });

  it('ties are ordered by family: mass, volume, spoon, piece', () => {
    const list = buildShoppingList([
      meal({ ingredients: [ing('Milk', 1, 'piece'), ing('Milk', 2, 'tsp'), ing('Milk', 100, 'ml'), ing('Milk', 50, 'g')] }),
    ]);
    expect(list.map((e) => e.family)).toEqual(['mass', 'volume', 'spoon', 'piece']);
  });

  it('lists sources ordered by day with meal names (AC-24)', () => {
    const list = buildShoppingList([
      meal({ day: 3, mealName: 'Soup', ingredients: [ing('Onion', 1, 'piece')] }),
      meal({ day: 1, mealName: 'Pasta', ingredients: [ing('Onion', 1, 'piece')] }),
    ]);
    expect(list[0].sources).toEqual([{ day: 1, mealName: 'Pasta' }, { day: 3, mealName: 'Soup' }]);
  });

  it('uses the name of the first occurrence (earliest day) for display', () => {
    const list = buildShoppingList([
      meal({ day: 4, ingredients: [ing('ONION', 1, 'piece')] }),
      meal({ day: 2, ingredients: [ing('Onion', 1, 'piece')] }),
    ]);
    expect(list[0].name).toBe('Onion');
  });

  it('counts a meal once as a source even if it lists the ingredient twice', () => {
    const list = buildShoppingList([meal({ ingredients: [ing('Salt', 1, 'tsp'), ing('salt', 2, 'tsp')] })]);
    expect(list[0].sources).toHaveLength(1);
    expect(list[0]).toMatchObject({ quantity: 1, unit: 'tbsp' }); // 1 tsp + 2 tsp = 3 tsp = 1 tbsp
  });

  it('no planned meals -> empty list (AC-12)', () => {
    expect(buildShoppingList([])).toEqual([]);
  });

  it('a meal with changed ingredients gives the new result (AC-17, pure-function level)', () => {
    const before = buildShoppingList([meal({ ingredients: [ing('Flour', 500, 'g')] })]);
    const after = buildShoppingList([meal({ ingredients: [ing('Flour', 750, 'g')] })]);
    expect(find(before, 'flour')!.quantity).toBe(500);
    expect(find(after, 'flour')!.quantity).toBe(750);
  });

  it('returns the base-unit need and a stable id per entry (ticks)', () => {
    const list = buildShoppingList([meal({ ingredients: [ing('Flour', 1.5, 'kg'), ing('Egg', 2.2, 'piece')] })]);
    expect(find(list, 'flour')).toMatchObject({ id: 'mass:flour', needBase: 1500 });
    expect(find(list, 'egg')).toMatchObject({ id: 'piece:egg', needBase: 3 });
  });
});
