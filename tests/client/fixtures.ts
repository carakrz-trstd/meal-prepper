import type { PlannedDay, ShoppingEntry, WeekView } from '../../src/shared/plan-types';
import type { Meal } from '../../src/shared/types';
import { dayDate } from '../../src/shared/week';

export const WEEK = '2026-10-12';

export function week(over: Partial<WeekView> = {}, entries: Record<number, Partial<NonNullable<PlannedDay['entry']>> & { mealName: string }> = {}): WeekView {
  const weekStart = over.weekStart ?? WEEK;
  return {
    weekStart,
    days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
      day,
      date: dayDate(weekStart, day),
      entry: entries[day]
        ? {
            plannedMealId: day,
            mealId: day * 10,
            servings: 4,
            caloriesPerServing: 600,
            totalCostEur: 8,
            totalMinutes: 35,
            participantIds: [],
            ...entries[day],
          }
        : null,
    })),
    shopping: [],
    lastServings: 4,
    ...over,
  };
}

export const entry = (over: Partial<ShoppingEntry> & { name: string }): ShoppingEntry => ({
  id: `mass:${over.name.toLowerCase()}`,
  family: 'mass',
  quantity: 100,
  unit: 'g',
  sources: [{ day: 1, mealName: 'Pasta' }],
  ticked: false,
  ...over,
});

export const meal = (over: Partial<Meal> & { id: number; name: string }): Meal => ({
  baseServings: 4,
  ingredients: [],
  prepMinutes: 10,
  cookMinutes: 25,
  totalMinutes: 35,
  caloriesPerServing: 600,
  caloriesEstimated: false,
  totalCostEur: 8,
  costEstimated: false,
  isFavourite: false,
  sourceUrl: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});
