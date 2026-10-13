import type { Unit } from './units';

export interface IngredientInput {
  name: string;
  quantity: number;
  unit: Unit;
}

export interface Ingredient extends IngredientInput {
  id: number;
  position: number;
  nameKey: string;
}

/** Input for creating or updating a meal. Optional values may be null/undefined = missing. */
export interface MealInput {
  name: string;
  baseServings: number;
  ingredients: IngredientInput[];
  prepMinutes?: number | null;
  cookMinutes: number;
  caloriesPerServing?: number | null;
  totalCostEur?: number | null;
  caloriesEstimated?: boolean;
  costEstimated?: boolean;
  sourceUrl?: string | null;
}

export interface Meal {
  id: number;
  name: string;
  baseServings: number;
  ingredients: Ingredient[];
  prepMinutes: number;
  cookMinutes: number;
  totalMinutes: number;
  caloriesPerServing: number | null;
  caloriesEstimated: boolean;
  totalCostEur: number | null;
  costEstimated: boolean;
  isFavourite: boolean;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  code: 'VALIDATION' | 'DUPLICATE_NAME' | 'NOT_FOUND' | 'INVALID_URL' | 'UNREACHABLE' | 'NO_RECIPE_FOUND';
  message?: string;
  fields?: FieldError[];
}

export type EstimateField = 'calories' | 'cost';

export interface DraftIngredient {
  name: string;
  quantity: number | null;
  unit: Unit | null;
}

export interface Estimate {
  value: number;
  isEstimate: true;
}

export interface MealDraft {
  name: string;
  baseServings: number;
  baseServingsNeedsConfirmation: boolean;
  ingredients: DraftIngredient[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  caloriesPerServing: number | null;
  totalCostEur: number | null;
  caloriesEstimate: Estimate | null;
  costEstimate: Estimate | null;
  sourceUrl: string;
  missing: string[];
}

export type ImportStage = 'fetching' | 'parsing' | 'estimating_calories' | 'estimating_cost';

export type ImportJobStatus =
  | { status: 'running'; stage: ImportStage }
  | { status: 'done'; draft: MealDraft; skippedEstimates: EstimateField[] }
  | {
      status: 'failed';
      error: { code: 'UNREACHABLE' | 'NO_RECIPE_FOUND' | 'INVALID_URL'; message: string };
    };
