import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, openDatabase } from './open';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

describe('migration 004: unit "pinch"', () => {
  it('accepts "pinch" for ingredients and tick families, still rejects other units', () => {
    const db = openDatabase(':memory:');
    db.prepare("INSERT INTO meals (name, base_servings, cook_minutes, created_at, updated_at) VALUES ('M', 4, 10, 'n', 'n')").run();
    const insert = (unit: string) =>
      db.prepare("INSERT INTO ingredients (meal_id, position, name, name_key, quantity, unit) VALUES (1, 0, 'Salt', 'salt', 1, ?)").run(unit);
    expect(() => insert('pinch')).not.toThrow();
    expect(() => insert('cup')).toThrow();
    expect(() => db.prepare("INSERT INTO shopping_tick (week_start, ingredient_key, unit_family, ticked_qty) VALUES ('2026-10-12', 'salt', 'pinch', 1)").run()).not.toThrow();
    expect(() => db.prepare("INSERT INTO shopping_tick (week_start, ingredient_key, unit_family, ticked_qty) VALUES ('2026-10-12', 'salt', 'dash', 1)").run()).toThrow();
  });

  it('upgrading a database that already has data keeps meals, ingredients, ticks and links', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    try {
      for (const f of fs.readdirSync(MIGRATIONS).filter((n) => /^00[1-3]_/.test(n))) fs.copyFileSync(path.join(MIGRATIONS, f), path.join(dir, f));
      const db = new Database(':memory:');
      db.pragma('foreign_keys = ON');
      migrate(db, dir); // an existing installation: versions 1 to 3
      expect(db.pragma('user_version', { simple: true })).toBe(3);
      db.prepare("INSERT INTO meals (name, base_servings, cook_minutes, created_at, updated_at) VALUES ('Soup', 4, 10, 'n', 'n')").run();
      db.prepare("INSERT INTO ingredients (meal_id, position, name, name_key, quantity, unit) VALUES (1, 0, 'Carrot', 'carrot', 200, 'g'), (1, 1, 'Oil', 'oil', 2, 'tbsp')").run();
      db.prepare("INSERT INTO shopping_tick (week_start, ingredient_key, unit_family, ticked_qty) VALUES ('2026-10-12', 'carrot', 'mass', 200)").run();

      migrate(db); // the real folder: applies 004

      expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(4);
      expect(db.prepare('SELECT name, quantity, unit FROM ingredients ORDER BY position').all()).toEqual([
        { name: 'Carrot', quantity: 200, unit: 'g' },
        { name: 'Oil', quantity: 2, unit: 'tbsp' },
      ]);
      expect(db.prepare('SELECT ticked_qty FROM shopping_tick').get()).toEqual({ ticked_qty: 200 });
      // the foreign key to meals and the cascade still work after the rebuild
      db.prepare('DELETE FROM meals WHERE id = 1').run();
      expect(db.prepare('SELECT COUNT(*) c FROM ingredients').get()).toEqual({ c: 0 });
      expect(db.pragma('foreign_key_check')).toEqual([]);
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
