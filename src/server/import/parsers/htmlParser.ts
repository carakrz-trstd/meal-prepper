import * as cheerio from 'cheerio';
import type { MealDraft } from '../../../shared/types';
import { parseIngredientLine } from '../ingredientLineParser';

const DEFAULT_SERVINGS = 4;
const INGREDIENT_HEADING = /^(zutaten|ingredients?)\b/i;

/** Fallback parser for pages without schema.org data: microdata or a list under an ingredients heading. */
export function parseHtmlRecipe(html: string, sourceUrl: string): MealDraft | null {
  const $ = cheerio.load(html);

  let lines: string[] = $('[itemprop="recipeIngredient"], [itemprop="ingredients"]')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  if (lines.length === 0) {
    $('h1, h2, h3, h4, h5, strong, b').each((_, el) => {
      if (lines.length > 0) return;
      if (!INGREDIENT_HEADING.test($(el).text().trim())) return;
      const list = $(el).nextAll('ul, ol').first();
      const items = list
        .find('li')
        .map((__, li) => $(li).text().trim())
        .get()
        .filter(Boolean);
      if (items.length > 0) lines = items;
    });
  }
  if (lines.length === 0) return null;

  const name = ($('[itemprop="name"]').first().text() || $('h1').first().text() || $('title').text()).trim();
  if (!name) return null;

  return {
    name,
    baseServings: DEFAULT_SERVINGS,
    baseServingsNeedsConfirmation: true,
    ingredients: lines.map(parseIngredientLine),
    prepMinutes: null,
    cookMinutes: null,
    caloriesPerServing: null,
    totalCostEur: null,
    caloriesEstimate: null,
    costEstimate: null,
    sourceUrl,
    missing: ['calories', 'cost', 'prepMinutes', 'cookMinutes'],
  };
}
