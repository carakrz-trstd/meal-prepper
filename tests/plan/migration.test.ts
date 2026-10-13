import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/server/db/open';
import { freshDb, seedMeal } from '../helpers';

const insert = (db: ReturnType<typeof freshDb>, week: string, day: number, mealId: number, servings = 4) =>
  db.prepare('INSERT INTO planned_meal (week_start, day_of_week, meal_id, servings) VALUES (?, ?, ?, ?)').run(week, day, mealId, servings);

describe('weekly plan migration (T-1)', () => {
  it('creates planned_meal, shopping_tick and app_setting', () => {
    const db = freshDb();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['planned_meal', 'shopping_tick', 'app_setting']));
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(2);
  });

  it('refuses a second meal on the same day (AC-2)', () => {
    const db = freshDb();
    insert(db, '2026-10-12', 1, seedMeal(db));
    expect(() => insert(db, '2026-10-12', 1, seedMeal(db))).toThrow();
  });

  it('refuses the same meal twice in one week, but allows it in another week (AC-3, AC-4)', () => {
    const db = freshDb();
    const m = seedMeal(db);
    insert(db, '2026-10-12', 1, m);
    expect(() => insert(db, '2026-10-12', 2, m)).toThrow();
    expect(() => insert(db, '2026-10-19', 1, m)).not.toThrow();
  });

  it('refuses servings 0 and 21, accepts 1 and 20 (AC-20)', () => {
    const db = freshDb();
    expect(() => insert(db, '2026-10-12', 1, seedMeal(db), 0)).toThrow();
    expect(() => insert(db, '2026-10-12', 2, seedMeal(db), 21)).toThrow();
    expect(() => insert(db, '2026-10-12', 3, seedMeal(db), 1)).not.toThrow();
    expect(() => insert(db, '2026-10-12', 4, seedMeal(db), 20)).not.toThrow();
  });

  it('refuses day 0 and 8', () => {
    const db = freshDb();
    expect(() => insert(db, '2026-10-12', 0, seedMeal(db))).toThrow();
    expect(() => insert(db, '2026-10-12', 8, seedMeal(db))).toThrow();
  });

  it('deleting a meal cascades its planned_meal rows (AC-18)', () => {
    const db = freshDb();
    const m = seedMeal(db);
    insert(db, '2026-10-12', 1, m);
    insert(db, '2026-10-19', 1, m);
    db.prepare('DELETE FROM meals WHERE id = ?').run(m);
    expect(db.prepare('SELECT COUNT(*) c FROM planned_meal').get()).toEqual({ c: 0 });
  });

  describe('persistence (AC-9)', () => {
    const dirs: string[] = [];
    afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

    it('plan data written to a file DB is present after closing and reopening', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-'));
      dirs.push(dir);
      const file = path.join(dir, 'p.db');
      const db1 = openDatabase(file);
      const m = seedMeal(db1);
      insert(db1, '2026-10-12', 3, m, 6);
      db1.close();
      const db2 = openDatabase(file);
      const row = db2.prepare('SELECT week_start, day_of_week, servings FROM planned_meal').get();
      db2.close();
      expect(row).toEqual({ week_start: '2026-10-12', day_of_week: 3, servings: 6 });
    });
  });
});
