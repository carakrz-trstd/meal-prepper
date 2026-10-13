import type { NutritionLookup, NutritionProvider } from './NutritionProvider';
import { RateLimiter, USER_AGENT } from './rateLimit';

export interface ProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
}

interface OffProduct {
  product_name?: string;
  nutriments?: Record<string, unknown>;
}

/** kcal per 100 g from the public Open Food Facts database (AD-16). Any failure or non-match yields null. */
export class OpenFoodFactsNutritionProvider implements NutritionProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: RateLimiter;

  constructor(opts: ProviderOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://world.openfoodfacts.org').replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.limiter = new RateLimiter(opts.minIntervalMs ?? 700);
  }

  async lookup(ingredientName: string, signal: AbortSignal): Promise<NutritionLookup | null> {
    try {
      await this.limiter.wait(signal);
      const url =
        `${this.baseUrl}/cgi/search.pl?search_terms=${encodeURIComponent(ingredientName)}` +
        '&search_simple=1&action=process&json=1&page_size=5&fields=product_name,nutriments';
      const res = await this.fetchImpl(url, { signal, headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
      if (!res.ok) return null;
      const data = (await res.json()) as { products?: OffProduct[] };
      for (const p of data.products ?? []) {
        const kcal = Number(p.nutriments?.['energy-kcal_100g']);
        if (Number.isFinite(kcal) && kcal >= 0 && p.nutriments?.['energy-kcal_100g'] !== undefined) {
          return { kcalPer100g: kcal };
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}
