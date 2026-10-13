import { describe, it, expect } from 'vitest';
import { freshDb } from '../../helpers';
import { ParticipantRepository } from '../../../src/server/constraints/repo/ParticipantRepository';
import { BlacklistRepository } from '../../../src/server/constraints/repo/BlacklistRepository';
import { PrefsRepository } from '../../../src/server/constraints/repo/PrefsRepository';
import { KeywordRepository } from '../../../src/server/constraints/repo/KeywordRepository';

describe('ParticipantRepository (T-1, AC-7)', () => {
  it('create/read/update/delete stores name and restrictions only', () => {
    const repo = new ParticipantRepository(freshDb());
    const anna = repo.create('  Anna ', ['vegetarian', 'nut-free']);
    expect(anna).toEqual({ id: expect.any(Number), name: 'Anna', restrictions: ['nut-free', 'vegetarian'] });
    expect(Object.keys(repo.get(anna.id)!).sort()).toEqual(['id', 'name', 'restrictions']);

    const updated = repo.update(anna.id, 'Anna B', ['vegan'])!;
    expect(updated).toEqual({ id: anna.id, name: 'Anna B', restrictions: ['vegan'] });
    expect(repo.list()).toHaveLength(1);

    expect(repo.delete(anna.id)).toBe(true);
    expect(repo.get(anna.id)).toBeNull();
    expect(repo.delete(anna.id)).toBe(false);
    expect(repo.update(anna.id, 'x', [])).toBeNull();
  });

  it('removes duplicate restrictions and lists participants in name order', () => {
    const repo = new ParticipantRepository(freshDb());
    repo.create('Ben', ['vegan', 'vegan']);
    repo.create('Anna', []);
    const list = repo.list();
    expect(list.map((p) => p.name)).toEqual(['Anna', 'Ben']);
    expect(list[1].restrictions).toEqual(['vegan']);
  });

  it('getMany returns only existing participants', () => {
    const repo = new ParticipantRepository(freshDb());
    const a = repo.create('A', ['vegan']);
    expect(repo.getMany([a.id, 999]).map((p) => p.id)).toEqual([a.id]);
    expect(repo.getMany([])).toEqual([]);
  });
});

describe('BlacklistRepository (T-1, AC-6)', () => {
  it('stores terms trimmed and lower-cased; a duplicate does not create a second row', () => {
    const repo = new BlacklistRepository(freshDb());
    const first = repo.add(' Nuts ');
    const again = repo.add('NUTS');
    expect(first.term).toBe('nuts');
    expect(again.id).toBe(first.id);
    expect(repo.list()).toHaveLength(1);
    expect(repo.terms()).toEqual(['nuts']);
    expect(repo.remove(first.id)).toBe(true);
    expect(repo.remove(first.id)).toBe(false);
  });
});

describe('PrefsRepository (T-8, AC-26)', () => {
  it('returns empty prefs initially, saves and clears them', () => {
    const repo = new PrefsRepository(freshDb());
    expect(repo.get()).toEqual({ calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [] });
    repo.save({ calorieLimit: 500, budgetLimit: 7.5, timeLimit: 45, participantIds: [3, 4] });
    expect(repo.get()).toEqual({ calorieLimit: 500, budgetLimit: 7.5, timeLimit: 45, participantIds: [3, 4] });
    repo.save({ calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [] });
    expect(repo.get()).toEqual({ calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [] });
  });
});

describe('KeywordRepository (T-1, NFR-3)', () => {
  it('lists the seeded mapping and sees rows added later', () => {
    const db = freshDb();
    const repo = new KeywordRepository(db);
    const before = repo.list().length;
    expect(before).toBeGreaterThan(50);
    db.prepare("INSERT INTO restriction_keyword (restriction, keyword, effect) VALUES ('vegan', 'dragon fruit', 'safe')").run();
    expect(repo.list()).toHaveLength(before + 1);
  });
});
