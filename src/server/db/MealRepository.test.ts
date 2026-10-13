import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from './open';
import { MealRepository } from './MealRepository';
import type { MealInput } from '../../shared/types';

const input = (over: Partial<MealInput> = {}): MealInput => ({
  name: 'Soup',
  baseServings: 4,
  ingredients: [
    { name: ' Carrot ', quantity: 200, unit: 'g' },
    { name: 'Water', quantity: 1.5, unit: 'l' },
  ],
  prepMinutes: 10,
  cookMinutes: 30,
  caloriesPerServing: 250,
  totalCostEur: 6.5,
  ...over,
});

const repo = () => new MealRepository(openDatabase(':memory:'));

describe('MealRepository (T-3)', () => {
  it('create then get returns every field incl. ingredients in order (AC-1, AC-22)', () => {
    const r = repo();
    const created = r.create(input({ sourceUrl: 'https://example.org/r' }));
    const m = r.get(created.id)!;
    expect(m.name).toBe('Soup');
    expect(m.baseServings).toBe(4);
    expect(m.prepMinutes).toBe(10);
    expect(m.cookMinutes).toBe(30);
    expect(m.totalMinutes).toBe(40);
    expect(m.caloriesPerServing).toBe(250);
    expect(m.totalCostEur).toBe(6.5);
    expect(m.sourceUrl).toBe('https://example.org/r');
    expect(m.ingredients.map((i) => [i.position, i.name, i.nameKey, i.quantity, i.unit])).toEqual([
      [0, 'Carrot', 'carrot', 200, 'g'],
      [1, 'Water', 'water', 1.5, 'l'],
    ]);
  });

  it('reads NULL calories and cost back as null, not 0 (AC-2, AC-13)', () => {
    const r = repo();
    const m = r.create(input({ caloriesPerServing: null, totalCostEur: undefined }));
    expect(r.get(m.id)!.caloriesPerServing).toBeNull();
    expect(r.get(m.id)!.totalCostEur).toBeNull();
  });

  it('stores no source URL for manual meals (AC-17)', () => {
    const r = repo();
    expect(r.get(r.create(input()).id)!.sourceUrl).toBeNull();
  });

  it('treats a missing prep time as 0 (AC-16)', () => {
    const r = repo();
    const m = r.create(input({ prepMinutes: undefined }));
    expect(m.prepMinutes).toBe(0);
    expect(m.totalMinutes).toBe(30);
  });

  it('list returns all meals; favouritesOnly returns only favourites; setFavourite on/off (AC-3)', () => {
    const r = repo();
    const a = r.create(input({ name: 'A' }));
    r.create(input({ name: 'B' }));
    expect(r.list()).toHaveLength(2);
    r.setFavourite(a.id, true);
    expect(r.list({ favouritesOnly: true }).map((m) => m.name)).toEqual(['A']);
    expect(r.get(a.id)!.isFavourite).toBe(true);
    r.setFavourite(a.id, false);
    expect(r.list({ favouritesOnly: true })).toHaveLength(0);
  });

  it('update replaces ingredients atomically (AC-15)', () => {
    const r = repo();
    const m = r.create(input());
    r.update(m.id, input({ name: 'Stew', ingredients: [{ name: 'Beef', quantity: 500, unit: 'g' }] }));
    const got = r.get(m.id)!;
    expect(got.name).toBe('Stew');
    expect(got.ingredients.map((i) => i.name)).toEqual(['Beef']);
  });

  it('delete removes the meal and its ingredients (AC-15)', () => {
    const db = openDatabase(':memory:');
    const r = new MealRepository(db);
    const m = r.create(input());
    expect(r.delete(m.id)).toBe(true);
    expect(r.get(m.id)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) c FROM ingredients').get()).toEqual({ c: 0 });
    expect(r.delete(m.id)).toBe(false);
  });

  it('existsByName is case-insensitive, trims and honours excludeId (AC-20)', () => {
    const r = repo();
    const m = r.create(input({ name: 'Pasta' }));
    expect(r.existsByName('  pasta ')).toBe(true);
    expect(r.existsByName('Pizza')).toBe(false);
    expect(r.existsByName('PASTA', m.id)).toBe(false);
  });

  describe('persistence (AC-7, NFR-1)', () => {
    const dirs: string[] = [];
    afterEach(() => {
      for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
    });

    it('data survives close and reopen of the file', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meals-'));
      dirs.push(dir);
      const file = path.join(dir, 'meals.db');
      const db1 = openDatabase(file);
      const r1 = new MealRepository(db1);
      const id = r1.create(input({ name: 'Persisted' })).id;
      r1.setFavourite(id, true);
      db1.close();

      const db2 = openDatabase(file);
      const r2 = new MealRepository(db2);
      const got = r2.get(id)!;
      db2.close(); // release the file so Windows can delete it in cleanup
      expect(got.name).toBe('Persisted');
      expect(got.isFavourite).toBe(true);
      expect(got.ingredients).toHaveLength(2);
    });
  });
});
