import { randomUUID } from 'node:crypto';
import type { EstimateField, ImportJobStatus, MealDraft } from '../../shared/types';
import { ImportError, type PageFetcher } from './RecipeFetcher';
import { parseRecipe } from './parseRecipe';
import { estimateCalories, estimateCost } from './estimators/estimate';
import type { NutritionProvider } from './estimators/NutritionProvider';
import type { PriceProvider } from './estimators/PriceProvider';

export interface ImportDeps {
  fetcher: PageFetcher;
  nutrition: NutritionProvider;
  prices: PriceProvider;
  /** Total time for the whole import incl. estimates (FR-17); default 30 s. */
  deadlineMs: number;
  /** How long finished jobs stay available; default 30 minutes. */
  jobTtlMs?: number;
}

/**
 * Runs imports as in-memory jobs (AD-17): fetch -> parse -> scraped estimates, all under one deadline.
 * Nothing is ever persisted here; saving happens only through the meal API after the user's review (AC-4).
 */
export class ImportService {
  private readonly jobs = new Map<string, ImportJobStatus>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly controllers = new Set<AbortController>();
  private readonly ttl: number;

  constructor(private readonly deps: ImportDeps) {
    this.ttl = deps.jobTtlMs ?? 30 * 60 * 1000;
  }

  start(url: string): string {
    const id = randomUUID();
    this.jobs.set(id, { status: 'running', stage: 'fetching' });
    void this.run(id, url);
    return id;
  }

  get(id: string): ImportJobStatus | null {
    return this.jobs.get(id) ?? null;
  }

  close(): void {
    for (const c of this.controllers) c.abort();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.controllers.clear();
  }

  private finish(id: string, status: ImportJobStatus): void {
    this.jobs.set(id, status);
    const t = setTimeout(() => {
      this.jobs.delete(id);
      this.timers.delete(t);
    }, this.ttl);
    t.unref?.();
    this.timers.add(t);
  }

  private async run(id: string, url: string): Promise<void> {
    const ac = new AbortController();
    this.controllers.add(ac);
    const deadline = setTimeout(() => ac.abort(), this.deps.deadlineMs);
    deadline.unref?.();
    try {
      const html = await this.deps.fetcher.fetch(url, ac.signal).catch((e: unknown) => {
        if (e instanceof ImportError) throw e;
        throw new ImportError('UNREACHABLE', ac.signal.aborted ? 'The page took too long to load.' : 'The page could not be reached.');
      });

      this.jobs.set(id, { status: 'running', stage: 'parsing' });
      const draft = parseRecipe(html, url);
      if (!draft) throw new ImportError('NO_RECIPE_FOUND', 'No recipe was found on this page.');

      const skipped = await this.estimate(id, draft, ac.signal);
      this.finish(id, { status: 'done', draft, skippedEstimates: skipped });
    } catch (e) {
      const err =
        e instanceof ImportError ? e : new ImportError('UNREACHABLE', 'The recipe could not be imported.');
      this.finish(id, { status: 'failed', error: { code: err.code, message: err.message } });
    } finally {
      clearTimeout(deadline);
      this.controllers.delete(ac);
    }
  }

  /** Fills `caloriesEstimate` / `costEstimate` when the source lacks values; returns estimates cut off by the deadline. */
  private async estimate(id: string, draft: MealDraft, signal: AbortSignal): Promise<EstimateField[]> {
    const skipped: EstimateField[] = [];
    // Unparsed ingredient lines cannot be quantified: leave everything for manual entry (AC-18).
    const quantified = draft.ingredients.every((i) => i.quantity !== null && i.unit !== null);
    if (!quantified) return skipped;

    if (draft.caloriesPerServing === null) {
      this.jobs.set(id, { status: 'running', stage: 'estimating_calories' });
      const v = await estimateCalories(draft.ingredients, draft.baseServings, this.deps.nutrition, signal);
      if (v !== null) draft.caloriesEstimate = { value: v, isEstimate: true };
      else if (signal.aborted) skipped.push('calories');
    }
    if (draft.totalCostEur === null) {
      this.jobs.set(id, { status: 'running', stage: 'estimating_cost' });
      const v = await estimateCost(draft.ingredients, this.deps.prices, signal);
      if (v !== null) draft.costEstimate = { value: v, isEstimate: true };
      else if (signal.aborted) skipped.push('cost');
    }
    return skipped;
  }
}
