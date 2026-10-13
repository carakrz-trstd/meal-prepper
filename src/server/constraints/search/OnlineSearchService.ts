import type { MealDraft } from '../../../shared/types';
import type { Limits, Participant, RestrictionKeyword, SuggestionMatch } from '../../../shared/constraints/types';
import { assessMeal, summarize, type SuggestMeal } from '../../../shared/constraints/suggest';
import type { SearchEngineAdapter } from './SearchEngineAdapter';
import type { SearchSessionStore } from './SearchSessionStore';

export const FAILED_MESSAGE = 'The online search failed or found nothing.';

export interface OnlineSearchDeps {
  adapter: SearchEngineAdapter;
  /** Epic 1 importer without estimate lookups (AD-9). */
  parse: (url: string, signal: AbortSignal) => Promise<MealDraft>;
  store: SearchSessionStore;
  /** blacklist, dietary mapping and ticked participants (same checks as for library meals, AC-17) */
  context: (participantIds: number[]) => { blacklist: string[]; keywords: RestrictionKeyword[]; participants: Participant[] };
  /** `source_url` of the meals already in the library; recipes from these URLs are skipped (AC-23) */
  libraryUrls: () => Set<string>;
  /** One shared cap for the whole search incl. all imports; default 30 s (AC-17) */
  deadlineMs?: number;
  /** How many result pages are imported; default 5 */
  maxResults?: number;
}

export interface OnlineSearchInput {
  limits: Limits;
  participantIds: number[];
  servings: number;
}

function toSuggestMeal(draft: MealDraft): SuggestMeal {
  return {
    id: 0,
    name: draft.name,
    baseServings: draft.baseServings,
    caloriesPerServing: draft.caloriesPerServing,
    caloriesEstimated: false,
    totalCostEur: draft.totalCostEur,
    costEstimated: false,
    prepMinutes: draft.prepMinutes,
    cookMinutes: draft.cookMinutes,
    ingredients: draft.ingredients.map((i) => ({ name: i.name })),
  };
}

/** e.g. "nut-free vegetarian dinner recipe": the ticked participants' restrictions help the engine find fitting recipes. */
export function buildQuery(participants: Participant[]): string {
  const restrictions = [...new Set(participants.flatMap((p) => p.restrictions))].sort();
  return [...restrictions, 'dinner recipe'].join(' ');
}

/**
 * Online search (AD-7, AD-8, AD-9): search google.com (falling back to allrecipes.com), import up to 5 result
 * pages in parallel, apply the same limits/blacklist/dietary checks as for library meals and emit matches as
 * they finish. Everything runs under one deadline; unfinished imports are aborted and discarded.
 * Nothing happens until `start` is called (AC-16).
 */
export class OnlineSearchService {
  constructor(private readonly deps: OnlineSearchDeps) {}

  start(input: OnlineSearchInput): string {
    const session = this.deps.store.create();
    void this.run(session.id, input);
    return session.id;
  }

  private async run(id: string, input: OnlineSearchInput): Promise<void> {
    const { store, adapter, parse } = this.deps;
    const ctx = this.deps.context(input.participantIds);
    const maxResults = this.deps.maxResults ?? 5;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.deps.deadlineMs ?? 30_000);
    const deadline = new Promise<'deadline'>((resolve) => ac.signal.addEventListener('abort', () => resolve('deadline'), { once: true }));
    let closed = false;
    let found = 0;

    const work = (async () => {
      const urls = await adapter.search(buildQuery(ctx.participants), ac.signal);
      const inLibrary = this.deps.libraryUrls();
      const picks = [...new Set(urls)].filter((u) => !inLibrary.has(u)).slice(0, maxResults);

      await Promise.allSettled(
        picks.map(async (url) => {
          const draft = await parse(url, ac.signal);
          if (closed) return; // finished after the deadline: discard
          const meal = toSuggestMeal(draft);
          const a = assessMeal(meal, { ...ctx, limits: input.limits, servings: input.servings });
          if (!a.ok) return;
          found += 1;
          const match: SuggestionMatch = {
            source: 'online',
            candidateId: `c${found}`,
            sourceUrl: url,
            meal: summarize(meal),
            favourite: false,
            unknownIngredients: a.unknownIngredients,
            usedEstimate: a.usedEstimate,
          };
          store.addCandidate(id, { match, draft: { ...draft, sourceUrl: url } });
        }),
      );
    })();
    work.catch(() => undefined); // a rejection after the deadline must not surface as unhandled

    try {
      await Promise.race([work, deadline]);
      closed = true;
      store.emit(id, { type: 'done', found });
    } catch {
      closed = true;
      store.emit(id, { type: 'failed', message: FAILED_MESSAGE });
    } finally {
      clearTimeout(timer);
      ac.abort(); // stop whatever is still running
    }
  }
}
