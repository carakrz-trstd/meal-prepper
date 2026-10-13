import { describe, it, expect } from 'vitest';
import { estimateCalories, estimateCost } from './estimate';
import { toGrams } from './units';
import type { NutritionProvider } from './NutritionProvider';
import type { PriceProvider } from './PriceProvider';
import type { DraftIngredient } from '../../../shared/types';

const signal = () => new AbortController().signal;
const ing = (name: string, quantity: number | null, unit: DraftIngredient['unit']): DraftIngredient => ({ name, quantity, unit });

const nutrition = (table: Record<string, { kcalPer100g: number; gramsPerPiece?: number }>): NutritionProvider => ({
  async lookup(name) {
    return table[name] ?? null;
  },
});
const prices = (table: Record<string, { priceEur: number; packAmount: number; packUnit: 'g' | 'ml' | 'piece' }>): PriceProvider => ({
  async lookup(name) {
    return table[name] ?? null;
  },
});

describe('unit conversion for estimates (T-9)', () => {
  it('converts g, kg, ml, l, tsp, tbsp to grams (density 1, tsp 5 ml, tbsp 15 ml)', () => {
    expect(toGrams(200, 'g')).toBe(200);
    expect(toGrams(1.5, 'kg')).toBe(1500);
    expect(toGrams(250, 'ml')).toBe(250);
    expect(toGrams(0.5, 'l')).toBe(500);
    expect(toGrams(2, 'tsp')).toBe(10);
    expect(toGrams(2, 'tbsp')).toBe(30);
  });
  it('piece needs a gram weight, otherwise null (no guess)', () => {
    expect(toGrams(2, 'piece')).toBeNull();
    expect(toGrams(2, 'piece', 60)).toBe(120);
  });
});

describe('estimateCalories (AC-24, T-9)', () => {
  it('sums kcal over ingredients and divides by base servings: (200+50)/2 = 125', async () => {
    const p = nutrition({ A: { kcalPer100g: 100 }, B: { kcalPer100g: 50 } });
    expect(await estimateCalories([ing('A', 200, 'g'), ing('B', 100, 'g')], 2, p, signal())).toBe(125);
  });
  it('an ingredient without a match -> null', async () => {
    const p = nutrition({ A: { kcalPer100g: 100 } });
    expect(await estimateCalories([ing('A', 100, 'g'), ing('Unobtanium', 10, 'g')], 2, p, signal())).toBeNull();
  });
  it('converts tsp/tbsp/ml/l', async () => {
    const p = nutrition({ Oil: { kcalPer100g: 800 }, Milk: { kcalPer100g: 50 } });
    // 1 tbsp = 15 g -> 120 kcal ; 0.5 l = 500 g -> 250 kcal ; 1 serving
    expect(await estimateCalories([ing('Oil', 1, 'tbsp'), ing('Milk', 0.5, 'l')], 1, p, signal())).toBe(370);
  });
  it('piece without gramsPerPiece -> null; with gramsPerPiece it counts', async () => {
    expect(await estimateCalories([ing('Egg', 2, 'piece')], 1, nutrition({ Egg: { kcalPer100g: 150 } }), signal())).toBeNull();
    expect(await estimateCalories([ing('Egg', 2, 'piece')], 1, nutrition({ Egg: { kcalPer100g: 150, gramsPerPiece: 50 } }), signal())).toBe(150);
  });
  it('a provider that throws -> null, no exception escapes (AC-18)', async () => {
    const p: NutritionProvider = { lookup: async () => { throw new Error('network down'); } };
    expect(await estimateCalories([ing('A', 1, 'g')], 1, p, signal())).toBeNull();
  });
  it('an aborted signal -> null (AC-21)', async () => {
    const ac = new AbortController();
    ac.abort();
    const p: NutritionProvider = { lookup: async () => ({ kcalPer100g: 100 }) };
    expect(await estimateCalories([ing('A', 100, 'g')], 1, p, ac.signal)).toBeNull();
  });
  it('an ingredient with null quantity -> null', async () => {
    expect(await estimateCalories([ing('A', null, null)], 1, nutrition({ A: { kcalPer100g: 1 } }), signal())).toBeNull();
  });
});

describe('estimateCost (AC-25, T-9)', () => {
  it('pack 500 g at 1.00 EUR, need 250 g -> 0.50', async () => {
    const p = prices({ Flour: { priceEur: 1, packAmount: 500, packUnit: 'g' } });
    expect(await estimateCost([ing('Flour', 250, 'g')], p, signal())).toBeCloseTo(0.5);
  });
  it('sums over ingredients (kg need against g pack, piece against piece pack)', async () => {
    const p = prices({
      Flour: { priceEur: 1, packAmount: 1000, packUnit: 'g' },
      Eggs: { priceEur: 3, packAmount: 10, packUnit: 'piece' },
    });
    expect(await estimateCost([ing('Flour', 2, 'kg'), ing('Eggs', 5, 'piece')], p, signal())).toBeCloseTo(3.5);
  });
  it('one unmatched ingredient -> null', async () => {
    const p = prices({ Flour: { priceEur: 1, packAmount: 500, packUnit: 'g' } });
    expect(await estimateCost([ing('Flour', 100, 'g'), ing('Unobtanium', 1, 'g')], p, signal())).toBeNull();
  });
  it('null quantity -> null; piece need against a gram pack -> null', async () => {
    const p = prices({ Flour: { priceEur: 1, packAmount: 500, packUnit: 'g' } });
    expect(await estimateCost([ing('Flour', null, null)], p, signal())).toBeNull();
    expect(await estimateCost([ing('Flour', 2, 'piece')], p, signal())).toBeNull();
  });
  it('provider throws or aborted -> null', async () => {
    const boom: PriceProvider = { lookup: async () => { throw new Error('x'); } };
    expect(await estimateCost([ing('A', 1, 'g')], boom, signal())).toBeNull();
    const ac = new AbortController();
    ac.abort();
    expect(await estimateCost([ing('A', 1, 'g')], prices({ A: { priceEur: 1, packAmount: 1, packUnit: 'g' } }), ac.signal)).toBeNull();
  });
});

describe('provider contract (NFR-9)', () => {
  it('any object with a lookup function can be swapped in', async () => {
    const fake: NutritionProvider = { lookup: async () => ({ kcalPer100g: 10 }) };
    expect(await estimateCalories([ing('X', 100, 'g')], 1, fake, signal())).toBe(10);
  });
});
