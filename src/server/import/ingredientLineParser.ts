import type { Unit } from '../../shared/units';
import type { DraftIngredient } from '../../shared/types';

const UNIT_ALIASES: Record<string, Unit> = {
  g: 'g', gr: 'g', gramm: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilo: 'kg', kilogramm: 'kg', kilogram: 'kg',
  ml: 'ml', milliliter: 'ml', millilitre: 'ml',
  l: 'l', liter: 'l', litre: 'l',
  tsp: 'tsp', tl: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', teelöffel: 'tsp',
  tbsp: 'tbsp', el: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', esslöffel: 'tbsp',
  piece: 'piece', pieces: 'piece', stück: 'piece', stk: 'piece', pc: 'piece', pcs: 'piece',
  pinch: 'pinch', pinches: 'pinch', prise: 'pinch', prisen: 'pinch',
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125,
};

/** Parses a leading quantity ("1 1/2", "1,5", "½", "200"); returns the number and the rest of the line. */
function takeQuantity(line: string): { quantity: number; rest: string } | null {
  let s = line;
  let total = 0;
  let found = false;

  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)\s*/);
  if (mixed) {
    total = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    return { quantity: total, rest: s.slice(mixed[0].length) };
  }
  const frac = s.match(/^(\d+)\/(\d+)\s*/);
  if (frac) return { quantity: Number(frac[1]) / Number(frac[2]), rest: s.slice(frac[0].length) };

  const num = s.match(/^(\d+(?:[.,]\d+)?)\s*/);
  if (num) {
    total = Number(num[1].replace(',', '.'));
    s = s.slice(num[0].length);
    found = true;
  }
  const uni = s.match(/^([½¼¾⅓⅔⅛])\s*/);
  if (uni) {
    total += UNICODE_FRACTIONS[uni[1]];
    s = s.slice(uni[0].length);
    found = true;
  }
  return found ? { quantity: total, rest: s } : null;
}

/**
 * Parses an ingredient line into quantity, unit and name. Lines that cannot be parsed keep the original text
 * as the name with quantity and unit null so the user can complete them in the review step.
 */
export function parseIngredientLine(raw: string): DraftIngredient {
  const line = raw.replace(/\s+/g, ' ').trim();
  const q = takeQuantity(line);
  if (!q) return { name: line, quantity: null, unit: null };

  const unitMatch = q.rest.match(/^([\p{L}]+)\.?\s+(.+)$/u) ?? q.rest.match(/^([\p{L}]+)\.?$/u);
  if (unitMatch) {
    const token = unitMatch[1].toLowerCase();
    const alias = UNIT_ALIASES[token];
    if (alias && unitMatch[2]) return { name: unitMatch[2].trim(), quantity: q.quantity, unit: alias };
    // A known "count" word or an unknown unit word: unknown units are left to the user.
    if (!alias && unitMatch[2] && isUnknownUnitWord(token)) return { name: line, quantity: null, unit: null };
  }
  const rest = q.rest.trim();
  if (rest === '') return { name: line, quantity: null, unit: null };
  return { name: rest, quantity: q.quantity, unit: 'piece' };
}

/** Words that look like units we do not support (cup, Bund, Prise, ...). */
function isUnknownUnitWord(token: string): boolean {
  return ['cup', 'cups', 'bund', 'handful', 'dose', 'dosen', 'can', 'cans', 'pkg', 'packung', 'oz', 'lb', 'lbs', 'zehe', 'zehen', 'clove', 'cloves', 'bunch', 'scheibe', 'scheiben', 'slice', 'slices', 'pack', 'glas', 'becher']
    .includes(token);
}
