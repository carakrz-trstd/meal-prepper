import type { Db } from '../db/open';
import { PlanRepository } from '../plan/plan.repository';

export interface PlannedMealRef {
  plannedMealId: number;
  mealId: number;
  mealName: string;
  day: number;
  servings: number;
}

/** What Epic 3 needs to know about the weekly plan (AD-10); implemented on top of Epic 2's plan repository. */
export interface PlannedMealsPort {
  plannedMealIdsForWeek(weekStart: string): number[];
  plannedMealsOfWeek(weekStart: string): PlannedMealRef[];
}

export class SqlPlannedMealsPort implements PlannedMealsPort {
  private readonly plan: PlanRepository;

  constructor(db: Db) {
    this.plan = new PlanRepository(db);
  }

  plannedMealsOfWeek(weekStart: string): PlannedMealRef[] {
    return this.plan.listWeek(weekStart).map((r) => ({
      plannedMealId: r.id,
      mealId: r.mealId,
      mealName: r.mealName,
      day: r.day,
      servings: r.servings,
    }));
  }

  plannedMealIdsForWeek(weekStart: string): number[] {
    return this.plannedMealsOfWeek(weekStart).map((p) => p.mealId);
  }
}
