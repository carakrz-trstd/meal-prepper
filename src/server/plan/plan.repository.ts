import type { Db } from '../db/open';
import type { Unit } from '../../shared/units';
import type { UnitFamily } from '../../shared/unit-conversion';

export interface PlannedRow {
  id: number;
  day: number;
  mealId: number;
  servings: number;
  mealName: string;
  baseServings: number;
  caloriesPerServing: number | null;
  totalCostEur: number | null;
  prepMinutes: number;
  cookMinutes: number;
}

export interface IngredientRow {
  mealId: number;
  name: string;
  nameKey: string;
  quantity: number;
  unit: Unit;
}

export interface TickRow {
  key: string;
  family: UnitFamily;
  tickedQty: number;
}

/** SQL for the plan, the shopping ticks and app settings (AD-5: better-sqlite3, hand-written SQL). */
export class PlanRepository {
  constructor(readonly db: Db) {}

  mealExists(mealId: number): boolean {
    return this.db.prepare('SELECT 1 AS x FROM meals WHERE id = ?').get(mealId) !== undefined;
  }

  getDay(weekStart: string, day: number): { id: number; mealId: number; servings: number } | undefined {
    return this.db
      .prepare('SELECT id, meal_id AS mealId, servings FROM planned_meal WHERE week_start = ? AND day_of_week = ?')
      .get(weekStart, day) as { id: number; mealId: number; servings: number } | undefined;
  }

  dayOfMeal(weekStart: string, mealId: number): number | undefined {
    const row = this.db
      .prepare('SELECT day_of_week AS day FROM planned_meal WHERE week_start = ? AND meal_id = ?')
      .get(weekStart, mealId) as { day: number } | undefined;
    return row?.day;
  }

  insert(weekStart: string, day: number, mealId: number, servings: number): void {
    this.db.prepare('INSERT INTO planned_meal (week_start, day_of_week, meal_id, servings) VALUES (?, ?, ?, ?)').run(weekStart, day, mealId, servings);
  }

  update(id: number, mealId: number, servings: number): void {
    this.db.prepare('UPDATE planned_meal SET meal_id = ?, servings = ? WHERE id = ?').run(mealId, servings, id);
  }

  updateServings(id: number, servings: number): void {
    this.db.prepare('UPDATE planned_meal SET servings = ? WHERE id = ?').run(servings, id);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM planned_meal WHERE id = ?').run(id);
  }

  listWeek(weekStart: string): PlannedRow[] {
    return this.db
      .prepare(
        `SELECT p.id, p.day_of_week AS day, p.meal_id AS mealId, p.servings, m.name AS mealName,
                m.base_servings AS baseServings, m.calories_per_serving AS caloriesPerServing,
                m.total_cost_eur AS totalCostEur, m.prep_minutes AS prepMinutes, m.cook_minutes AS cookMinutes
         FROM planned_meal p JOIN meals m ON m.id = p.meal_id
         WHERE p.week_start = ? ORDER BY p.day_of_week`,
      )
      .all(weekStart) as PlannedRow[];
  }

  listWeekIngredients(weekStart: string): IngredientRow[] {
    return this.db
      .prepare(
        `SELECT i.meal_id AS mealId, i.name, i.name_key AS nameKey, i.quantity, i.unit
         FROM ingredients i JOIN planned_meal p ON p.meal_id = i.meal_id
         WHERE p.week_start = ? ORDER BY i.meal_id, i.position`,
      )
      .all(weekStart) as IngredientRow[];
  }

  usageCount(mealId: number): number {
    return (this.db.prepare('SELECT COUNT(*) AS c FROM planned_meal WHERE meal_id = ?').get(mealId) as { c: number }).c;
  }

  listTicks(weekStart: string): TickRow[] {
    return this.db
      .prepare('SELECT ingredient_key AS key, unit_family AS family, ticked_qty AS tickedQty FROM shopping_tick WHERE week_start = ?')
      .all(weekStart) as TickRow[];
  }

  upsertTick(weekStart: string, key: string, family: UnitFamily, qty: number): void {
    this.db
      .prepare(
        `INSERT INTO shopping_tick (week_start, ingredient_key, unit_family, ticked_qty) VALUES (?, ?, ?, ?)
         ON CONFLICT (week_start, ingredient_key, unit_family) DO UPDATE SET ticked_qty = excluded.ticked_qty`,
      )
      .run(weekStart, key, family, qty);
  }

  deleteTick(weekStart: string, key: string, family: UnitFamily): void {
    this.db.prepare('DELETE FROM shopping_tick WHERE week_start = ? AND ingredient_key = ? AND unit_family = ?').run(weekStart, key, family);
  }

  getSetting(key: string): string | undefined {
    return (this.db.prepare('SELECT value FROM app_setting WHERE key = ?').get(key) as { value: string } | undefined)?.value;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }
}
