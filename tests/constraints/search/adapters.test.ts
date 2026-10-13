import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleAdapter } from '../../../src/server/constraints/search/GoogleAdapter';
import { AllrecipesAdapter } from '../../../src/server/constraints/search/AllrecipesAdapter';
import { SearchBlockedError, SearchFailedError } from '../../../src/server/constraints/search/SearchEngineAdapter';

const fixture = (name: string) => fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'search', name), 'utf8');

interface Call { url: string; init?: RequestInit }
/** A fake fetch; `finalUrl` simulates a redirect target (Response.url is read-only). */
function fakeFetch(body: string, status = 200, calls: Call[] = [], finalUrl?: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const res = new Response(body, { status, headers: { 'content-type': 'text/html' } });
    if (finalUrl) Object.defineProperty(res, 'url', { value: finalUrl });
    return res;
  }) as typeof fetch;
}
const signal = () => new AbortController().signal;

describe('GoogleAdapter (T-10, AC-16, AC-27)', () => {
  it('extracts the recipe-site URLs from the results page, not google internal links', async () => {
    const calls: Call[] = [];
    const g = new GoogleAdapter({ baseUrl: 'https://www.google.com', fetchImpl: fakeFetch(fixture('google-results.html'), 200, calls) });
    const ac = new AbortController();
    const urls = await g.search('vegetarian dinner recipe', ac.signal);
    expect(urls).toEqual([
      'https://www.example-recipes.com/lentil-soup',
      'https://cooking.example.org/pasta-bake',
      'https://cooking.example.org/veggie-curry',
    ]);
    expect(calls[0].url).toBe('https://www.google.com/search?q=vegetarian%20dinner%20recipe&num=10&hl=en');
    expect(calls[0].init?.signal).toBe(ac.signal);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['user-agent']).toMatch(/Mozilla/);
    expect(headers['accept-language']).toMatch(/en/);
  });

  it('a captcha page (unusual traffic), HTTP 429 and HTTP 403 throw SearchBlockedError', async () => {
    const captcha = new GoogleAdapter({ baseUrl: 'http://stub', fetchImpl: fakeFetch(fixture('google-captcha.html')) });
    await expect(captcha.search('x', signal())).rejects.toBeInstanceOf(SearchBlockedError);
    for (const status of [429, 403]) {
      const g = new GoogleAdapter({ baseUrl: 'http://stub', fetchImpl: fakeFetch('', status) });
      await expect(g.search('x', signal())).rejects.toBeInstanceOf(SearchBlockedError);
    }
  });

  it('a redirect to /sorry/ or to a consent page throws SearchBlockedError', async () => {
    const sorry = new GoogleAdapter({ baseUrl: 'http://stub', fetchImpl: fakeFetch('<html></html>', 200, [], 'https://www.google.com/sorry/index?continue=x') });
    await expect(sorry.search('x', signal())).rejects.toBeInstanceOf(SearchBlockedError);
    const consent = new GoogleAdapter({ baseUrl: 'http://stub', fetchImpl: fakeFetch('<html></html>', 200, [], 'https://consent.google.com/m?continue=x') });
    await expect(consent.search('x', signal())).rejects.toBeInstanceOf(SearchBlockedError);
  });

  it('a page without results returns an empty list', async () => {
    const g = new GoogleAdapter({ baseUrl: 'http://stub', fetchImpl: fakeFetch(fixture('google-empty.html')) });
    expect(await g.search('x', signal())).toEqual([]);
  });

  it('other server errors and network failures throw SearchFailedError, not "blocked"', async () => {
    const g500 = new GoogleAdapter({ baseUrl: 'http://stub', fetchImpl: fakeFetch('', 500) });
    await expect(g500.search('x', signal())).rejects.toBeInstanceOf(SearchFailedError);
    const down = new GoogleAdapter({ baseUrl: 'http://stub', fetchImpl: (async () => { throw new TypeError('connect ECONNREFUSED'); }) as typeof fetch });
    await expect(down.search('x', signal())).rejects.toBeInstanceOf(SearchFailedError);
  });

  it('an aborted signal rejects with the abort error', async () => {
    const ac = new AbortController();
    ac.abort();
    const g = new GoogleAdapter({
      baseUrl: 'http://stub',
      fetchImpl: (async (_u: unknown, init?: RequestInit) => { init?.signal?.throwIfAborted(); return new Response(''); }) as typeof fetch,
    });
    const err = await g.search('x', ac.signal).catch((e) => e);
    expect(err).not.toBeInstanceOf(SearchFailedError);
    expect(err).not.toBeInstanceOf(SearchBlockedError);
  });
});

describe('AllrecipesAdapter (T-10, AC-27)', () => {
  it('extracts absolute recipe URLs from the results page, once each', async () => {
    const calls: Call[] = [];
    const a = new AllrecipesAdapter({ baseUrl: 'https://www.allrecipes.com', fetchImpl: fakeFetch(fixture('allrecipes-results.html'), 200, calls) });
    const urls = await a.search('vegan dinner recipe', signal());
    expect(urls).toEqual([
      'https://www.allrecipes.com/recipe/12345/classic-lasagna/',
      'https://www.allrecipes.com/recipe/222/vegan-curry/',
      'https://www.allrecipes.com/recipe/333/tomato-soup/?printview',
    ]);
    expect(calls[0].url).toBe('https://www.allrecipes.com/search?q=vegan%20dinner%20recipe');
  });

  it('a failing or blocking response throws SearchFailedError', async () => {
    const a = new AllrecipesAdapter({ baseUrl: 'http://stub', fetchImpl: fakeFetch('', 503) });
    await expect(a.search('x', signal())).rejects.toBeInstanceOf(SearchFailedError);
    const b = new AllrecipesAdapter({ baseUrl: 'http://stub', fetchImpl: fakeFetch('', 403) });
    await expect(b.search('x', signal())).rejects.toBeInstanceOf(SearchFailedError);
  });
});
