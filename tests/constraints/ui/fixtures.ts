import type { MealDraft } from '../../../src/shared/types';
import type { Participant, SuggestionMatch, SuggestionPrefs, SuggestionResult } from '../../../src/shared/constraints/types';

export const emptyPrefs: SuggestionPrefs = { calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [] };

export const anna: Participant = { id: 1, name: 'Anna', restrictions: ['vegetarian'] };
export const ben: Participant = { id: 2, name: 'Ben', restrictions: ['gluten-free'] };
export const cleo: Participant = { id: 3, name: 'Cleo', restrictions: [] };

export function libMatch(id: number, name: string, over: Partial<SuggestionMatch> = {}): SuggestionMatch {
  return {
    source: 'library', mealId: id, favourite: false, unknownIngredients: [],
    usedEstimate: { calories: false, cost: false },
    meal: {
      id, name, baseServings: 4, caloriesPerServing: 450, totalCostEur: 8, prepMinutes: 10, cookMinutes: 20, totalMinutes: 30,
      caloriesEstimated: false, costEstimated: false, ingredients: ['Carrot'],
    },
    ...over,
  };
}

export function onlineMatch(candidateId: string, name: string, over: Partial<SuggestionMatch> = {}): SuggestionMatch {
  return libMatch(0, name, { source: 'online', mealId: undefined, candidateId, sourceUrl: `https://r.example/${candidateId}`, ...over });
}

export const result = (matches: SuggestionMatch[], over: Partial<SuggestionResult> = {}): SuggestionResult => ({
  matches, appliedLimits: [], ...over,
});

export const draft = (name: string): MealDraft => ({
  name, baseServings: 4, baseServingsNeedsConfirmation: false,
  ingredients: [{ name: 'Carrot', quantity: 100, unit: 'g' }],
  prepMinutes: 10, cookMinutes: 20, caloriesPerServing: 400, totalCostEur: 8,
  caloriesEstimate: null, costEstimate: null, sourceUrl: 'https://r.example/c1', missing: [],
});
