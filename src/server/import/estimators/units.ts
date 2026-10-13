import type { Unit } from '../../../shared/units';

/**
 * Converts a quantity to grams for estimates. ml/l are treated as g with density 1; tsp = 5 ml, tbsp = 15 ml.
 * "piece" needs a per-piece weight from the data source; without it there is no value (never guessed).
 */
export function toGrams(quantity: number, unit: Unit, gramsPerPiece?: number): number | null {
  switch (unit) {
    case 'g':
      return quantity;
    case 'kg':
      return quantity * 1000;
    case 'ml':
      return quantity;
    case 'l':
      return quantity * 1000;
    case 'tsp':
      return quantity * 5;
    case 'tbsp':
      return quantity * 15;
    case 'piece':
      return gramsPerPiece ? quantity * gramsPerPiece : null;
  }
}
