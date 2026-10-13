import { buildShoppingList, type AggregatedEntry, type PlannedIngredient } from '../../shared/aggregate';
import type { PlannedDay, ShoppingEntry, WeekView } from '../../shared/plan-types';
import { dayDate } from '../../shared/week';
import type { PlanRepository } from './plan.repository';
import { reconcileTicks } from './ticks.service';

export const DEFAULT_SERVINGS = 4;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The shopping list is derived on every read from the plan and the meals (AD-7); only ticks are stored. */
export function aggregateWeek(repo: PlanRepository, weekStart: string): AggregatedEntry[] {
  const rows = repo.listWeek(weekStart);
  const byMeal = new Map<number, PlannedIngredient[]>();
  for (const i of repo.listWeekIngredients(weekStart)) {
    const list = byMeal.get(i.mealId) ?? [];
    list.push({ name: i.name, nameKey: i.nameKey, quantity: i.quantity, unit: i.unit });
    byMeal.set(i.mealId, list);
  }
  return buildShoppingList(
    rows.map((r) => ({ day: r.day, mealName: r.mealName, servings: r.servings, baseServings: r.baseServings, ingredients: byMeal.get(r.mealId) ?? [] })),
  );
}

export function lastServings(repo: PlanRepository): number {
  const v = Number(repo.getSetting('last_servings'));
  return Number.isInteger(v) && v >= 1 && v <= 20 ? v : DEFAULT_SERVINGS;
}

export function buildWeekView(repo: PlanRepository, weekStart: string): WeekView {
  const rows = repo.listWeek(weekStart);
  const days: PlannedDay[] = [1, 2, 3, 4, 5, 6, 7].map((day) => {
    const r = rows.find((x) => x.day === day);
    return {
      day,
      date: dayDate(weekStart, day),
      entry: r
        ? {
            plannedMealId: r.id,
            mealId: r.mealId,
            mealName: r.mealName,
            servings: r.servings,
            caloriesPerServing: r.caloriesPerServing,
            totalCostEur: r.totalCostEur === null ? null : round2((r.totalCostEur * r.servings) / r.baseServings),
            totalMinutes: r.prepMinutes + r.cookMinutes,
          }
        : null,
    };
  });

  const aggregated = aggregateWeek(repo, weekStart);
  const ticked = reconcileTicks(repo, weekStart, aggregated);
  const shopping: ShoppingEntry[] = aggregated.map(({ needBase: _needBase, ...e }) => ({ ...e, ticked: ticked.has(e.id) }));
  return { weekStart, days, shopping, lastServings: lastServings(repo) };
}
