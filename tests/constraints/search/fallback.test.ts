import { describe, it, expect, vi } from 'vitest';
import { FallbackSearch } from '../../../src/server/constraints/search/FallbackSearch';
import { SearchBlockedError, SearchFailedError, type SearchEngineAdapter } from '../../../src/server/constraints/search/SearchEngineAdapter';

const adapter = (name: string, impl: SearchEngineAdapter['search']): SearchEngineAdapter & { search: ReturnType<typeof vi.fn> } => ({
  name,
  search: vi.fn(impl),
});
const signal = () => new AbortController().signal;

describe('FallbackSearch (T-10, AC-19, AC-27)', () => {
  it('a blocked Google falls back to Allrecipes with the same signal', async () => {
    const google = adapter('google', async () => { throw new SearchBlockedError('captcha'); });
    const allrecipes = adapter('allrecipes', async () => ['https://www.allrecipes.com/recipe/1/x/']);
    const s = signal();
    const urls = await new FallbackSearch(google, allrecipes).search('q', s);
    expect(urls).toEqual(['https://www.allrecipes.com/recipe/1/x/']);
    expect(google.search).toHaveBeenCalledWith('q', s);
    expect(allrecipes.search).toHaveBeenCalledWith('q', s);
  });

  it('if Google works, Allrecipes is never called (even on an empty result)', async () => {
    const google = adapter('google', async () => ['https://a.example/1']);
    const allrecipes = adapter('allrecipes', async () => ['x']);
    expect(await new FallbackSearch(google, allrecipes).search('q', signal())).toEqual(['https://a.example/1']);
    const empty = adapter('google', async () => []);
    expect(await new FallbackSearch(empty, allrecipes).search('q', signal())).toEqual([]);
    expect(allrecipes.search).not.toHaveBeenCalled();
  });

  it('both fail -> SearchFailedError', async () => {
    const google = adapter('google', async () => { throw new SearchBlockedError('captcha'); });
    const allrecipes = adapter('allrecipes', async () => { throw new SearchFailedError('down'); });
    await expect(new FallbackSearch(google, allrecipes).search('q', signal())).rejects.toBeInstanceOf(SearchFailedError);
  });

  it('a non-blocking Google failure is a failure, without fallback (only captchas and blocking fall back)', async () => {
    const google = adapter('google', async () => { throw new SearchFailedError('500'); });
    const allrecipes = adapter('allrecipes', async () => ['x']);
    await expect(new FallbackSearch(google, allrecipes).search('q', signal())).rejects.toBeInstanceOf(SearchFailedError);
    expect(allrecipes.search).not.toHaveBeenCalled();
  });

  it('an aborted signal aborts both and is not turned into a fallback', async () => {
    const ac = new AbortController();
    const google = adapter('google', async (_q, s) => new Promise((_res, rej) => s.addEventListener('abort', () => rej(s.reason ?? new Error('aborted')))));
    const allrecipes = adapter('allrecipes', async () => ['x']);
    const p = new FallbackSearch(google, allrecipes).search('q', ac.signal);
    ac.abort();
    await expect(p).rejects.toBeDefined();
    expect(allrecipes.search).not.toHaveBeenCalled();
  });

  it('the fallback adapter also receives the abort signal', async () => {
    const ac = new AbortController();
    const google = adapter('google', async () => { throw new SearchBlockedError('captcha'); });
    const allrecipes = adapter('allrecipes', async (_q, s) => new Promise((_res, rej) => s.addEventListener('abort', () => rej(new Error('aborted')))));
    const p = new FallbackSearch(google, allrecipes).search('q', ac.signal);
    await new Promise((r) => setTimeout(r, 5));
    ac.abort();
    await expect(p).rejects.toThrow('aborted');
  });
});
