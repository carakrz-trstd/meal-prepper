import * as cheerio from 'cheerio';
import type { PriceLookup, PriceProvider } from './PriceProvider';
import { RateLimiter, USER_AGENT } from './rateLimit';
import { REWE_SELECTORS } from './rewe.selectors';
import type { ProviderOptions } from './OpenFoodFactsNutritionProvider';

/** Parses "1,09 €" -> 1.09 */
function parsePrice(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d{1,2})?)\s*€/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/** Parses "500 g", "1 kg", "1 l", "750 ml", "6 Stück" -> amount in g / ml / piece */
function parsePack(text: string): { packAmount: number; packUnit: PriceLookup['packUnit'] } | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|stück|stk)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  switch (m[2].toLowerCase()) {
    case 'kg': return { packAmount: n * 1000, packUnit: 'g' };
    case 'g': return { packAmount: n, packUnit: 'g' };
    case 'l': return { packAmount: n * 1000, packUnit: 'ml' };
    case 'ml': return { packAmount: n, packUnit: 'ml' };
    default: return { packAmount: n, packUnit: 'piece' };
  }
}

/** Pack price and size of the first matching product on the rewe.de shop search (AD-5). Failures yield null. */
export class ReweDePriceProvider implements PriceProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: RateLimiter;

  constructor(opts: ProviderOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://shop.rewe.de').replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.limiter = new RateLimiter(opts.minIntervalMs ?? 700);
  }

  async lookup(ingredientName: string, signal: AbortSignal): Promise<PriceLookup | null> {
    try {
      await this.limiter.wait(signal);
      const url = `${this.baseUrl}${REWE_SELECTORS.searchPath}${encodeURIComponent(ingredientName)}`;
      const res = await this.fetchImpl(url, { signal, headers: { 'user-agent': USER_AGENT, accept: 'text/html' } });
      if (!res.ok) return null;
      const $ = cheerio.load(await res.text());
      const tile = $(REWE_SELECTORS.tile).first();
      if (tile.length === 0) return null;
      const price = parsePrice(tile.find(REWE_SELECTORS.price).first().text());
      const pack = parsePack(tile.find(REWE_SELECTORS.pack).first().text());
      return price !== null && pack ? { priceEur: price, ...pack } : null;
    } catch {
      return null;
    }
  }
}
