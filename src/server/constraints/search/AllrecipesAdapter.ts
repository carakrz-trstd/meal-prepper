import * as cheerio from 'cheerio';
import { BROWSER_HEADERS, SearchFailedError, type AdapterOptions, type SearchEngineAdapter } from './SearchEngineAdapter';

const MAX_RESULTS = 10;

/**
 * Fallback source (AC-27): the search results page of https://www.allrecipes.com/. Recipe pages live under
 * `/recipe/<id>/<slug>/`; category pages (`/recipes/...`) and other links are ignored.
 * NOTE: not verified against the live site.
 */
export class AllrecipesAdapter implements SearchEngineAdapter {
  readonly name = 'allrecipes';
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AdapterOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://www.allrecipes.com').replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async search(query: string, signal: AbortSignal): Promise<string[]> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/search?q=${encodeURIComponent(query)}`, { signal, headers: BROWSER_HEADERS });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new SearchFailedError('allrecipes.com could not be reached.');
    }
    if (!res.ok) throw new SearchFailedError(`allrecipes.com answered with status ${res.status}.`);

    const $ = cheerio.load(await res.text());
    const urls: string[] = [];
    $('a[href]').each((_, el) => {
      try {
        const u = new URL($(el).attr('href') ?? '', `${this.baseUrl}/`);
        if (/^https?:$/.test(u.protocol) && u.pathname.startsWith('/recipe/')) {
          const full = u.toString();
          if (!urls.includes(full)) urls.push(full);
        }
      } catch {
        /* not a URL: ignore */
      }
    });
    return urls.slice(0, MAX_RESULTS);
  }
}
