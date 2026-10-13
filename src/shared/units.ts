export const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'pinch'] as const;
export type Unit = (typeof UNITS)[number];

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}
