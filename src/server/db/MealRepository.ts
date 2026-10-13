import type { Db } from './open';
import type { Ingredient, Meal, MealInput } from '../../shared/types';
import type { Unit } from '../../shared/units';
import { normalizeIngredientName } from '../../shared/normalize';

interface MealRow {
  id: number;
  name: string;
  base_servings: number;
  calories_per_serving: number | null;
  calories_estimated: number;
  total_cost_eur: number | null;
  cost_estimated: number;
  prep_minutes: number;
  cook_minutes: number;
  is_favourite: number;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

interface IngredientRow {
  id: number;
  meal_id: number;
  position: number;
  name: string;
  name_key: string;
  quantity: number;
  unit: Unit;
}

const now = () => new Date().toISOString();

function toIngredient(r: IngredientRow): Ingredient {
  return { id: r.id, position: r.position, name: r.name, nameKey: r.name_key, quantity: r.quantity, unit: r.unit };
}

function toMeal(r: MealRow, ingredients: IngredientRow[]): Meal {
  return {
    id: r.id,
    name: r.name,
    baseServings: r.base_servings,
    ingredients: ingredients.map(toIngredient),
    prepMinutes: r.prep_minutes,
    cookMinutes: r.cook_minutes,
    totalMinutes: r.prep_minutes + r.cook_minutes,
    caloriesPerServing: r.calories_per_serving,
    caloriesEstimated: r.calories_estimated === 1,
    totalCostEur: r.total_cost_eur,
    costEstimated: r.cost_estimated === 1,
    isFavourite: r.is_favourite === 1,
    sourceUrl: r.source_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** SQL access for meals and their ingredients (AD-14). */
export class MealRepository {
  constructor(private readonly db: Db) {}

  private ingredientsOf(mealId: number): IngredientRow[] {
    return this.db
      .prepare('SELECT * FROM ingredients WHERE meal_id = ? ORDER BY position')
      .all(mealId) as IngredientRow[];
  }

  private insertIngredients(mealId: number, input: MealInput): void {
    const stmt = this.db.prepare(
      `INSERT INTO ingredients (meal_id, position, name, name_key, quantity, unit)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    input.ingredients.forEach((ing, i) => {
      const name = ing.name.trim();
      stmt.run(mealId, i, name, normalizeIngredientName(name), ing.quantity, ing.unit);
    });
  }

  list(opts: { favouritesOnly?: boolean } = {}): Meal[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM meals ${opts.favouritesOnly ? 'WHERE is_favourite = 1' : ''}
         ORDER BY lower(name), id`,
      )
      .all() as MealRow[];
    return rows.map((r) => toMeal(r, this.ingredientsOf(r.id)));
  }

  get(id: number): Meal | null {
    const row = this.db.prepare('SELECT * FROM meals WHERE id = ?').get(id) as MealRow | undefined;
    return row ? toMeal(row, this.ingredientsOf(id)) : null;
  }

  create(input: MealInput): Meal {
    const id = this.db.transaction(() => {
      const ts = now();
      const res = this.db
        .prepare(
          `INSERT INTO meals (name, base_servings, calories_per_serving, calories_estimated,
             total_cost_eur, cost_estimated, prep_minutes, cook_minutes, source_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.name.trim(),
          input.baseServings,
          input.caloriesPerServing ?? null,
          input.caloriesEstimated ? 1 : 0,
          input.totalCostEur ?? null,
          input.costEstimated ? 1 : 0,
          input.prepMinutes ?? 0,
          input.cookMinutes,
          input.sourceUrl ?? null,
          ts,
          ts,
        );
      const mealId = Number(res.lastInsertRowid);
      this.insertIngredients(mealId, input);
      return mealId;
    })();
    return this.get(id)!;
  }

  update(id: number, input: MealInput): Meal | null {
    const existing = this.get(id);
    if (!existing) return null;
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE meals SET name = ?, base_servings = ?, calories_per_serving = ?, calories_estimated = ?,
             total_cost_eur = ?, cost_estimated = ?, prep_minutes = ?, cook_minutes = ?, source_url = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.name.trim(),
          input.baseServings,
          input.caloriesPerServing ?? null,
          input.caloriesEstimated ? 1 : 0,
          input.totalCostEur ?? null,
          input.costEstimated ? 1 : 0,
          input.prepMinutes ?? 0,
          input.cookMinutes,
          input.sourceUrl ?? existing.sourceUrl,
          now(),
          id,
        );
      this.db.prepare('DELETE FROM ingredients WHERE meal_id = ?').run(id);
      this.insertIngredients(id, input);
    })();
    return this.get(id);
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM meals WHERE id = ?').run(id).changes > 0;
  }

  setFavourite(id: number, value: boolean): Meal | null {
    const res = this.db.prepare('UPDATE meals SET is_favourite = ? WHERE id = ?').run(value ? 1 : 0, id);
    return res.changes > 0 ? this.get(id) : null;
  }

  /** Source URLs of imported meals (Epic 3 skips online results that are already in the library, AC-23). */
  sourceUrls(): Set<string> {
    const rows = this.db.prepare('SELECT source_url AS url FROM meals WHERE source_url IS NOT NULL').all() as { url: string }[];
    return new Set(rows.map((r) => r.url));
  }

  existsByName(name: string, excludeId?: number): boolean {
    const row = this.db
      .prepare('SELECT 1 AS x FROM meals WHERE lower(name) = lower(?) AND (? IS NULL OR id != ?) LIMIT 1')
      .get(name.trim(), excludeId ?? null, excludeId ?? null);
    return row !== undefined;
  }
}
