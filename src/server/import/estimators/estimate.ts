import type { DraftIngredient } from '../../../shared/types';
import type { NutritionProvider } from './NutritionProvider';
import type { PriceProvider } from './PriceProvider';
import { toGrams } from './units';

const CONCURRENCY = 3;

/** Runs `fn` over items with limited concurrency, preserving order. */
async function mapLimited<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

/**
 * kcal per serving from per-ingredient nutrition data (AC-24). Returns null if any ingredient has no usable
 * value, a provider fails or the signal is aborted (AC-18, AC-21): the value stays missing, never guessed.
 */
export async function estimateCalories(
  ingredients: DraftIngredient[],
  baseServings: number,
  provider: NutritionProvider,
  signal: AbortSignal,
): Promise<number | null> {
  if (ingredients.length === 0 || baseServings < 1) return null;
  try {
    const parts = await mapLimited(ingredients, async (ing) => {
      if (signal.aborted || ing.quantity === null || ing.unit === null) return null;
      const hit = await provider.lookup(ing.name, signal);
      if (!hit || signal.aborted) return null;
      const grams = toGrams(ing.quantity, ing.unit, hit.gramsPerPiece);
      return grams === null ? null : (hit.kcalPer100g / 100) * grams;
    });
    if (signal.aborted || parts.some((p) => p === null)) return null;
    const total = (parts as number[]).reduce((a, b) => a + b, 0);
    return Math.round((total / baseServings) * 100) / 100;
  } catch {
    return null;
  }
}

/** Total cost in EUR for the whole meal from pack prices (AC-25); proportional to the needed quantity. */
export async function estimateCost(
  ingredients: DraftIngredient[],
  provider: PriceProvider,
  signal: AbortSignal,
): Promise<number | null> {
  if (ingredients.length === 0) return null;
  try {
    const parts = await mapLimited(ingredients, async (ing) => {
      if (signal.aborted || ing.quantity === null || ing.unit === null) return null;
      const hit = await provider.lookup(ing.name, signal);
      if (!hit || signal.aborted || hit.packAmount <= 0) return null;
      let needed: number | null;
      if (hit.packUnit === 'piece') needed = ing.unit === 'piece' ? ing.quantity : null;
      else needed = toGrams(ing.quantity, ing.unit); // piece -> null
      return needed === null ? null : (hit.priceEur / hit.packAmount) * needed;
    });
    if (signal.aborted || parts.some((p) => p === null)) return null;
    const total = (parts as number[]).reduce((a, b) => a + b, 0);
    return Math.round(total * 100) / 100;
  } catch {
    return null;
  }
}
