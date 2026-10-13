import type { Unit } from './units';

/** Four families that may be added together; no conversion between families (AD-11, AC-14). */
export type UnitFamily = 'mass' | 'volume' | 'spoon' | 'piece';

export const FAMILY_ORDER: UnitFamily[] = ['mass', 'volume', 'spoon', 'piece'];
export const BASE_UNIT: Record<UnitFamily, Unit> = { mass: 'g', volume: 'ml', spoon: 'tsp', piece: 'piece' };

const FAMILY: Record<Unit, UnitFamily> = { g: 'mass', kg: 'mass', ml: 'volume', l: 'volume', tsp: 'spoon', tbsp: 'spoon', piece: 'piece' };
const FACTOR: Record<Unit, number> = { g: 1, kg: 1000, ml: 1, l: 1000, tsp: 1, tbsp: 3, piece: 1 };
const LARGE: Partial<Record<UnitFamily, { unit: Unit; threshold: number }>> = {
  mass: { unit: 'kg', threshold: 1000 },
  volume: { unit: 'l', threshold: 1000 },
  spoon: { unit: 'tbsp', threshold: 3 },
};
const EPSILON = 1e-9;

export function familyOf(unit: Unit): UnitFamily {
  return FAMILY[unit];
}

/** Quantity in the family's base unit (g, ml, tsp, piece). */
export function toBase(quantity: number, unit: Unit): number {
  return quantity * FACTOR[unit];
}

const roundHalfUp1 = (n: number) => Math.round((n + EPSILON) * 10) / 10;

/** Display quantity and unit for an amount in the family's base unit: threshold switch, <= 1 decimal, pieces rounded up (AC-21). */
export function formatBase(baseQuantity: number, family: UnitFamily): { quantity: number; unit: Unit } {
  if (family === 'piece') return { quantity: Math.ceil(baseQuantity - EPSILON), unit: 'piece' };
  const rounded = roundHalfUp1(baseQuantity);
  const large = LARGE[family];
  if (large && rounded >= large.threshold) {
    return { quantity: roundHalfUp1(baseQuantity / FACTOR[large.unit]), unit: large.unit };
  }
  return { quantity: rounded, unit: BASE_UNIT[family] };
}

/** 2 -> "2", 1.5 -> "1.5" (no trailing .0). */
export function formatQuantity(quantity: number): string {
  return String(Number(quantity.toFixed(1)));
}
