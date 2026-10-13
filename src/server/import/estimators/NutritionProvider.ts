export interface NutritionLookup {
  kcalPer100g: number;
  /** Weight of one piece in grams, when the source provides it. */
  gramsPerPiece?: number;
}

/** Replaceable source of per-ingredient nutrition data (NFR-9). Returns null when there is no match. */
export interface NutritionProvider {
  lookup(ingredientName: string, signal: AbortSignal): Promise<NutritionLookup | null>;
}
