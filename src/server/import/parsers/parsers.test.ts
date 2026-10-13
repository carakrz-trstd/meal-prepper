import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonLd } from './jsonLdParser';
import { parseHtmlRecipe } from './htmlParser';
import { parseRecipe } from '../parseRecipe';

const fixture = (name: string) => fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
const URL = 'https://example.org/recipe';

describe('jsonLdParser (T-7)', () => {
  it('extracts name, ingredients, times and servings from a Recipe (AC-4, AC-9)', () => {
    const d = parseJsonLd(fixture('recipe-jsonld.html'), URL)!;
    expect(d.name).toBe('Stub Pasta');
    expect(d.ingredients).toEqual([
      { name: 'Spaghetti', quantity: 200, unit: 'g' },
      { name: 'Tomatoes', quantity: 2, unit: 'piece' },
      { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
    ]);
    expect(d.prepMinutes).toBe(10);
    expect(d.cookMinutes).toBe(20);
    expect(d.baseServings).toBe(2);
    expect(d.baseServingsNeedsConfirmation).toBe(false);
    expect(d.sourceUrl).toBe(URL);
    expect(d.caloriesPerServing).toBeNull();
    expect(d.totalCostEur).toBeNull();
    expect(d.missing).toEqual(expect.arrayContaining(['calories', 'cost']));
  });

  it('finds the Recipe in @graph, reads a "4 Portionen" yield and calories "350 kcal" per serving', () => {
    const d = parseJsonLd(fixture('recipe-jsonld-graph.html'), URL)!;
    expect(d.name).toBe('Graph Curry');
    expect(d.baseServings).toBe(4);
    expect(d.caloriesPerServing).toBe(350);
    expect(d.cookMinutes).toBe(60);
    expect(d.ingredients[1]).toEqual({ name: 'Water', quantity: 1.5, unit: 'l' });
  });

  it('reads calories and an EUR estimatedCost when the source provides them (AC-4)', () => {
    const d = parseJsonLd(fixture('recipe-jsonld-full.html'), URL)!;
    expect(d.caloriesPerServing).toBe(520);
    expect(d.totalCostEur).toBe(12.5);
    expect(d.missing).not.toContain('cost');
    expect(d.missing).not.toContain('calories');
  });

  it('keeps unparseable ingredient lines for the user (quantity and unit null)', () => {
    const d = parseJsonLd(fixture('recipe-unparsed-line.html'), URL)!;
    expect(d.ingredients[0]).toEqual({ name: 'Salz nach Geschmack', quantity: null, unit: null });
    expect(d.ingredients[1]).toEqual({ name: 'Mehl', quantity: 200, unit: 'g' });
  });

  it('ignores instructions and image fields (AC-17)', () => {
    const d = parseJsonLd(fixture('recipe-jsonld-graph.html'), URL)!;
    const keys = Object.keys(d).join(' ').toLowerCase();
    expect(keys).not.toMatch(/instruction|image/);
  });

  it('uses servings 4 flagged for confirmation when the yield is absent (AC-23)', () => {
    const d = parseJsonLd(fixture('recipe-noyield.html'), URL)!;
    expect(d.baseServings).toBe(4);
    expect(d.baseServingsNeedsConfirmation).toBe(true);
    expect(d.prepMinutes).toBeNull();
    expect(d.missing).toContain('prepMinutes');
  });

  it('returns null for a page without JSON-LD or with another type', () => {
    expect(parseJsonLd(fixture('recipe-html.html'), URL)).toBeNull();
    expect(parseJsonLd(fixture('jsonld-other-type.html'), URL)).toBeNull();
  });

  it('survives malformed JSON-LD', () => {
    const html = '<script type="application/ld+json">{ not json </script>';
    expect(parseJsonLd(html, URL)).toBeNull();
  });
});

describe('htmlParser (T-7)', () => {
  it('reads name and ingredients from a heading and a "Zutaten" list (AC-9)', () => {
    const d = parseHtmlRecipe(fixture('recipe-html.html'), URL)!;
    expect(d.name).toBe('Kartoffelsuppe');
    expect(d.ingredients).toEqual([
      { name: 'Kartoffeln', quantity: 500, unit: 'g' },
      { name: 'Zwiebel', quantity: 1, unit: 'piece' },
      { name: 'Brühe', quantity: 1, unit: 'l' },
    ]);
    expect(d.baseServings).toBe(4);
    expect(d.baseServingsNeedsConfirmation).toBe(true);
  });

  it('returns null when no recognisable ingredient list exists', () => {
    expect(parseHtmlRecipe(fixture('not-a-recipe.html'), URL)).toBeNull();
  });
});

describe('parseRecipe (T-7)', () => {
  it('uses JSON-LD when present even if the HTML would also match (AC-9)', () => {
    const html = fixture('recipe-jsonld.html').replace('<body>', '<body><h2>Zutaten</h2><ul><li>1 Fake</li></ul>');
    expect(parseRecipe(html, URL)!.ingredients[0].name).toBe('Spaghetti');
  });
  it('falls back to HTML otherwise (AC-9)', () => {
    expect(parseRecipe(fixture('recipe-html.html'), URL)!.name).toBe('Kartoffelsuppe');
  });
  it('returns null when neither parser finds a recipe', () => {
    expect(parseRecipe(fixture('not-a-recipe.html'), URL)).toBeNull();
  });
});
