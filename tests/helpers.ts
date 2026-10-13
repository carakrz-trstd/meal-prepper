import { openDatabase, type Db } from '../src/server/db/open';
import { MealRepository } from '../src/server/db/MealRepository';
import type { Clock } from '../src/server/plan/clock';
import type { MealInput } from '../src/shared/types';

/** 2026-10-14 is a Wednesday; the current week starts on Monday 2026-10-12. */
export const FIXED_TODAY = '2026-10-14';
export const THIS_WEEK = '2026-10-12';
export const NEXT_WEEK = '2026-10-19';
export const fixedClock = (date = FIXED_TODAY): Clock => ({ today: () => date });

export function freshDb(): Db {
  return openDatabase(':memory:');
}

export function seedMeal(db: Db, over: Partial<MealInput> = {}): number {
  return new MealRepository(db).create({
    name: `Meal ${Math.random().toString(36).slice(2, 8)}`,
    baseServings: 4,
    ingredients: [{ name: 'Flour', quantity: 400, unit: 'g' }],
    prepMinutes: 10,
    cookMinutes: 25,
    caloriesPerServing: 600,
    totalCostEur: 8,
    ...over,
  }).id;
}
