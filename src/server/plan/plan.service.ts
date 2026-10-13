import type { Db } from '../db/open';
import type { WeekView } from '../../shared/plan-types';
import { compareWeeks, isValidWeekStart, mondayOf } from '../../shared/week';
import type { Clock } from './clock';
import { PlanError } from './plan.errors';
import { PlanRepository } from './plan.repository';
import { setTick as storeTick } from './ticks.service';
import { aggregateWeek, buildWeekView } from './week-view';

export { PlanError };

export interface PlanInput {
  mealId: number;
  servings: number;
  replace?: boolean;
  /** Epic 3: the participants eating this meal; stored with the planned meal. Omit to leave the stored ones untouched. */
  participantIds?: number[];
}

/** Epic 3 hook (AD-10): where the participants of a planned meal are stored and validated. */
export interface ParticipantLinks {
  allExist(participantIds: number[]): boolean;
  set(plannedMealId: number, participantIds: number[]): void;
}

const validServings = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 20;

/** Plan rules: one meal per day, no repeat within a week, servings 1..20, current and future weeks only (AC-1..5, 11, 13, 15, 20). */
export class PlanService {
  private readonly repo: PlanRepository;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly links?: ParticipantLinks,
  ) {
    this.repo = new PlanRepository(db);
  }

  private checkWeek(weekStart: string): void {
    if (typeof weekStart !== 'string' || !isValidWeekStart(weekStart)) throw new PlanError('INVALID_WEEK');
    if (compareWeeks(weekStart, mondayOf(this.clock.today())) < 0) throw new PlanError('WEEK_IN_PAST');
  }

  private checkDay(day: number): void {
    if (!Number.isInteger(day) || day < 1 || day > 7) throw new PlanError('INVALID_DAY');
  }

  getWeek(weekStart: string): WeekView {
    this.checkWeek(weekStart);
    return buildWeekView(this.repo, weekStart);
  }

  /**
   * The single seam where "may this meal be planned on this day?" is decided. Epic 3 adds its dietary check
   * at the plan API level around this method; here: the meal exists and is not planned on another day (AC-3).
   */
  assertPlannable(weekStart: string, day: number, mealId: number): void {
    if (!this.repo.mealExists(mealId)) throw new PlanError('MEAL_NOT_FOUND');
    const other = this.repo.dayOfMeal(weekStart, mealId);
    if (other !== undefined && other !== day) throw new PlanError('MEAL_ALREADY_PLANNED', { day: other });
  }

  planDay(weekStart: string, day: number, input: PlanInput): WeekView {
    this.checkWeek(weekStart);
    this.checkDay(day);
    if (!validServings(input.servings)) throw new PlanError('INVALID_SERVINGS');
    const participantIds = input.participantIds;
    if (participantIds !== undefined && (!this.links || !participantIds.every(Number.isInteger) || !this.links.allExist(participantIds))) {
      throw new PlanError('INVALID_PARTICIPANT');
    }

    this.db.transaction(() => {
      const existing = this.repo.getDay(weekStart, day);
      if (existing && !input.replace) throw new PlanError('DAY_OCCUPIED');
      this.assertPlannable(weekStart, day, input.mealId);
      if (existing) this.repo.update(existing.id, input.mealId, input.servings);
      else this.repo.insert(weekStart, day, input.mealId, input.servings);
      this.repo.setSetting('last_servings', String(input.servings));
      if (participantIds !== undefined) this.links!.set(this.repo.getDay(weekStart, day)!.id, participantIds);
    })();
    return buildWeekView(this.repo, weekStart);
  }

  changeServings(weekStart: string, day: number, servings: number): WeekView {
    this.checkWeek(weekStart);
    this.checkDay(day);
    if (!validServings(servings)) throw new PlanError('INVALID_SERVINGS');
    const existing = this.repo.getDay(weekStart, day);
    if (!existing) throw new PlanError('DAY_EMPTY');
    this.db.transaction(() => {
      this.repo.updateServings(existing.id, servings);
      this.repo.setSetting('last_servings', String(servings));
    })();
    return buildWeekView(this.repo, weekStart);
  }

  removeDay(weekStart: string, day: number): WeekView {
    this.checkWeek(weekStart);
    this.checkDay(day);
    const existing = this.repo.getDay(weekStart, day);
    if (!existing) throw new PlanError('DAY_EMPTY');
    this.repo.delete(existing.id);
    return buildWeekView(this.repo, weekStart);
  }

  setTick(weekStart: string, entryId: string, ticked: boolean): WeekView {
    this.checkWeek(weekStart);
    // Reading the week first reconciles stale ticks, so a tick always refers to the current need.
    buildWeekView(this.repo, weekStart);
    storeTick(this.repo, weekStart, aggregateWeek(this.repo, weekStart), entryId, ticked);
    return buildWeekView(this.repo, weekStart);
  }

  /** How often a meal is planned, across all weeks (for the Epic 1 delete confirmation, AC-18). */
  usage(mealId: number): { plannedCount: number } {
    if (!this.repo.mealExists(mealId)) throw new PlanError('MEAL_NOT_FOUND');
    return { plannedCount: this.repo.usageCount(mealId) };
  }
}
