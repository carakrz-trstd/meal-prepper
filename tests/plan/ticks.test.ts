import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PlanService, PlanError } from '../../src/server/plan/plan.service';
import { openDatabase } from '../../src/server/db/open';
import { fixedClock, freshDb, seedMeal, THIS_WEEK, NEXT_WEEK } from '../helpers';
import type { Unit } from '../../src/shared/units';

const flourMeal = (db: ReturnType<typeof freshDb>, name: string, qty: number, unit: Unit = 'g', base = 4) =>
  seedMeal(db, { name, baseServings: base, ingredients: [{ name: 'Flour', quantity: qty, unit }] });

const entry = (view: ReturnType<PlanService['getWeek']>, id: string) => view.shopping.find((e) => e.id === id);

describe('ticks (T-6, AC-16, AC-19)', () => {
  it('tick stores the need and the entry reads as ticked; untick deletes', () => {
    const db = freshDb();
    const s = new PlanService(db, fixedClock());
    s.planDay(THIS_WEEK, 1, { mealId: flourMeal(db, 'A', 400), servings: 4 });
    let view = s.setTick(THIS_WEEK, 'mass:flour', true);
    expect(entry(view, 'mass:flour')?.ticked).toBe(true);
    expect(db.prepare('SELECT ticked_qty FROM shopping_tick').get()).toEqual({ ticked_qty: 400 });
    view = s.setTick(THIS_WEEK, 'mass:flour', false);
    expect(entry(view, 'mass:flour')?.ticked).toBe(false);
    expect(db.prepare('SELECT COUNT(*) c FROM shopping_tick').get()).toEqual({ c: 0 });
  });

  it('unknown entries -> ENTRY_NOT_FOUND', () => {
    const db = freshDb();
    const s = new PlanService(db, fixedClock());
    try {
      s.setTick(THIS_WEEK, 'mass:nothing', true);
      expect.unreachable();
    } catch (e) {
      expect((e as PlanError).code).toBe('ENTRY_NOT_FOUND');
    }
  });

  it('an unchanged need keeps the tick', () => {
    const db = freshDb();
    const s = new PlanService(db, fixedClock());
    s.planDay(THIS_WEEK, 1, { mealId: flourMeal(db, 'A', 400), servings: 4 });
    s.setTick(THIS_WEEK, 'mass:flour', true);
    expect(entry(s.getWeek(THIS_WEEK), 'mass:flour')?.ticked).toBe(true);
  });

  it('a need that drops keeps the tick and lowers the snapshot; rising again clears it (AC-19: 5 -> 3 -> 4)', () => {
    const db = freshDb();
    const s = new PlanService(db, fixedClock());
    // base 4 servings with 100 g flour: 5 servings -> 125? use 1 g units: need = servings * 100 g / 4 ... use base 1
    const m = flourMeal(db, 'A', 100, 'g', 1);
    s.planDay(THIS_WEEK, 1, { mealId: m, servings: 5 }); // need 500 g
    s.setTick(THIS_WEEK, 'mass:flour', true);
    let view = s.changeServings(THIS_WEEK, 1, 3); // need 300 g
    expect(entry(view, 'mass:flour')).toMatchObject({ ticked: true, quantity: 300 });
    expect(db.prepare('SELECT ticked_qty FROM shopping_tick').get()).toEqual({ ticked_qty: 300 });
    view = s.changeServings(THIS_WEEK, 1, 4); // need 400 g > snapshot 300
    expect(entry(view, 'mass:flour')).toMatchObject({ ticked: false, quantity: 400 });
  });

  it('a need that rises right away clears the tick and shows the new total (AC-19)', () => {
    const db = freshDb();
    const s = new PlanService(db, fixedClock());
    s.planDay(THIS_WEEK, 1, { mealId: flourMeal(db, 'A', 400), servings: 4 });
    s.setTick(THIS_WEEK, 'mass:flour', true);
    s.planDay(THIS_WEEK, 2, { mealId: flourMeal(db, 'B', 200), servings: 4 });
    expect(entry(s.getWeek(THIS_WEEK), 'mass:flour')).toMatchObject({ ticked: false, quantity: 600 });
  });

  it('a removed entry deletes its tick row; reappearing later is unticked (AC-19)', () => {
    const db = freshDb();
    const s = new PlanService(db, fixedClock());
    const m = flourMeal(db, 'A', 400);
    s.planDay(THIS_WEEK, 1, { mealId: m, servings: 4 });
    s.setTick(THIS_WEEK, 'mass:flour', true);
    s.removeDay(THIS_WEEK, 1);
    expect(entry(s.getWeek(THIS_WEEK), 'mass:flour')).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) c FROM shopping_tick').get()).toEqual({ c: 0 });
    s.planDay(THIS_WEEK, 1, { mealId: m, servings: 4 });
    expect(entry(s.getWeek(THIS_WEEK), 'mass:flour')?.ticked).toBe(false);
  });

  it('the same ingredient in different families ticks independently', () => {
    const db = freshDb();
    const s = new PlanService(db, fixedClock());
    s.planDay(THIS_WEEK, 1, {
      mealId: seedMeal(db, { name: 'A', ingredients: [{ name: 'Milk', quantity: 500, unit: 'ml' }, { name: 'Milk', quantity: 1, unit: 'piece' }] }),
      servings: 4,
    });
    const view = s.setTick(THIS_WEEK, 'volume:milk', true);
    expect(entry(view, 'volume:milk')?.ticked).toBe(true);
    expect(entry(view, 'piece:milk')?.ticked).toBe(false);
  });

  it('a pinch entry can be ticked and keeps its tick (unit "pinch")', () => {
    const db = freshDb();
    const s = new PlanService(db, fixedClock());
    s.planDay(THIS_WEEK, 1, { mealId: seedMeal(db, { name: 'A', ingredients: [{ name: 'Salt', quantity: 2, unit: 'pinch' }] }), servings: 4 });
    const view = s.setTick(THIS_WEEK, 'pinch:salt', true);
    expect(entry(view, 'pinch:salt')).toMatchObject({ ticked: true, quantity: 2, unit: 'pinch' });
    expect(entry(s.getWeek(THIS_WEEK), 'pinch:salt')?.ticked).toBe(true);
  });

  it('ticks of other weeks are untouched by reading a week', () => {
    const db = freshDb();
    const s = new PlanService(db, fixedClock());
    const m = flourMeal(db, 'A', 400);
    s.planDay(NEXT_WEEK, 1, { mealId: m, servings: 4 });
    s.setTick(NEXT_WEEK, 'mass:flour', true);
    s.getWeek(THIS_WEEK);
    expect(entry(s.getWeek(NEXT_WEEK), 'mass:flour')?.ticked).toBe(true);
  });

  describe('persistence', () => {
    const dirs: string[] = [];
    afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
    it('ticks survive reopening a file DB (AC-16)', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticks-'));
      dirs.push(dir);
      const file = path.join(dir, 't.db');
      const db1 = openDatabase(file);
      const s1 = new PlanService(db1, fixedClock());
      s1.planDay(THIS_WEEK, 1, { mealId: flourMeal(db1, 'A', 400), servings: 4 });
      s1.setTick(THIS_WEEK, 'mass:flour', true);
      db1.close();
      const db2 = openDatabase(file);
      const view = new PlanService(db2, fixedClock()).getWeek(THIS_WEEK);
      db2.close();
      expect(entry(view, 'mass:flour')?.ticked).toBe(true);
    });
  });
});
