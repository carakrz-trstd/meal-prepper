import { describe, it, expect, vi, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/server/http/app';
import { SearchFailedError, type SearchEngineAdapter } from '../../../src/server/constraints/search/SearchEngineAdapter';
import { FAILED_MESSAGE } from '../../../src/server/constraints/search/OnlineSearchService';
import type { MealDraft } from '../../../src/shared/types';
import { fixedClock, freshDb } from '../../helpers';
import { THIS_WEEK } from './support';

const draftOf = (name: string, over: Partial<MealDraft> = {}): MealDraft => ({
  name, baseServings: 4, baseServingsNeedsConfirmation: false,
  ingredients: [{ name: 'Carrot', quantity: 100, unit: 'g' }],
  prepMinutes: 10, cookMinutes: 20, caloriesPerServing: 400, totalCostEur: 8,
  caloriesEstimate: null, costEstimate: null, sourceUrl: '', missing: [], ...over,
});

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

async function make(opts: { urls?: string[]; failWith?: Error; parse?: (url: string, signal: AbortSignal) => Promise<MealDraft>; deadlineMs?: number } = {}) {
  const adapter: SearchEngineAdapter = {
    name: 'fake',
    search: vi.fn(async () => { if (opts.failWith) throw opts.failWith; return opts.urls ?? []; }),
  };
  const parse = vi.fn(opts.parse ?? (async (url: string) => draftOf(url.split('/').pop()!)));
  app = await buildApp({ db: freshDb(), clock: fixedClock(), search: { adapter, parse, deadlineMs: opts.deadlineMs ?? 30_000 } });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address() as { port: number };
  const base = `http://127.0.0.1:${addr.port}`;
  const post = async (body: Record<string, unknown> = {}) =>
    fetch(`${base}/api/suggestions/online`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weekStart: THIS_WEEK, participantIds: [], servings: 4, ...body }),
    });
  return { base, adapter, parse, post };
}

/** Parses the text/event-stream body into [{event, data}] */
const parseSse = (text: string) =>
  text.split('\n\n').filter(Boolean).map((block) => {
    const event = /^event: (.*)$/m.exec(block)?.[1] ?? '';
    const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null');
    return { event, data };
  });

describe('online search API (T-12, AC-16, AC-19)', () => {
  it('POST returns a search id without calling the engine before it is requested (AC-16)', async () => {
    const { adapter, post } = await make({ urls: [] });
    expect(adapter.search).not.toHaveBeenCalled(); // nothing happens without the click
    const res = await post();
    expect(res.status).toBe(202);
    expect(typeof (await res.json()).searchId).toBe('string');
    expect(adapter.search).toHaveBeenCalledTimes(1);
  });

  it('the event stream emits candidate events one by one, then done, and closes', async () => {
    const { base, post } = await make({ urls: ['https://r.example/soup', 'https://r.example/stew'] });
    const { searchId } = await (await post()).json();
    const res = await fetch(`${base}/api/suggestions/online/${searchId}/events`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = parseSse(await res.text());
    expect(events.map((e) => e.event)).toEqual(['candidate', 'candidate', 'done']);
    expect(events[0].data.candidate).toMatchObject({ source: 'online', candidateId: expect.any(String), sourceUrl: expect.stringContaining('https://r.example/') });
    expect(events[2].data).toEqual({ type: 'done', found: 2 });
  });

  it('a stream opened late replays the events and ends', async () => {
    const { base, post } = await make({ urls: ['https://r.example/soup'] });
    const { searchId } = await (await post()).json();
    await new Promise((r) => setTimeout(r, 100)); // search is done by now
    const events = parseSse(await (await fetch(`${base}/api/suggestions/online/${searchId}/events`)).text());
    expect(events.map((e) => e.event)).toEqual(['candidate', 'done']);
  });

  it('a failing search emits "failed" with the message (AC-19)', async () => {
    const { base, post } = await make({ failWith: new SearchFailedError('down') });
    const { searchId } = await (await post()).json();
    const events = parseSse(await (await fetch(`${base}/api/suggestions/online/${searchId}/events`)).text());
    expect(events).toEqual([{ event: 'failed', data: { type: 'failed', message: FAILED_MESSAGE } }]);
  });

  it('the stream closes at the cap with the finished results only (AC-17)', async () => {
    const { base, post } = await make({
      urls: ['https://r.example/fast', 'https://r.example/hang'],
      deadlineMs: 150,
      parse: (url, signal) =>
        url.endsWith('fast')
          ? Promise.resolve(draftOf('fast'))
          : new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))),
    });
    const { searchId } = await (await post()).json();
    const t0 = Date.now();
    const events = parseSse(await (await fetch(`${base}/api/suggestions/online/${searchId}/events`)).text());
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(events.map((e) => e.event)).toEqual(['candidate', 'done']);
  });

  it('applies the limits and the checks to online results (AC-17)', async () => {
    const { base, post } = await make({ urls: ['https://r.example/light', 'https://r.example/heavy'], parse: async (url) => draftOf(url.split('/').pop()!, { caloriesPerServing: url.endsWith('heavy') ? 900 : 300 }) });
    const { searchId } = await (await post({ calorieLimit: 500 })).json();
    const events = parseSse(await (await fetch(`${base}/api/suggestions/online/${searchId}/events`)).text());
    expect(events.filter((e) => e.event === 'candidate').map((e) => e.data.candidate.meal.name)).toEqual(['light']);
  });

  it('an unknown search id -> 404', async () => {
    const { base } = await make();
    expect((await fetch(`${base}/api/suggestions/online/nope/events`)).status).toBe(404);
    expect((await fetch(`${base}/api/suggestions/online/nope/candidates/c1`)).status).toBe(404);
  });

  it('an invalid request body -> 400 and no search is started', async () => {
    const { adapter, post } = await make();
    expect((await post({ servings: 0 })).status).toBe(400);
    expect((await post({ budgetLimit: -3 })).status).toBe(400);
    expect(adapter.search).not.toHaveBeenCalled();
  });
});

describe('online candidates API (T-13)', () => {
  it('GET .../candidates/:id returns the stored draft with the source URL', async () => {
    const { base, post } = await make({ urls: ['https://r.example/soup'] });
    const { searchId } = await (await post()).json();
    const events = parseSse(await (await fetch(`${base}/api/suggestions/online/${searchId}/events`)).text());
    const cid = events[0].data.candidate.candidateId as string;
    const res = await fetch(`${base}/api/suggestions/online/${searchId}/candidates/${cid}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft).toMatchObject({ name: 'soup', sourceUrl: 'https://r.example/soup' });
    expect(body.match.candidateId).toBe(cid);
    expect((await fetch(`${base}/api/suggestions/online/${searchId}/candidates/zzz`)).status).toBe(404);
  });
});
