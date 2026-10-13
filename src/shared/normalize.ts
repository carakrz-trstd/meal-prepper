/** Ingredient names are compared trimmed and case-insensitive; no plural or synonym handling (AC-22). */
export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase();
}
