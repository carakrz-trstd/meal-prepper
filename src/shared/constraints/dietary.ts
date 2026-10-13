import { normalizeIngredientName } from '../normalize';
import type { DietaryViolation, Participant, Restriction, RestrictionKeyword } from './types';

export type Classification = 'violating' | 'verified' | 'unknown';

interface Compiled {
  len: number;
  effect: 'forbidden' | 'safe';
  test: (name: string) => boolean;
}

interface Matcher {
  byRestriction: Map<Restriction, Compiled[]>;
  cache: Map<string, Classification>;
}

const matchers = new WeakMap<RestrictionKeyword[], Matcher>();
const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** `keyword` occurs in `name` as a whole word (not glued to other letters or digits). */
function hasWord(name: string, keyword: string): boolean {
  for (let i = name.indexOf(keyword); i !== -1; i = name.indexOf(keyword, i + 1)) {
    if (!isWordChar(name[i - 1]) && !isWordChar(name[i + keyword.length])) return true;
  }
  return false;
}

function matcherFor(keywords: RestrictionKeyword[]): Matcher {
  let m = matchers.get(keywords);
  if (m) return m;
  m = { byRestriction: new Map(), cache: new Map() };
  for (const k of keywords) {
    const keyword = k.keyword.trim().toLowerCase();
    if (!keyword) continue;
    // Forbidden keywords match anywhere ("nut" in "walnut", cautious); safe keywords only as whole words,
    // so "pea" does not make "peach" safe.
    const compiled: Compiled = {
      len: keyword.length,
      effect: k.effect,
      test: k.effect === 'safe' ? (name) => hasWord(name, keyword) : (name) => name.includes(keyword),
    };
    const list = m.byRestriction.get(k.restriction) ?? [];
    list.push(compiled);
    m.byRestriction.set(k.restriction, list);
  }
  matchers.set(keywords, m);
  return m;
}

/**
 * Checks one ingredient against one restriction using the data-driven keyword mapping (NFR-3):
 * the longest matching keyword decides; on equal length "forbidden" wins (caution). No match = unknown (AC-9).
 * Note: the keyword array is treated as immutable; pass a new array after changing the mapping.
 */
export function classifyIngredient(name: string, restriction: Restriction, keywords: RestrictionKeyword[]): Classification {
  const m = matcherFor(keywords);
  const key = normalizeIngredientName(name);
  const cacheKey = `${restriction}\u0000${key}`;
  const cached = m.cache.get(cacheKey);
  if (cached) return cached;

  let best: Compiled | null = null;
  for (const c of m.byRestriction.get(restriction) ?? []) {
    if (!c.test(key)) continue;
    if (!best || c.len > best.len || (c.len === best.len && c.effect === 'forbidden' && best.effect !== 'forbidden')) best = c;
  }
  const result: Classification = !best ? 'unknown' : best.effect === 'forbidden' ? 'violating' : 'verified';
  m.cache.set(cacheKey, result);
  return result;
}

/** Checks a meal against the restrictions of all given participants (AC-8, AC-9). */
export function checkMeal(
  meal: { ingredients: { name: string }[] },
  participants: Pick<Participant, 'name' | 'restrictions'>[],
  keywords: RestrictionKeyword[],
): { violations: DietaryViolation[]; unknownIngredients: string[] } {
  const violations: DietaryViolation[] = [];
  const unknown = new Set<string>();
  for (const p of participants) {
    for (const restriction of p.restrictions) {
      for (const ing of meal.ingredients) {
        const c = classifyIngredient(ing.name, restriction, keywords);
        if (c === 'violating') violations.push({ participant: p.name, restriction, ingredient: ing.name });
        else if (c === 'unknown') unknown.add(ing.name);
      }
    }
  }
  return { violations, unknownIngredients: [...unknown] };
}
