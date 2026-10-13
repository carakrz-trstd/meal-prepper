import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OpenFoodFactsNutritionProvider } from './OpenFoodFactsNutritionProvider';
import { ReweDePriceProvider } from './ReweDePriceProvider';

const fixture = (name: string) => fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');

interface Call { url: string; init?: RequestInit }
function fakeFetch(body: string, status = 200, calls: Call[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(body, { status });
  }) as typeof fetch;
}

describe('OpenFoodFactsNutritionProvider (T-10)', () => {
  it('returns kcal per 100 g from the first product that has it', async () => {
    const calls: Call[] = [];
    const p = new OpenFoodFactsNutritionProvider({ baseUrl: 'http://stub', fetchImpl: fakeFetch(fixture('off-search-flour.json'), 200, calls), minIntervalMs: 0 });
    const ac = new AbortController();
    expect(await p.lookup('Mehl', ac.signal)).toEqual({ kcalPer100g: 348 });
    expect(calls[0].url).toContain('http://stub');
    expect(calls[0].url).toContain('Mehl');
    expect(calls[0].init?.signal).toBe(ac.signal);
    expect(String((calls[0].init?.headers as Record<string, string>)['user-agent'])).toMatch(/MealPlanner/);
  });
  it('an empty result -> null', async () => {
    const p = new OpenFoodFactsNutritionProvider({ baseUrl: 'http://stub', fetchImpl: fakeFetch(fixture('off-search-empty.json')), minIntervalMs: 0 });
    expect(await p.lookup('Unobtanium', new AbortController().signal)).toBeNull();
  });
  it('a malformed or error response -> null, not an exception', async () => {
    const bad = new OpenFoodFactsNutritionProvider({ baseUrl: 'http://stub', fetchImpl: fakeFetch('<html>oops</html>'), minIntervalMs: 0 });
    expect(await bad.lookup('x', new AbortController().signal)).toBeNull();
    const err = new OpenFoodFactsNutritionProvider({ baseUrl: 'http://stub', fetchImpl: fakeFetch('{}', 503), minIntervalMs: 0 });
    expect(await err.lookup('x', new AbortController().signal)).toBeNull();
  });
  it('applies a delay between consecutive requests (rate limit)', async () => {
    const p = new OpenFoodFactsNutritionProvider({ baseUrl: 'http://stub', fetchImpl: fakeFetch(fixture('off-search-flour.json')), minIntervalMs: 60 });
    const t0 = Date.now();
    await p.lookup('a', new AbortController().signal);
    await p.lookup('b', new AbortController().signal);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(55);
  });
});

describe('ReweDePriceProvider (T-10)', () => {
  it('returns the price and pack size of the first product tile', async () => {
    const calls: Call[] = [];
    const p = new ReweDePriceProvider({ baseUrl: 'http://stub', fetchImpl: fakeFetch(fixture('rewe-search-flour.html'), 200, calls), minIntervalMs: 0 });
    const ac = new AbortController();
    expect(await p.lookup('Weizenmehl', ac.signal)).toEqual({ priceEur: 1.09, packAmount: 1000, packUnit: 'g' });
    expect(calls[0].url).toContain('Weizenmehl');
    expect(calls[0].init?.signal).toBe(ac.signal);
    expect(String((calls[0].init?.headers as Record<string, string>)['user-agent'])).toMatch(/MealPlanner/);
  });
  it('an empty result -> null', async () => {
    const p = new ReweDePriceProvider({ baseUrl: 'http://stub', fetchImpl: fakeFetch(fixture('rewe-search-empty.html')), minIntervalMs: 0 });
    expect(await p.lookup('Unobtanium', new AbortController().signal)).toBeNull();
  });
  it('a changed page layout or an error response -> null, not an exception', async () => {
    const changed = new ReweDePriceProvider({ baseUrl: 'http://stub', fetchImpl: fakeFetch(fixture('rewe-search-changed.html')), minIntervalMs: 0 });
    expect(await changed.lookup('x', new AbortController().signal)).toBeNull();
    const err = new ReweDePriceProvider({ baseUrl: 'http://stub', fetchImpl: fakeFetch('', 429), minIntervalMs: 0 });
    expect(await err.lookup('x', new AbortController().signal)).toBeNull();
  });
});
