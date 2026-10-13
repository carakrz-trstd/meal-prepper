import { findBlacklisted } from './blacklist';
import { checkMeal } from './dietary';
import { describeLimits, evaluateLimits, type LimitMeal } from './limits';
import type { Limits, Participant, RestrictionKeyword, SuggestionMatch, SuggestionMealSummary, SuggestionResult } from './types';

/** What the suggestion logic needs to know about a meal; library meals and parsed online recipes both fit. */
export interface SuggestMeal extends LimitMeal {
  id: number;
  name: string;
  isFavourite?: boolean;
  ingredients: { name: string }[];
}

export interface SuggestContext {
  meals: SuggestMeal[];
  blacklist: string[];
  keywords: RestrictionKeyword[];
  /** the participants who are eating */
  participants: Participant[];
  /** library meals already planned in the selected week (skipped) */
  plannedMealIds: number[];
  limits: Limits;
  servings: number;
}

export type Assessment =
  | { ok: false }
  | { ok: true; unknownIngredients: string[]; usedEstimate: { calories: boolean; cost: boolean } };

/** Blacklist, dietary restrictions and limits for one meal (shared by library and online suggestions). */
export function assessMeal(meal: SuggestMeal, ctx: Pick<SuggestContext, 'blacklist' | 'keywords' | 'participants' | 'limits' | 'servings'>): Assessment {
  if (findBlacklisted(meal.ingredients, ctx.blacklist).length > 0) return { ok: false };
  const dietary = checkMeal(meal, ctx.participants, ctx.keywords);
  if (dietary.violations.length > 0) return { ok: false };
  const limits = evaluateLimits(meal, ctx.limits, ctx.servings);
  if (!limits.ok) return { ok: false };
  return { ok: true, unknownIngredients: dietary.unknownIngredients, usedEstimate: limits.estimateUsed };
}

export function summarize(meal: SuggestMeal): SuggestionMealSummary {
  const total = meal.cookMinutes === null ? null : (meal.prepMinutes ?? 0) + meal.cookMinutes;
  return {
    id: meal.id,
    name: meal.name,
    baseServings: meal.baseServings,
    caloriesPerServing: meal.caloriesPerServing,
    totalCostEur: meal.totalCostEur,
    prepMinutes: meal.prepMinutes,
    cookMinutes: meal.cookMinutes,
    totalMinutes: total,
    caloriesEstimated: meal.caloriesEstimated,
    costEstimated: meal.costEstimated,
    ingredients: meal.ingredients.map((i) => i.name),
  };
}

const collator = new Intl.Collator('de', { sensitivity: 'base' });

/**
 * Library suggestions (AD-12): all matches, ordered verified-before-unknown, favourites first, then by name.
 * Meals already planned that week, blacklisted meals, meals violating a participant's restriction and meals
 * missing a value for a set limit are left out.
 */
export function suggestFromLibrary(ctx: SuggestContext): SuggestionResult {
  const planned = new Set(ctx.plannedMealIds);
  const found: { match: SuggestionMatch; group: number }[] = [];

  for (const meal of ctx.meals) {
    if (planned.has(meal.id)) continue;
    const a = assessMeal(meal, ctx);
    if (!a.ok) continue;
    found.push({
      group: a.unknownIngredients.length > 0 ? 1 : 0,
      match: {
        source: 'library',
        mealId: meal.id,
        sourceUrl: null,
        meal: summarize(meal),
        favourite: meal.isFavourite === true,
        unknownIngredients: a.unknownIngredients,
        usedEstimate: a.usedEstimate,
      },
    });
  }

  found.sort(
    (x, y) =>
      x.group - y.group ||
      Number(y.match.favourite) - Number(x.match.favourite) ||
      collator.compare(x.match.meal.name, y.match.meal.name) ||
      x.match.meal.id - y.match.meal.id,
  );

  const appliedLimits = describeLimits(ctx.limits);
  const result: SuggestionResult = { matches: found.map((f) => f.match), appliedLimits };
  if (result.matches.length === 0) {
    const forWhom = ctx.participants.some((p) => p.restrictions.length > 0) ? ' for the selected participants' : '';
    result.message = `No meal matches${appliedLimits.length ? ` the limits (${appliedLimits.join('; ')})` : ''}${forWhom}.`;
  }
  return result;
}
