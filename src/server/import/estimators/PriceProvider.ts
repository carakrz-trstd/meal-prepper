export interface PriceLookup {
  /** Price of the purchasable pack in EUR. */
  priceEur: number;
  /** Size of the pack in `packUnit`. */
  packAmount: number;
  packUnit: 'g' | 'ml' | 'piece';
}

/** Replaceable source of ingredient prices (NFR-9). Returns null when there is no match. */
export interface PriceProvider {
  lookup(ingredientName: string, signal: AbortSignal): Promise<PriceLookup | null>;
}
