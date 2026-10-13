import type { MealDraft } from '../../shared/types';
import { parseJsonLd } from './parsers/jsonLdParser';
import { parseHtmlRecipe } from './parsers/htmlParser';

/** schema.org JSON-LD first, heuristic HTML parsing as the fallback; null when neither finds a recipe (AC-9). */
export function parseRecipe(html: string, sourceUrl: string): MealDraft | null {
  return parseJsonLd(html, sourceUrl) ?? parseHtmlRecipe(html, sourceUrl);
}
