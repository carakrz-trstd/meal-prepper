import type { Db } from '../../src/server/db/open';
import { freshDb } from '../helpers';
import type { Restriction, RestrictionKeyword } from '../../src/shared/constraints/types';
import type { Meal } from '../../src/shared/types';

export { freshDb };

/** The seeded restriction keywords of a fresh database (migration 003). */
export function seededKeywords(db: Db = freshDb()): RestrictionKeyword[] {
  return db
    .prepare('SELECT restriction, keyword, effect FROM restriction_keyword ORDER BY id')
    .all() as RestrictionKeyword[];
}

export const participant = (id: number, name: string, restrictions: Restriction[]) => ({ id, name, restrictions });

/** A Meal-shaped object for pure-domain tests; every field has a sensible default. */
export function mealOf(over: Omit<Partial<Meal>, 'ingredients'> & { id: number; name: string; ingredients?: string[] }): Meal {
  const { ingredients = ['Carrot'], ...rest } = over;
  return {
    baseServings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    totalMinutes: (over.prepMinutes ?? 10) + (over.cookMinutes ?? 20),
    caloriesPerServing: 400,
    caloriesEstimated: false,
    totalCostEur: 8,
    costEstimated: false,
    isFavourite: false,
    sourceUrl: null,
    createdAt: '',
    updatedAt: '',
    ...rest,
    ingredients: ingredients.map((name, i) => ({ id: i, position: i, name, nameKey: name.trim().toLowerCase(), quantity: 100, unit: 'g' as const })),
  };
}
