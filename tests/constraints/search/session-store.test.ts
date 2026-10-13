import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchSessionStore, type OnlineEvent } from '../../../src/server/constraints/search/SearchSessionStore';
import type { MealDraft } from '../../../src/shared/types';
import type { SuggestionMatch } from '../../../src/shared/constraints/types';

const match = (id: string): SuggestionMatch => ({
  source: 'online', candidateId: id, sourceUrl: `https://x.example/${id}`, favourite: false, unknownIngredients: [],
  usedEstimate: { calories: false, cost: false },
  meal: { id: 0, name: id, baseServings: 4, caloriesPerServing: null, totalCostEur: null, prepMinutes: null, cookMinutes: null, totalMinutes: null, caloriesEstimated: false, costEstimated: false, ingredients: [] },
});
const draft = {} as MealDraft;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SearchSessionStore (T-11)', () => {
  it('creates running sessions with unique ids; unknown ids are undefined', () => {
    const store = new SearchSessionStore();
    const a = store.create();
    const b = store.create();
    expect(a.id).not.toBe(b.id);
    expect(a.status).toBe('running');
    expect(store.get(a.id)).toBe(a);
    expect(store.get('nope')).toBeUndefined();
  });

  it('candidates are retrievable by id and announced as events', () => {
    const store = new SearchSessionStore();
    const s = store.create();
    store.addCandidate(s.id, { match: match('c1'), draft });
    expect(store.getCandidate(s.id, 'c1')?.match.candidateId).toBe('c1');
    expect(store.getCandidate(s.id, 'zzz')).toBeUndefined();
    expect(s.events).toEqual([{ type: 'candidate', candidate: expect.objectContaining({ candidateId: 'c1' }) }]);
  });

  it('done and failed end the session', () => {
    const store = new SearchSessionStore();
    const d = store.create();
    store.emit(d.id, { type: 'done', found: 0 });
    expect(d.status).toBe('done');
    const f = store.create();
    store.emit(f.id, { type: 'failed', message: 'nope' });
    expect(f.status).toBe('failed');
  });

  it('subscribers get the events so far, then new ones, and can unsubscribe', () => {
    const store = new SearchSessionStore();
    const s = store.create();
    store.addCandidate(s.id, { match: match('c1'), draft });
    const seen: OnlineEvent[] = [];
    const off = store.subscribe(s.id, (e) => seen.push(e))!;
    store.addCandidate(s.id, { match: match('c2'), draft });
    off();
    store.emit(s.id, { type: 'done', found: 2 });
    expect(seen.map((e) => e.type)).toEqual(['candidate', 'candidate']);
    expect(store.subscribe('missing', () => {})).toBeUndefined();
  });

  it('expired sessions are removed (TTL 30 minutes by default)', () => {
    const store = new SearchSessionStore();
    const s = store.create();
    vi.advanceTimersByTime(29 * 60_000);
    expect(store.get(s.id)).toBeDefined();
    vi.advanceTimersByTime(2 * 60_000);
    expect(store.get(s.id)).toBeUndefined();
    expect(store.getCandidate(s.id, 'c1')).toBeUndefined();
  });

  it('honours a custom TTL', () => {
    const store = new SearchSessionStore({ ttlMs: 1000 });
    const s = store.create();
    vi.advanceTimersByTime(1500);
    expect(store.get(s.id)).toBeUndefined();
  });
});
