import { describe, it, expect } from 'vitest';
import { freshDb, seedMeal } from '../../helpers';

const tables = (db: ReturnType<typeof freshDb>) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);

describe('constraints migration 003 (T-1, AC-7, AC-20, AC-25)', () => {
  it('creates all Epic 3 tables on top of the Epic 1 and 2 tables', () => {
    const t = tables(freshDb());
    expect(t).toEqual(
      expect.arrayContaining(['participant', 'participant_restriction', 'blacklist_item', 'restriction_keyword', 'suggestion_prefs', 'planned_meal_participant', 'meals', 'planned_meal']),
    );
  });

  it('rejects an unknown restriction (CHECK)', () => {
    const db = freshDb();
    const id = db.prepare("INSERT INTO participant (name) VALUES ('Anna')").run().lastInsertRowid;
    expect(() => db.prepare("INSERT INTO participant_restriction (participant_id, restriction) VALUES (?, 'keto')").run(id)).toThrow();
    expect(() => db.prepare("INSERT INTO participant_restriction (participant_id, restriction) VALUES (?, 'vegan')").run(id)).not.toThrow();
  });

  it('rejects an empty or whitespace participant name', () => {
    const db = freshDb();
    expect(() => db.prepare("INSERT INTO participant (name) VALUES ('')").run()).toThrow();
    expect(() => db.prepare("INSERT INTO participant (name) VALUES ('   ')").run()).toThrow();
  });

  it('a unique blacklist term', () => {
    const db = freshDb();
    db.prepare("INSERT INTO blacklist_item (term) VALUES ('nuts')").run();
    expect(() => db.prepare("INSERT INTO blacklist_item (term) VALUES ('nuts')").run()).toThrow();
  });

  it('deleting a participant cascades restrictions and planned_meal_participant rows; the planned meal stays', () => {
    const db = freshDb();
    const pid = Number(db.prepare("INSERT INTO participant (name) VALUES ('Anna')").run().lastInsertRowid);
    db.prepare("INSERT INTO participant_restriction (participant_id, restriction) VALUES (?, 'vegan')").run(pid);
    const mealId = seedMeal(db);
    const planned = Number(db.prepare("INSERT INTO planned_meal (week_start, day_of_week, meal_id, servings) VALUES ('2026-10-12', 1, ?, 2)").run(mealId).lastInsertRowid);
    db.prepare('INSERT INTO planned_meal_participant (planned_meal_id, participant_id) VALUES (?, ?)').run(planned, pid);
    db.prepare('DELETE FROM participant WHERE id = ?').run(pid);
    expect(db.prepare('SELECT COUNT(*) c FROM participant_restriction').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) c FROM planned_meal_participant').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) c FROM planned_meal').get()).toEqual({ c: 1 });
  });

  it('deleting a planned meal (or its meal) cascades its participant links (AC-25)', () => {
    const db = freshDb();
    const pid = Number(db.prepare("INSERT INTO participant (name) VALUES ('Anna')").run().lastInsertRowid);
    const mealId = seedMeal(db);
    const planned = Number(db.prepare("INSERT INTO planned_meal (week_start, day_of_week, meal_id, servings) VALUES ('2026-10-12', 1, ?, 2)").run(mealId).lastInsertRowid);
    db.prepare('INSERT INTO planned_meal_participant (planned_meal_id, participant_id) VALUES (?, ?)').run(planned, pid);
    db.prepare('DELETE FROM meals WHERE id = ?').run(mealId);
    expect(db.prepare('SELECT COUNT(*) c FROM planned_meal_participant').get()).toEqual({ c: 0 });
  });

  it('suggestion_prefs accepts only id 1', () => {
    const db = freshDb();
    expect(() => db.prepare('INSERT INTO suggestion_prefs (id) VALUES (2)').run()).toThrow();
    expect(() => db.prepare('INSERT INTO suggestion_prefs (id) VALUES (1)').run()).not.toThrow();
  });

  it('restriction_keyword rejects unknown restrictions and effects and duplicates', () => {
    const db = freshDb();
    expect(() => db.prepare("INSERT INTO restriction_keyword (restriction, keyword, effect) VALUES ('keto', 'x', 'safe')").run()).toThrow();
    expect(() => db.prepare("INSERT INTO restriction_keyword (restriction, keyword, effect) VALUES ('vegan', 'x', 'maybe')").run()).toThrow();
    db.prepare("INSERT INTO restriction_keyword (restriction, keyword, effect) VALUES ('vegan', 'zzz', 'safe')").run();
    expect(() => db.prepare("INSERT INTO restriction_keyword (restriction, keyword, effect) VALUES ('vegan', 'zzz', 'safe')").run()).toThrow();
  });
});
