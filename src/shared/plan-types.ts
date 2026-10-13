import type { Unit } from './units';
import type { UnitFamily } from './unit-conversion';

export type { UnitFamily };

export interface PlannedEntry {
  plannedMealId: number;
  mealId: number;
  mealName: string;
  servings: number;
  /** null is shown as "missing" */
  caloriesPerServing: number | null;
  /** total cost scaled to the planned servings (cost * servings / base servings); null if the meal has no cost */
  totalCostEur: number | null;
  /** preparation + cooking minutes */
  totalMinutes: number;
}

export interface PlannedDay {
  /** 1 (Monday) to 7 (Sunday) */
  day: number;
  /** YYYY-MM-DD */
  date: string;
  entry: PlannedEntry | null;
}

export interface ShoppingEntry {
  /** `${family}:${nameKey}` */
  id: string;
  name: string;
  family: UnitFamily;
  quantity: number;
  unit: Unit;
  sources: { day: number; mealName: string }[];
  ticked: boolean;
}

export interface WeekView {
  /** ISO date of the Monday */
  weekStart: string;
  days: PlannedDay[];
  shopping: ShoppingEntry[];
  /** servings used for the previously planned meal, 4 initially (AC-15) */
  lastServings: number;
}

export type PlanErrorCode =
  | 'INVALID_WEEK'
  | 'WEEK_IN_PAST'
  | 'INVALID_DAY'
  | 'INVALID_SERVINGS'
  | 'MEAL_NOT_FOUND'
  | 'DAY_OCCUPIED'
  | 'DAY_EMPTY'
  | 'MEAL_ALREADY_PLANNED'
  | 'ENTRY_NOT_FOUND';
