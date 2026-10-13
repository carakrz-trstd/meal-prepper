import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ImportService } from './ImportService';
import { ImportError, type PageFetcher } from './RecipeFetcher';
import type { NutritionProvider } from './estimators/NutritionProvider';
import type { PriceProvider } from './estimators/PriceProvider';
import type { ImportJobStatus } from '../../shared/types';

const fixture = (name: string) => fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
const URL = 'https://example.org/r';

const pageFetcher = (html: string | Error): PageFetcher => ({
  fetch: async () => {
    if (html instanceof Error) throw html;
    return html;
  },
});

const okNutrition = (calls: string[] = []): NutritionProvider => ({
  async lookup(name) {
    calls.push(name);
    return { kcalPer100g: 100 };
  },
});
const okPrices = (calls: string[] = []): PriceProvider => ({
  async lookup(name) {
    calls.push(name);
    return { priceEur: 2, packAmount: 1000, packUnit: 'g' };
  },
});
const nullNutrition: NutritionProvider = { lookup: async () => null };
const nullPrices: PriceProvider = { lookup: async () => null };

/** Runs a job to completion (real timers) and returns the final status. */
async function finish(svc: ImportService, url = URL): Promise<ImportJobStatus> {
  const id = svc.start(url);
  for (let i = 0; i < 200; i++) {
    const s = svc.get(id)!;
    if (s.status !== 'running') return s;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('job did not finish');
}

const make = (html: string | Error, nutrition: NutritionProvider, prices: PriceProvider, deadlineMs = 30000) =>
  new ImportService({ fetcher: pageFetcher(html), nutrition, prices, deadlineMs });

describe('ImportService (T-11)', () => {
  it('uses source calories and cost without requesting estimates (AC-4)', async () => {
    const n: string[] = [];
    const p: string[] = [];
    const s = await finish(make(fixture('recipe-jsonld-full.html'), okNutrition(n), okPrices(p)));
    expect(s.status).toBe('done');
    if (s.status !== 'done') return;
    expect(s.draft.caloriesPerServing).toBe(520);
    expect(s.draft.totalCostEur).toBe(12.5);
    expect(s.draft.caloriesEstimate).toBeNull();
    expect(s.draft.costEstimate).toBeNull();
    expect(n).toHaveLength(0);
    expect(p).toHaveLength(0);
  });

  it('pieces without a weight keep calories and cost missing, never guessed (AC-24, AC-25)', async () => {
    // recipe-jsonld.html has "2 Tomatoes" (piece): the fake providers give no piece weight / no piece pack
    const s = await finish(make(fixture('recipe-jsonld.html'), okNutrition(), okPrices()));
    if (s.status !== 'done') throw new Error('expected done');
    expect(s.draft.caloriesEstimate).toBeNull();
    expect(s.draft.costEstimate).toBeNull();
    expect(s.draft.totalCostEur).toBeNull();
    expect(s.draft.caloriesPerServing).toBeNull();
  });

  it('estimates calories per serving and cost when all ingredients convert (AC-24, AC-25)', async () => {
    const html = `<script type="application/ld+json">{"@type":"Recipe","name":"X","recipeIngredient":["200 g Flour","300 g Rice"],"cookTime":"PT10M","recipeYield":"2"}</script>`;
    const s = await finish(make(html, okNutrition(), okPrices()));
    if (s.status !== 'done') throw new Error('expected done');
    expect(s.draft.caloriesEstimate).toEqual({ value: 250, isEstimate: true }); // (200+300) kcal / 2
    expect(s.draft.costEstimate).toEqual({ value: 1, isEstimate: true }); // 0.5 kg * 2 EUR/kg
    expect(s.draft.caloriesPerServing).toBeNull();
    expect(s.draft.totalCostEur).toBeNull();
  });

  it('no match from the providers keeps the values missing and the import done (AC-18)', async () => {
    const s = await finish(make(fixture('recipe-jsonld.html'), nullNutrition, nullPrices));
    expect(s.status).toBe('done');
    if (s.status === 'done') {
      expect(s.draft.caloriesEstimate).toBeNull();
      expect(s.draft.costEstimate).toBeNull();
    }
  });

  it('a provider that throws leaves the values missing, import still done (AC-18)', async () => {
    const boom: NutritionProvider = { lookup: async () => { throw new Error('network'); } };
    const boomP: PriceProvider = { lookup: async () => { throw new Error('network'); } };
    const html = `<script type="application/ld+json">{"@type":"Recipe","name":"X","recipeIngredient":["200 g Flour"],"cookTime":"PT10M","recipeYield":"2"}</script>`;
    const s = await finish(make(html, boom, boomP));
    expect(s.status).toBe('done');
    if (s.status === 'done') expect(s.draft.caloriesEstimate).toBeNull();
  });

  it('skips estimates when an ingredient has a null quantity (AC-18)', async () => {
    const n: string[] = [];
    const s = await finish(make(fixture('recipe-unparsed-line.html'), okNutrition(n), okPrices()));
    expect(s.status).toBe('done');
    expect(n).toHaveLength(0);
  });

  it('page without yield flags base servings for confirmation (AC-23)', async () => {
    const s = await finish(make(fixture('recipe-noyield.html'), nullNutrition, nullPrices));
    if (s.status !== 'done') throw new Error('expected done');
    expect(s.draft.baseServings).toBe(4);
    expect(s.draft.baseServingsNeedsConfirmation).toBe(true);
  });

  it('an unparseable page -> failed NO_RECIPE_FOUND (AC-6)', async () => {
    const s = await finish(make(fixture('not-a-recipe.html'), okNutrition(), okPrices()));
    expect(s).toMatchObject({ status: 'failed', error: { code: 'NO_RECIPE_FOUND' } });
  });

  it('a fetch error -> failed UNREACHABLE (AC-6)', async () => {
    const s = await finish(make(new ImportError('UNREACHABLE', 'down'), okNutrition(), okPrices()));
    expect(s).toMatchObject({ status: 'failed', error: { code: 'UNREACHABLE' } });
  });

  it('an invalid URL -> failed INVALID_URL', async () => {
    const s = await finish(make(new ImportError('INVALID_URL', 'bad'), okNutrition(), okPrices()), 'nope');
    expect(s).toMatchObject({ status: 'failed', error: { code: 'INVALID_URL' } });
  });

  it('an unknown job id -> null', () => {
    expect(make('', okNutrition(), okPrices()).get('missing')).toBeNull();
  });
});

describe('ImportService timing (AC-21, T-11)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const html = `<script type="application/ld+json">{"@type":"Recipe","name":"X","recipeIngredient":["200 g Flour"],"cookTime":"PT10M","recipeYield":"2"}</script>`;

  it('a slow provider past the deadline -> done with skippedEstimates, within the deadline (AC-21)', async () => {
    const slow: NutritionProvider = {
      lookup: (_n, signal) =>
        new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve({ kcalPer100g: 100 }), 40_000);
          signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
        }),
    };
    const slowP: PriceProvider = {
      lookup: (_n, signal) =>
        new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve({ priceEur: 1, packAmount: 1, packUnit: 'g' }), 40_000);
          signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
        }),
    };
    const svc = make(html, slow, slowP, 30_000);
    const id = svc.start(URL);
    await vi.advanceTimersByTimeAsync(30_001);
    const s = svc.get(id)!;
    expect(s.status).toBe('done');
    if (s.status === 'done') {
      expect(s.skippedEstimates).toEqual(['calories', 'cost']);
      expect(s.draft.caloriesEstimate).toBeNull();
      expect(s.draft.costEstimate).toBeNull();
    }
  });

  it('stage transitions are observable while running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const gated: PageFetcher = { fetch: async () => { await gate; return html; } };
    const svc = new ImportService({ fetcher: gated, nutrition: nullNutrition, prices: nullPrices, deadlineMs: 30_000 });
    const id = svc.start(URL);
    expect(svc.get(id)).toEqual({ status: 'running', stage: 'fetching' });
    release();
    await vi.advanceTimersByTimeAsync(0);
    const s = svc.get(id)!;
    expect(s.status).toBe('done');
  });

  it('expired jobs are removed after the TTL', async () => {
    const svc = new ImportService({ fetcher: pageFetcher(html), nutrition: nullNutrition, prices: nullPrices, deadlineMs: 30_000, jobTtlMs: 1000 });
    const id = svc.start(URL);
    await vi.advanceTimersByTimeAsync(10);
    expect(svc.get(id)).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(svc.get(id)).toBeNull();
  });
});
