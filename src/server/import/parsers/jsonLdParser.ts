import * as cheerio from 'cheerio';
import type { MealDraft } from '../../../shared/types';
import { parseIngredientLine } from '../ingredientLineParser';
import { parseDurationMinutes } from '../durationParser';

type Json = Record<string, unknown>;

const DEFAULT_SERVINGS = 4;

function collectNodes(value: unknown, out: Json[]): void {
  if (Array.isArray(value)) {
    value.forEach((v) => collectNodes(v, out));
  } else if (value && typeof value === 'object') {
    const obj = value as Json;
    out.push(obj);
    if (obj['@graph']) collectNodes(obj['@graph'], out);
  }
}

function isRecipe(node: Json): boolean {
  const t = node['@type'];
  return Array.isArray(t) ? t.includes('Recipe') : t === 'Recipe';
}

function firstString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(firstString).find((s) => s !== null) ?? null;
  if (typeof v === 'number') return String(v);
  return null;
}

/** "4 Portionen", "2 servings", ["4", "4 Portionen"], 6 -> number, null when absent. */
function parseYield(v: unknown): number | null {
  const candidates = Array.isArray(v) ? v : [v];
  for (const c of candidates) {
    const s = typeof c === 'number' ? String(c) : typeof c === 'string' ? c : '';
    const m = s.match(/\d+/);
    if (m) {
      const n = parseInt(m[0], 10);
      if (n >= 1) return n;
    }
  }
  return null;
}

function parseCalories(nutrition: unknown): number | null {
  if (!nutrition || typeof nutrition !== 'object') return null;
  const s = firstString((nutrition as Json).calories);
  const m = s?.match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
}

/** schema.org `estimatedCost` (Recipe is a HowTo): only EUR amounts count, as {currency, value} or "12.50 EUR"/"12,50 €". */
function parseEstimatedCostEur(cost: unknown): number | null {
  if (!cost) return null;
  if (typeof cost === 'object' && !Array.isArray(cost)) {
    const c = cost as Json;
    const currency = firstString(c.currency)?.toUpperCase();
    const value = firstString(c.value);
    if (currency === 'EUR' && value) {
      const n = Number(value.replace(',', '.'));
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return null;
  }
  const s = firstString(cost);
  if (!s || !/(€|eur)/i.test(s)) return null;
  const m = s.match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
}

/** Extracts a schema.org Recipe from JSON-LD script blocks; null if none is found (AC-9). */
export function parseJsonLd(html: string, sourceUrl: string): MealDraft | null {
  const $ = cheerio.load(html);
  const nodes: Json[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectNodes(JSON.parse($(el).contents().text()), nodes);
    } catch {
      /* malformed block: ignore */
    }
  });
  const recipe = nodes.find(isRecipe);
  if (!recipe) return null;

  const name = firstString(recipe.name)?.trim();
  const rawIngredients = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [];
  const ingredients = rawIngredients
    .filter((l): l is string => typeof l === 'string' && l.trim() !== '')
    .map(parseIngredientLine);
  if (!name || ingredients.length === 0) return null;

  const yieldN = parseYield(recipe.recipeYield);
  const prep = parseDurationMinutes(firstString(recipe.prepTime));
  const cook = parseDurationMinutes(firstString(recipe.cookTime));
  const calories = parseCalories(recipe.nutrition);
  const cost = parseEstimatedCostEur(recipe.estimatedCost);

  const missing: string[] = [];
  if (calories === null) missing.push('calories');
  if (cost === null) missing.push('cost');
  if (prep === null) missing.push('prepMinutes');
  if (cook === null) missing.push('cookMinutes');

  return {
    name,
    baseServings: yieldN ?? DEFAULT_SERVINGS,
    baseServingsNeedsConfirmation: yieldN === null,
    ingredients,
    prepMinutes: prep,
    cookMinutes: cook,
    caloriesPerServing: calories,
    totalCostEur: cost,
    caloriesEstimate: null,
    costEstimate: null,
    sourceUrl,
    missing,
  };
}
