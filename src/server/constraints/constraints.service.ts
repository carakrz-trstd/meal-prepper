import type { Db } from '../db/open';
import { MealRepository } from '../db/MealRepository';
import { matchedTerms } from '../../shared/constraints/blacklist';
import { checkMeal } from '../../shared/constraints/dietary';
import { suggestFromLibrary } from '../../shared/constraints/suggest';
import type { Limits, MealCheckResult, Participant, PlanWarning, SuggestionPrefs, SuggestionResult } from '../../shared/constraints/types';
import { BlacklistRepository } from './repo/BlacklistRepository';
import { KeywordRepository } from './repo/KeywordRepository';
import { ParticipantRepository } from './repo/ParticipantRepository';
import { PlannedParticipantRepository } from './repo/PlannedParticipantRepository';
import { PrefsRepository } from './repo/PrefsRepository';
import { SqlPlannedMealsPort, type PlannedMealsPort } from './PlannedMealsPort';

export interface SuggestInput extends Limits {
  weekStart: string;
  participantIds: number[];
  servings: number;
}

/** Suggestions, meal checks and plan warnings on top of the Epic 3 repositories (AD-10). */
export class ConstraintsService {
  readonly participants: ParticipantRepository;
  readonly blacklist: BlacklistRepository;
  readonly keywords: KeywordRepository;
  readonly prefs: PrefsRepository;
  readonly planned: PlannedParticipantRepository;
  private readonly meals: MealRepository;

  constructor(
    db: Db,
    private readonly port: PlannedMealsPort = new SqlPlannedMealsPort(db),
  ) {
    this.participants = new ParticipantRepository(db);
    this.blacklist = new BlacklistRepository(db);
    this.keywords = new KeywordRepository(db);
    this.prefs = new PrefsRepository(db);
    this.planned = new PlannedParticipantRepository(db);
    this.meals = new MealRepository(db);
  }

  /** Everything the pure suggestion logic needs besides the candidate meals. */
  context(participantIds: number[]) {
    return {
      blacklist: this.blacklist.terms(),
      keywords: this.keywords.list(),
      participants: this.participants.getMany(participantIds),
    };
  }

  /** The saved prefs, without participants that have been deleted since. */
  getPrefs(): SuggestionPrefs {
    const prefs = this.prefs.get();
    const existing = new Set(this.participants.getMany(prefs.participantIds).map((p) => p.id));
    return { ...prefs, participantIds: prefs.participantIds.filter((id) => existing.has(id)) };
  }

  suggest(input: SuggestInput): SuggestionResult {
    const limits: Limits = { calorieLimit: input.calorieLimit ?? null, budgetLimit: input.budgetLimit ?? null, timeLimit: input.timeLimit ?? null };
    this.prefs.save({ calorieLimit: limits.calorieLimit ?? null, budgetLimit: limits.budgetLimit ?? null, timeLimit: limits.timeLimit ?? null, participantIds: input.participantIds });
    return suggestFromLibrary({
      meals: this.meals.list(),
      ...this.context(input.participantIds),
      plannedMealIds: this.port.plannedMealIdsForWeek(input.weekStart),
      limits,
      servings: input.servings,
    });
  }

  /** Dietary and blacklist check of one library meal for the given participants; null if the meal does not exist. */
  checkLibraryMeal(mealId: number, participantIds: number[]): MealCheckResult | null {
    const meal = this.meals.get(mealId);
    if (!meal) return null;
    const ctx = this.context(participantIds);
    return { ...checkMeal(meal, ctx.participants, ctx.keywords), blacklisted: matchedTerms(meal.ingredients, ctx.blacklist) };
  }

  /** Current violations of the planned meals of a week, using the participants stored with each (AC-25). */
  planWarnings(weekStart: string): PlanWarning[] {
    const keywords = this.keywords.list();
    const terms = this.blacklist.terms();
    const out: PlanWarning[] = [];
    for (const p of this.port.plannedMealsOfWeek(weekStart)) {
      const meal = this.meals.get(p.mealId);
      if (!meal) continue;
      const participants: Participant[] = this.participants.getMany(this.planned.idsOf(p.plannedMealId));
      const dietary = checkMeal(meal, participants, keywords);
      const blacklisted = matchedTerms(meal.ingredients, terms);
      if (dietary.violations.length > 0 || blacklisted.length > 0) {
        out.push({ day: p.day, plannedMealId: p.plannedMealId, mealId: p.mealId, mealName: p.mealName, ...dietary, blacklisted });
      }
    }
    return out.sort((a, b) => a.day - b.day);
  }
}
