import { RecipeFetcher } from '../../import/RecipeFetcher';
import { makeParseRecipeFromUrl, type ParseRecipeFromUrl } from '../parseRecipeFromUrl';
import { AllrecipesAdapter } from './AllrecipesAdapter';
import { FallbackSearch } from './FallbackSearch';
import { GoogleAdapter } from './GoogleAdapter';
import type { SearchEngineAdapter } from './SearchEngineAdapter';

export interface SearchSetup {
  adapter: SearchEngineAdapter;
  parse: ParseRecipeFromUrl;
  /** shared cap for the whole online search; default 30 s */
  deadlineMs: number;
}

/**
 * Production wiring: google.com first, allrecipes.com when google.com blocks (AC-27). The base URLs and the
 * deadline can be overridden by env (used by the e2e stubs): SEARCH_GOOGLE_BASE_URL, SEARCH_ALLRECIPES_BASE_URL,
 * ONLINE_SEARCH_DEADLINE_MS.
 */
export function defaultSearchSetup(env: NodeJS.ProcessEnv = process.env): SearchSetup {
  const deadline = Number(env.ONLINE_SEARCH_DEADLINE_MS);
  return {
    adapter: new FallbackSearch(
      new GoogleAdapter({ baseUrl: env.SEARCH_GOOGLE_BASE_URL }),
      new AllrecipesAdapter({ baseUrl: env.SEARCH_ALLRECIPES_BASE_URL }),
    ),
    parse: makeParseRecipeFromUrl(new RecipeFetcher()),
    deadlineMs: deadline > 0 ? deadline : 30_000,
  };
}
