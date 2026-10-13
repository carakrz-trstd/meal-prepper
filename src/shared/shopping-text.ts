import type { Unit } from './units';
import { formatQuantity } from './unit-conversion';

/** Plain-text shopping list, one line per entry: "1.5 kg Flour" (AC-22). */
export function formatShoppingText(entries: { name: string; quantity: number; unit: Unit }[]): string {
  return entries.map((e) => `${formatQuantity(e.quantity)} ${e.unit} ${e.name}`).join('\n');
}
