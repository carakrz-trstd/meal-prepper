import type { LimitKey, Limits } from './types';

export interface LimitMeal {
  baseServings: number;
  caloriesPerServing: number | null;
  caloriesEstimated: boolean;
  totalCostEur: number | null;
  costEstimated: boolean;
  prepMinutes: number | null;
  cookMinutes: number | null;
}

export interface LimitEvaluation {
  ok: boolean;
  /** limits that could not be checked because the meal has no value for them (AC-12) */
  excludedBecauseMissing: LimitKey[];
  usedEstimate: boolean;
  estimateUsed: { calories: boolean; cost: boolean };
}

const EPS = 1e-9;
const isSet = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Checks a meal against the limits (AD-11): calories per serving; budget = total cost scaled to the servings
 * being planned; time = preparation + cooking minutes. A missing value for a set limit excludes the meal.
 */
export function evaluateLimits(meal: LimitMeal, limits: Limits, servings: number): LimitEvaluation {
  const missing: LimitKey[] = [];
  const failed: LimitKey[] = [];
  const estimateUsed = { calories: false, cost: false };

  if (isSet(limits.calorieLimit)) {
    if (meal.caloriesPerServing === null) missing.push('calories');
    else {
      if (meal.caloriesPerServing > limits.calorieLimit + EPS) failed.push('calories');
      if (meal.caloriesEstimated) estimateUsed.calories = true;
    }
  }
  if (isSet(limits.budgetLimit)) {
    if (meal.totalCostEur === null) missing.push('budget');
    else {
      const scaled = (meal.totalCostEur * servings) / meal.baseServings;
      if (scaled > limits.budgetLimit + EPS) failed.push('budget');
      if (meal.costEstimated) estimateUsed.cost = true;
    }
  }
  if (isSet(limits.timeLimit)) {
    if (meal.cookMinutes === null) missing.push('time');
    else if ((meal.prepMinutes ?? 0) + meal.cookMinutes > limits.timeLimit + EPS) failed.push('time');
  }

  return {
    ok: missing.length === 0 && failed.length === 0,
    excludedBecauseMissing: missing,
    usedEstimate: estimateUsed.calories || estimateUsed.cost,
    estimateUsed,
  };
}

/** Human-readable list of the limits that are set, for the "no meal matches" message (AC-5). */
export function describeLimits(limits: Limits): string[] {
  const out: string[] = [];
  if (isSet(limits.calorieLimit)) out.push(`calories: at most ${limits.calorieLimit} kcal per serving`);
  if (isSet(limits.budgetLimit)) out.push(`budget: at most ${limits.budgetLimit} EUR`);
  if (isSet(limits.timeLimit)) out.push(`time: at most ${limits.timeLimit} min`);
  return out;
}
