import { isUnit } from './units';
import type { FieldError, MealInput } from './types';

export type ValidationResult = { ok: true } | { ok: false; errors: FieldError[] };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const missing = (v: unknown) => v === undefined || v === null;

/** Validates a meal input. Used by both client and server (AC-1, AC-11, AC-12, AC-14). */
export function validateMealInput(input: unknown): ValidationResult {
  const errors: FieldError[] = [];
  const m = (input ?? {}) as Partial<MealInput>;

  if (typeof m.name !== 'string' || m.name.trim() === '') {
    errors.push({ field: 'name', message: 'Name is required.' });
  }
  if (!isInt(m.baseServings) || m.baseServings < 1) {
    errors.push({ field: 'baseServings', message: 'Base servings must be a whole number of 1 or more.' });
  }
  if (!isInt(m.cookMinutes) || m.cookMinutes < 1) {
    errors.push({ field: 'cookMinutes', message: 'Cooking time is required (whole minutes, at least 1).' });
  }
  if (!missing(m.prepMinutes) && (!isInt(m.prepMinutes) || m.prepMinutes < 0)) {
    errors.push({ field: 'prepMinutes', message: 'Preparation time must be a whole number of minutes, 0 or more.' });
  }
  if (!missing(m.caloriesPerServing) && (!isNum(m.caloriesPerServing) || m.caloriesPerServing < 0)) {
    errors.push({ field: 'caloriesPerServing', message: 'Calories must be 0 or more.' });
  }
  if (!missing(m.totalCostEur) && (!isNum(m.totalCostEur) || m.totalCostEur < 0)) {
    errors.push({ field: 'totalCostEur', message: 'Cost must be 0 or more.' });
  }

  if (!Array.isArray(m.ingredients) || m.ingredients.length === 0) {
    errors.push({ field: 'ingredients', message: 'At least one ingredient is required.' });
  } else {
    m.ingredients.forEach((ing, i) => {
      if (typeof ing?.name !== 'string' || ing.name.trim() === '') {
        errors.push({ field: `ingredients[${i}].name`, message: 'Ingredient name is required.' });
      }
      if (!isNum(ing?.quantity) || ing.quantity <= 0) {
        errors.push({ field: `ingredients[${i}].quantity`, message: 'Quantity must be greater than 0.' });
      }
      if (!isUnit(ing?.unit)) {
        errors.push({ field: `ingredients[${i}].unit`, message: 'Choose a unit from the list.' });
      }
    });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
