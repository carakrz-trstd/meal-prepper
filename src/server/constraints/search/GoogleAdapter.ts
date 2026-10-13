import * as cheerio from 'cheerio';
import { BROWSER_HEADERS, SearchBlockedError, SearchFailedError, type AdapterOptions, type SearchEngineAdapter } from './SearchEngineAdapter';
import { GOOGLE_SELECTORS } from './google.selectors';

const MAX_RESULTS = 10;
const GOOGLE_HOST = /(^|\.)(google\.[a-z.]+|googleusercontent\.com|gstatic\.com|googleapis\.com|youtube\.com)$/i;

function externalTarget(href: string): string | null {
  let target: string | null = null;
  if (href.startsWith('/url?')) target = new URL(href, 'https://google.invalid').searchParams.get('q');
  else if (/^https?:\/\//i.test(href)) target = href;
  if (!target) return null;
  try {
    const u = new URL(target);
    if (!/^https?:$/.test(u.protocol) || GOOGLE_HOST.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Scrapes the HTML results page of google.com (AD-7). A captcha, a block or a consent redirect is reported as
 * SearchBlockedError so that the fallback source can take over; the parsing is isolated in `google.selectors.ts`.
 */
export class GoogleAdapter implements SearchEngineAdapter {
  readonly name = 'google';
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AdapterOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://www.google.com').replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async search(query: string, signal: AbortSignal): Promise<string[]> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/search?q=${encodeURIComponent(query)}&num=${MAX_RESULTS}&hl=en`, {
        signal,
        headers: BROWSER_HEADERS,
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new SearchFailedError('google.com could not be reached.');
    }

    if (res.status === 429 || res.status === 403) throw new SearchBlockedError(`google.com answered with status ${res.status}.`);
    if (GOOGLE_SELECTORS.blockedUrl.test(res.url ?? '')) throw new SearchBlockedError('google.com asked for a captcha or consent.');
    if (!res.ok) throw new SearchFailedError(`google.com answered with status ${res.status}.`);

    const html = await res.text();
    if (GOOGLE_SELECTORS.blockedBody.test(html)) throw new SearchBlockedError('google.com detected unusual traffic.');

    const $ = cheerio.load(html);
    const urls: string[] = [];
    $(GOOGLE_SELECTORS.link).each((_, el) => {
      const target = externalTarget($(el).attr('href') ?? '');
      if (target && !urls.includes(target)) urls.push(target);
    });
    return urls.slice(0, MAX_RESULTS);
  }
}
