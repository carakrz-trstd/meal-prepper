import type { MealDraft } from '../../shared/types';
import { ImportError, type PageFetcher } from '../import/RecipeFetcher';
import { parseRecipe } from '../import/parseRecipe';

export type ParseRecipeFromUrl = (url: string, signal: AbortSignal) => Promise<MealDraft>;

/**
 * Parse-only importer entry point (AD-9): Epic 1's fetcher and parser (schema.org first, HTML fallback), with the
 * source URL set and no calorie/cost lookups. Estimates run later, in the Epic 1 review step, for the picked recipe.
 */
export function makeParseRecipeFromUrl(fetcher: PageFetcher): ParseRecipeFromUrl {
  return async (url, signal) => {
    const html = await fetcher.fetch(url, signal);
    const draft = parseRecipe(html, url);
    if (!draft) throw new ImportError('NO_RECIPE_FOUND', 'No recipe was found on this page.');
    return draft;
  };
}
