import type { Unit } from './units';
import { scaleQuantity } from './scaling';
import { FAMILY_ORDER, familyOf, formatBase, toBase, type UnitFamily } from './unit-conversion';

export interface PlannedIngredient {
  name: string;
  /** trimmed, lower-cased name (`ingredients.name_key`) */
  nameKey: string;
  quantity: number;
  unit: Unit;
}

export interface PlannedMealInput {
  day: number;
  mealName: string;
  servings: number;
  baseServings: number;
  ingredients: PlannedIngredient[];
}

export interface AggregatedEntry {
  /** `${family}:${nameKey}` */
  id: string;
  name: string;
  family: UnitFamily;
  /** display quantity and unit (rounded, switched at thresholds) */
  quantity: number;
  unit: Unit;
  /** need in the family's base unit (pieces after rounding up); used by tick reconciliation */
  needBase: number;
  sources: { day: number; mealName: string }[];
}

const collator = new Intl.Collator('de', { sensitivity: 'base' });

/**
 * Builds the weekly shopping list from the planned meals (AD-7, "Shopping list rules"):
 * scale by servings / base servings, merge by (name key, unit family), round, sort, list sources.
 */
export function buildShoppingList(plannedMeals: PlannedMealInput[]): AggregatedEntry[] {
  interface Group {
    key: string;
    name: string;
    family: UnitFamily;
    sumBase: number;
    sources: { day: number; mealName: string }[];
  }
  const groups = new Map<string, Group>();

  for (const meal of [...plannedMeals].sort((a, b) => a.day - b.day)) {
    for (const ing of meal.ingredients) {
      const family = familyOf(ing.unit);
      const id = `${family}:${ing.nameKey}`;
      let g = groups.get(id);
      if (!g) {
        g = { key: ing.nameKey, name: ing.name.trim(), family, sumBase: 0, sources: [] };
        groups.set(id, g);
      }
      g.sumBase += toBase(scaleQuantity(ing.quantity, meal.baseServings, meal.servings), ing.unit);
      if (!g.sources.some((s) => s.day === meal.day && s.mealName === meal.mealName)) {
        g.sources.push({ day: meal.day, mealName: meal.mealName });
      }
    }
  }

  return [...groups.entries()]
    .map(([id, g]): AggregatedEntry => {
      const display = formatBase(g.sumBase, g.family);
      const needBase = g.family === 'piece' ? display.quantity : g.sumBase;
      return { id, name: g.name, family: g.family, quantity: display.quantity, unit: display.unit, needBase, sources: g.sources };
    })
    .sort((a, b) => {
      const byName = collator.compare(a.name.toLowerCase(), b.name.toLowerCase());
      return byName !== 0 ? byName : FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family);
    });
}
