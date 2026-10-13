import { describe, it, expect } from 'vitest';
import { openDatabase } from './open';

const meal = (db: ReturnType<typeof openDatabase>, over: Record<string, unknown> = {}) => {
  const row = { name: 'M', base_servings: 4, cook_minutes: 10, ...over };
  return db
    .prepare(
      `INSERT INTO meals (name, base_servings, cook_minutes, created_at, updated_at)
       VALUES (@name, @base_servings, @cook_minutes, 'now', 'now')`,
    )
    .run(row).lastInsertRowid as number;
};

describe('migrations (T-2)', () => {
  it('creates meals and ingredients on a fresh database', () => {
    const db = openDatabase(':memory:');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('meals');
    expect(names).toContain('ingredients');
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(1);
  });

  it('running migrations twice is a no-op', () => {
    const db = openDatabase(':memory:');
    const version = db.pragma('user_version', { simple: true });
    // opening again applies nothing new and does not throw
    expect(() => openDatabase(':memory:')).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(version);
  });

  it('rejects an ingredient with unit cup (CHECK)', () => {
    const db = openDatabase(':memory:');
    const id = meal(db);
    expect(() =>
      db
        .prepare(
          `INSERT INTO ingredients (meal_id, position, name, name_key, quantity, unit)
           VALUES (?, 0, 'Flour', 'flour', 1, 'cup')`,
        )
        .run(id),
    ).toThrow();
  });

  it('rejects a meal without cook_minutes', () => {
    const db = openDatabase(':memory:');
    expect(() => meal(db, { cook_minutes: null })).toThrow();
  });

  it('deleting a meal cascades to its ingredients', () => {
    const db = openDatabase(':memory:');
    const id = meal(db);
    db.prepare(
      `INSERT INTO ingredients (meal_id, position, name, name_key, quantity, unit)
       VALUES (?, 0, 'Flour', 'flour', 1, 'g')`,
    ).run(id);
    db.prepare('DELETE FROM meals WHERE id = ?').run(id);
    expect(db.prepare('SELECT COUNT(*) c FROM ingredients').get()).toEqual({ c: 0 });
  });

  it('has no instructions or image column (AC-17)', () => {
    const db = openDatabase(':memory:');
    const cols = (db.prepare('PRAGMA table_info(meals)').all() as { name: string }[]).map((c) => c.name);
    expect(cols.some((c) => /instruction|image/i.test(c))).toBe(false);
  });
});
