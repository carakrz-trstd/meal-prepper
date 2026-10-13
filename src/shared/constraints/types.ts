export const RESTRICTIONS = ['vegetarian', 'vegan', 'gluten-free', 'lactose-free', 'nut-free', 'seafood-free'] as const;
export type Restriction = (typeof RESTRICTIONS)[number];

export function isRestriction(value: unknown): value is Restriction {
  return typeof value === 'string' && (RESTRICTIONS as readonly string[]).includes(value);
}

export interface Participant {
  id: number;
  name: string;
  restrictions: Restriction[];
}

export interface RestrictionKeyword {
  restriction: Restriction;
  keyword: string;
  effect: 'forbidden' | 'safe';
}

export interface Limits {
  /** kcal per serving */
  calorieLimit?: number | null;
  /** EUR for the servings being planned */
  budgetLimit?: number | null;
  /** minutes, preparation + cooking */
  timeLimit?: number | null;
}

export type LimitKey = 'calories' | 'budget' | 'time';

export interface DietaryViolation {
  participant: string;
  restriction: Restriction;
  ingredient: string;
}

export interface MealCheckResult {
  violations: DietaryViolation[];
  unknownIngredients: string[];
  /** blacklisted terms that match an ingredient of the meal */
  blacklisted: string[];
}

/** A planned meal that no longer fits the stored participants' restrictions or the blacklist (AC-25). */
export interface PlanWarning extends MealCheckResult {
  day: number;
  plannedMealId: number;
  mealId: number;
  mealName: string;
}

export interface SuggestionMealSummary {
  id: number;
  name: string;
  baseServings: number;
  caloriesPerServing: number | null;
  totalCostEur: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  caloriesEstimated: boolean;
  costEstimated: boolean;
  ingredients: string[];
}

export interface SuggestionMatch {
  source: 'library' | 'online';
  /** library meals only */
  mealId?: number;
  /** online candidates only */
  candidateId?: string;
  sourceUrl?: string | null;
  meal: SuggestionMealSummary;
  favourite: boolean;
  /** ingredients that could not be checked against the participants' restrictions (AC-9) */
  unknownIngredients: string[];
  /** true when an estimated calorie or cost value was used to check a limit (AC-22) */
  usedEstimate: { calories: boolean; cost: boolean };
}

export interface SuggestionResult {
  matches: SuggestionMatch[];
  appliedLimits: string[];
  message?: string;
}

export interface SuggestionPrefs {
  calorieLimit: number | null;
  budgetLimit: number | null;
  timeLimit: number | null;
  participantIds: number[];
}
