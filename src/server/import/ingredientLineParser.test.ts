import { describe, it, expect } from 'vitest';
import { parseIngredientLine } from './ingredientLineParser';

describe('parseIngredientLine (T-6)', () => {
  it('"200 g Mehl" -> 200 / g / Mehl', () => {
    expect(parseIngredientLine('200 g Mehl')).toEqual({ name: 'Mehl', quantity: 200, unit: 'g' });
  });
  it('decimal comma: "1,5 kg Kartoffeln"', () => {
    expect(parseIngredientLine('1,5 kg Kartoffeln')).toEqual({ name: 'Kartoffeln', quantity: 1.5, unit: 'kg' });
  });
  it('mixed fraction: "1 1/2 EL Zucker" -> 1.5 tbsp', () => {
    expect(parseIngredientLine('1 1/2 EL Zucker')).toEqual({ name: 'Zucker', quantity: 1.5, unit: 'tbsp' });
  });
  it('count without unit: "2 Eier" -> 2 piece', () => {
    expect(parseIngredientLine('2 Eier')).toEqual({ name: 'Eier', quantity: 2, unit: 'piece' });
  });
  it('unicode fraction: "½ TL Salz" -> 0.5 tsp', () => {
    expect(parseIngredientLine('½ TL Salz')).toEqual({ name: 'Salz', quantity: 0.5, unit: 'tsp' });
  });
  it('no quantity: "Salz nach Geschmack" keeps the name, quantity and unit null', () => {
    expect(parseIngredientLine('Salz nach Geschmack')).toEqual({ name: 'Salz nach Geschmack', quantity: null, unit: null });
  });
  it('unknown unit: "1 Bund Petersilie" -> quantity and unit null, name kept', () => {
    const r = parseIngredientLine('1 Bund Petersilie');
    expect(r.quantity).toBeNull();
    expect(r.unit).toBeNull();
    expect(r.name).toBe('1 Bund Petersilie');
  });
  it('pinch: "1 Prise Salz", "2 pinches salt", "1 pinch of salt"', () => {
    expect(parseIngredientLine('1 Prise Salz')).toEqual({ name: 'Salz', quantity: 1, unit: 'pinch' });
    expect(parseIngredientLine('2 pinches salt')).toEqual({ name: 'salt', quantity: 2, unit: 'pinch' });
    expect(parseIngredientLine('1 pinch of salt')).toEqual({ name: 'of salt', quantity: 1, unit: 'pinch' });
    expect(parseIngredientLine('½ Prise Zimt')).toEqual({ name: 'Zimt', quantity: 0.5, unit: 'pinch' });
  });
  it('English units: "2 tablespoons olive oil", "250 ml milk", "1 cup flour" (unknown)', () => {
    expect(parseIngredientLine('2 tablespoons olive oil')).toEqual({ name: 'olive oil', quantity: 2, unit: 'tbsp' });
    expect(parseIngredientLine('250 ml milk')).toEqual({ name: 'milk', quantity: 250, unit: 'ml' });
    expect(parseIngredientLine('1 cup flour').unit).toBeNull();
  });
  it('unit glued to the number: "200g flour"', () => {
    expect(parseIngredientLine('200g flour')).toEqual({ name: 'flour', quantity: 200, unit: 'g' });
  });
});
