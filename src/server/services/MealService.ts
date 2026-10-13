import type { MealRepository } from '../db/MealRepository';
import type { FieldError, Meal, MealInput } from '../../shared/types';
import { validateMealInput } from '../../shared/validation';

export type SaveResult =
  | { kind: 'ok'; meal: Meal }
  | { kind: 'invalid'; errors: FieldError[] }
  | { kind: 'duplicate' }
  | { kind: 'not_found' };

export interface SaveOptions {
  allowDuplicateName?: boolean;
}

/** Validation, duplicate-name warning and estimate-marker rules (AC-11, AC-19, AC-20). */
export class MealService {
  constructor(private readonly repo: MealRepository) {}

  list(opts: { favouritesOnly?: boolean } = {}): Meal[] {
    return this.repo.list(opts);
  }

  get(id: number): Meal | null {
    return this.repo.get(id);
  }

  create(input: MealInput, opts: SaveOptions = {}): SaveResult {
    const v = validateMealInput(input);
    if (!v.ok) return { kind: 'invalid', errors: v.errors };
    if (!opts.allowDuplicateName && this.repo.existsByName(input.name)) return { kind: 'duplicate' };
    const meal = this.repo.create({
      ...input,
      // An "estimated" marker only makes sense for a present value (AC-19).
      caloriesEstimated: input.caloriesEstimated === true && input.caloriesPerServing != null,
      costEstimated: input.costEstimated === true && input.totalCostEur != null,
    });
    return { kind: 'ok', meal };
  }

  update(id: number, input: MealInput, opts: SaveOptions = {}): SaveResult {
    const existing = this.repo.get(id);
    if (!existing) return { kind: 'not_found' };
    const v = validateMealInput(input);
    if (!v.ok) return { kind: 'invalid', errors: v.errors };
    if (!opts.allowDuplicateName && this.repo.existsByName(input.name, id)) return { kind: 'duplicate' };

    // The marker stays only while the value is unchanged (AC-19).
    const caloriesSame = (input.caloriesPerServing ?? null) === existing.caloriesPerServing;
    const costSame = (input.totalCostEur ?? null) === existing.totalCostEur;
    const meal = this.repo.update(id, {
      ...input,
      caloriesEstimated:
        input.caloriesPerServing != null && input.caloriesEstimated === true && caloriesSame,
      costEstimated: input.totalCostEur != null && input.costEstimated === true && costSame,
    })!;
    return { kind: 'ok', meal };
  }

  delete(id: number): boolean {
    return this.repo.delete(id);
  }

  setFavourite(id: number, value: boolean): Meal | null {
    return this.repo.setFavourite(id, value);
  }

  existsByName(name: string, excludeId?: number): boolean {
    return this.repo.existsByName(name, excludeId);
  }
}
