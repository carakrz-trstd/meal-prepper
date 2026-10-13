import { describe, it, expect } from 'vitest';
import { suggestFromLibrary } from '../../../src/shared/constraints/suggest';
import { mealOf, participant, seededKeywords } from '../support';

describe('suggest performance (T-7, AC-10, NFR-1)', () => {
  it('500 meals with 10 ingredients each and 3 participants are processed in under 100 ms', () => {
    const keywords = seededKeywords();
    const pool = ['Carrot', 'Rice', 'Chicken', 'Wheat flour', 'Milk', 'Dragon fruit', 'Olive oil', 'Peanut butter', 'Shrimp', 'Onion'];
    const meals = Array.from({ length: 500 }, (_, i) =>
      mealOf({ id: i + 1, name: `Meal ${i}`, ingredients: Array.from({ length: 10 }, (_, j) => pool[(i + j) % pool.length]) }),
    );
    const participants = [participant(1, 'A', ['vegetarian']), participant(2, 'B', ['gluten-free']), participant(3, 'C', ['nut-free'])];
    const t0 = performance.now();
    suggestFromLibrary({ meals, blacklist: ['nuts'], keywords, participants, plannedMealIds: [], limits: { calorieLimit: 500, timeLimit: 60 }, servings: 4 });
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
