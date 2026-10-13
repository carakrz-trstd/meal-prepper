import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OnlineSearchService, FAILED_MESSAGE, type OnlineSearchDeps } from '../../../src/server/constraints/search/OnlineSearchService';
import { SearchSessionStore } from '../../../src/server/constraints/search/SearchSessionStore';
import { FallbackSearch } from '../../../src/server/constraints/search/FallbackSearch';
import { SearchBlockedError, SearchFailedError, type SearchEngineAdapter } from '../../../src/server/constraints/search/SearchEngineAdapter';
import { ImportError } from '../../../src/server/import/RecipeFetcher';
import type { MealDraft } from '../../../src/shared/types';
import { participant, seededKeywords } from '../support';

const keywords = seededKeywords();

const draftOf = (name: string, over: Partial<MealDraft> = {}): MealDraft => ({
  name, baseServings: 4, baseServingsNeedsConfirmation: false,
  ingredients: [{ name: 'Carrot', quantity: 100, unit: 'g' }],
  prepMinutes: 10, cookMinutes: 20, caloriesPerServing: 400, totalCostEur: 8,
  caloriesEstimate: null, costEstimate: null, sourceUrl: `https://r.example/${name}`, missing: [], ...over,
});

interface Setup {
  urls?: string[];
  drafts?: Record<string, MealDraft | Error>;
  participants?: ReturnType<typeof participant>[];
  blacklist?: string[];
  libraryUrls?: string[];
  deadlineMs?: number;
}
function setup({ urls = [], drafts = {}, participants = [], blacklist = [], libraryUrls = [], deadlineMs = 30_000 }: Setup = {}) {
  const adapter: SearchEngineAdapter = { name: 'fake', search: vi.fn(async () => urls) };
  const parse = vi.fn(async (url: string) => {
    const d = drafts[url] ?? draftOf(url.split('/').pop()!);
    if (d instanceof Error) throw d;
    return d;
  });
  const store = new SearchSessionStore();
  const deps: OnlineSearchDeps = {
    adapter, parse, store, deadlineMs,
    context: () => ({ blacklist, keywords, participants }),
    libraryUrls: () => new Set(libraryUrls),
  };
  return { adapter, parse, store, service: new OnlineSearchService(deps) };
}

const flush = () => new Promise((r) => setTimeout(r, 10));
async function finished(store: SearchSessionStore, id: string) {
  for (let i = 0; i < 200 && store.get(id)!.status === 'running'; i++) await flush();
  return store.get(id)!;
}
const names = (s: Awaited<ReturnType<typeof finished>>) =>
  s.events.filter((e) => e.type === 'candidate').map((e) => (e.type === 'candidate' ? e.candidate.meal.name : ''));
const start = (service: OnlineSearchService, over: Record<string, unknown> = {}) =>
  service.start({ limits: {}, participantIds: [], servings: 4, ...over });

