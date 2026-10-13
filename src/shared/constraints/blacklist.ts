import { normalizeIngredientName } from '../normalize';

/** A blacklist term is stored trimmed and lower-cased. */
export function normalizeTerm(term: string): string {
  return normalizeIngredientName(term);
}

/** Equal to or contained in the ingredient name, ignoring case and surrounding whitespace (AC-6). */
export function containsTerm(ingredientName: string, term: string): boolean {
  const t = normalizeTerm(term);
  return t !== '' && normalizeIngredientName(ingredientName).includes(t);
}

/** Names of the ingredients that match any blacklisted term. */
export function findBlacklisted(ingredients: { name: string }[], terms: string[]): string[] {
  return ingredients.filter((i) => terms.some((t) => containsTerm(i.name, t))).map((i) => i.name);
}

/** The blacklisted terms that hit at least one ingredient, once each (for warnings). */
export function matchedTerms(ingredients: { name: string }[], terms: string[]): string[] {
  return terms.filter((t) => ingredients.some((i) => containsTerm(i.name, t)));
}