describe('OnlineSearchService (T-11, AC-16..19, AC-23, AC-27)', () => {
  it('makes no network call before start (no side effects on construction)', () => {
    const { adapter, parse } = setup({ urls: ['https://a/1'] });
    expect(adapter.search).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
  });

  it('start returns an id at once and then searches; the query is built from the restrictions (AC-16)', async () => {
    const { service, adapter, store } = setup({ urls: [], participants: [participant(1, 'Anna', ['vegetarian']), participant(2, 'Ben', ['nut-free', 'vegetarian'])] });
    const id = start(service, { participantIds: [1, 2] });
    expect(typeof id).toBe('string');
    await finished(store, id);
    expect(adapter.search).toHaveBeenCalledTimes(1);
    expect((adapter.search as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('nut-free vegetarian dinner recipe');
    const plain = setup({ urls: [] });
    await finished(plain.store, start(plain.service));
    expect((plain.adapter.search as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('dinner recipe');
  });

  it('imports at most 5 URLs, all in parallel (AC-16)', async () => {
    const urls = Array.from({ length: 8 }, (_, i) => `https://r.example/${i + 1}`);
    const { service, parse, store } = setup({ urls });
    const release: (() => void)[] = [];
    parse.mockImplementation(((url: string) => new Promise((resolve) => release.push(() => resolve(draftOf(url.split('/').pop()!))))) as never);
    const id = start(service);
    await flush();
    expect(parse).toHaveBeenCalledTimes(5); // all five started before any finished
    release.forEach((r) => r());
    const s = await finished(store, id);
    expect(names(s)).toHaveLength(5);
    expect(parse).toHaveBeenCalledTimes(5);
  });

  it('skips URLs that equal a library source URL and never fetches them (AC-23)', async () => {
    const { service, parse, store } = setup({ urls: ['https://r.example/dup', 'https://r.example/new'], libraryUrls: ['https://r.example/dup'] });
    const s = await finished(store, start(service));
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledWith('https://r.example/new', expect.anything());
    expect(names(s)).toEqual(['new']);
  });

  it('library duplicates do not use up the 5 import slots', async () => {
    const urls = ['https://r.example/dup', ...Array.from({ length: 6 }, (_, i) => `https://r.example/n${i}`)];
    const { service, parse, store } = setup({ urls, libraryUrls: ['https://r.example/dup'] });
    await finished(store, start(service));
    expect(parse).toHaveBeenCalledTimes(5);
  });

  it('emits a candidate as soon as its import finishes, with the source URL and a candidate id (AC-16)', async () => {
    const { service, parse, store } = setup({ urls: ['https://r.example/slow', 'https://r.example/fast'] });
    let finishSlow!: () => void;
    parse.mockImplementation(((url: string) =>
      url.endsWith('slow') ? new Promise((resolve) => (finishSlow = () => resolve(draftOf('slow')))) : Promise.resolve(draftOf('fast'))) as never);
    const id = start(service);
    await flush();
    expect(names(store.get(id)!)).toEqual(['fast']); // arrived before the slow one finished
    finishSlow();
    const s = await finished(store, id);
    expect(names(s)).toEqual(['fast', 'slow']);
    const first = s.events[0];
    expect(first.type === 'candidate' && first.candidate).toMatchObject({ source: 'online', sourceUrl: 'https://r.example/fast', candidateId: expect.any(String) });
    expect(s.events.at(-1)).toEqual({ type: 'done', found: 2 });
    const cid = first.type === 'candidate' ? first.candidate.candidateId! : '';
    expect(store.getCandidate(id, cid)?.draft.name).toBe('fast');
  });

  it('discards failing, unparsable, blacklisted, violating and limit-failing results (AC-17)', async () => {
    const urls = ['ok', 'boom', 'norecipe', 'nutty', 'curry', 'heavy', 'nocal'].map((n) => `https://r.example/${n}`);
    const drafts: Setup['drafts'] = {
      'https://r.example/ok': draftOf('ok'),
      'https://r.example/boom': new ImportError('UNREACHABLE', 'down'),
      'https://r.example/norecipe': new ImportError('NO_RECIPE_FOUND', 'none'),
      'https://r.example/nutty': draftOf('nutty', { ingredients: [{ name: 'Mixed nuts', quantity: 1, unit: 'g' }] }),
      'https://r.example/curry': draftOf('curry', { ingredients: [{ name: 'Chicken', quantity: 1, unit: 'g' }] }),
      'https://r.example/heavy': draftOf('heavy', { caloriesPerServing: 900 }),
      'https://r.example/nocal': draftOf('nocal', { caloriesPerServing: null }),
    };
    const { service, store } = setup({ urls, drafts, blacklist: ['nuts'], participants: [participant(1, 'Anna', ['vegetarian'])] });
    const s = await finished(store, start(service, { participantIds: [1], limits: { calorieLimit: 500 } }));
    expect(names(s)).toEqual(['ok']);
    expect(s.status).toBe('done');
  });

  it('keeps results with unknown ingredients and flags them (AC-9)', async () => {
    const drafts = { 'https://r.example/odd': draftOf('odd', { ingredients: [{ name: 'Dragon fruit', quantity: 1, unit: 'g' }] }) };
    const { service, store } = setup({ urls: ['https://r.example/odd'], drafts, participants: [participant(1, 'Anna', ['vegan'])] });
    const s = await finished(store, start(service, { participantIds: [1] }));
    const c = s.events[0];
    expect(c.type === 'candidate' && c.candidate.unknownIngredients).toEqual(['Dragon fruit']);
  });

  it('checks the limits against the values of the source page, scaled to the servings (AC-17)', async () => {
    const drafts = { 'https://r.example/a': draftOf('a', { totalCostEur: 12, baseServings: 4 }) };
    const ok = setup({ urls: ['https://r.example/a'], drafts });
    expect(names(await finished(ok.store, start(ok.service, { limits: { budgetLimit: 6 }, servings: 2 })))).toEqual(['a']);
    const no = setup({ urls: ['https://r.example/a'], drafts });
    expect(names(await finished(no.store, start(no.service, { limits: { budgetLimit: 6 }, servings: 4 })))).toEqual([]);
  });

  it('a source value of a draft with a missing cook time cannot satisfy a time limit (AC-12)', async () => {
    const drafts = { 'https://r.example/a': draftOf('a', { cookMinutes: null }) };
    const { service, store } = setup({ urls: ['https://r.example/a'], drafts });
    expect(names(await finished(store, start(service, { limits: { timeLimit: 60 } })))).toEqual([]);
  });

  describe('deadline (AC-17)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('imports unfinished at the deadline are aborted and discarded, and the search ends', async () => {
      const { service, parse, store } = setup({ urls: ['https://r.example/fast', 'https://r.example/hang'], deadlineMs: 30_000 });
      let aborted = false;
      parse.mockImplementation(((url: string, signal: AbortSignal) =>
        url.endsWith('fast')
          ? Promise.resolve(draftOf('fast'))
          : new Promise((_res, rej) => signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }))) as never);
      const id = start(service);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(store.get(id)!.status).toBe('running');
      await vi.advanceTimersByTimeAsync(2);
      const s = store.get(id)!;
      expect(s.status).toBe('done');
      expect(aborted).toBe(true);
      expect(names(s)).toEqual(['fast']);
      expect(s.events.at(-1)).toEqual({ type: 'done', found: 1 });
    });

    it('a parse that ignores the abort signal still cannot add a candidate after the deadline', async () => {
      const { service, parse, store } = setup({ urls: ['https://r.example/late'], deadlineMs: 1000 });
      parse.mockImplementation((() => new Promise((resolve) => setTimeout(() => resolve(draftOf('late')), 5000))) as never);
      const id = start(service);
      await vi.advanceTimersByTimeAsync(6000);
      expect(names(store.get(id)!)).toEqual([]);
      expect(store.get(id)!.status).toBe('done');
    });
  });

  describe('with the Google -> Allrecipes fallback (AC-19, AC-27)', () => {
    const blocked: SearchEngineAdapter = { name: 'google', search: vi.fn(async () => { throw new SearchBlockedError('captcha'); }) };

    it('blocked Google -> Allrecipes results are used within the same run', async () => {
      const allrecipes: SearchEngineAdapter = { name: 'allrecipes', search: vi.fn(async () => ['https://www.allrecipes.com/recipe/1/soup']) };
      const { service, store, parse } = setup();
      const store2 = store;
      const svc = new OnlineSearchService({
        adapter: new FallbackSearch(blocked, allrecipes), parse, store: store2, deadlineMs: 30_000,
        context: () => ({ blacklist: [], keywords, participants: [] }), libraryUrls: () => new Set(),
      });
      void service;
      const s = await finished(store2, start(svc));
      expect(names(s)).toEqual(['soup']);
      expect(allrecipes.search).toHaveBeenCalled();
    });

    it('both engines fail -> status failed with the "failed or found nothing" message (AC-19)', async () => {
      const down: SearchEngineAdapter = { name: 'allrecipes', search: vi.fn(async () => { throw new SearchFailedError('down'); }) };
      const { store, parse } = setup();
      const svc = new OnlineSearchService({
        adapter: new FallbackSearch(blocked, down), parse, store, deadlineMs: 30_000,
        context: () => ({ blacklist: [], keywords, participants: [] }), libraryUrls: () => new Set(),
      });
      const s = await finished(store, start(svc));
      expect(s.status).toBe('failed');
      expect(s.events.at(-1)).toEqual({ type: 'failed', message: FAILED_MESSAGE });
      expect(FAILED_MESSAGE).toMatch(/failed or found nothing/i);
    });
  });

  it('finding no usable result ends as done with found: 0', async () => {
    const { service, store } = setup({ urls: [] });
    const s = await finished(store, start(service));
    expect(s.status).toBe('done');
    expect(s.events).toEqual([{ type: 'done', found: 0 }]);
  });
});
