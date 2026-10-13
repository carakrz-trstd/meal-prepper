import type { Db } from '../../db/open';
import type { SuggestionPrefs } from '../../../shared/constraints/types';

/** The limits and ticked participants of the last suggestion request, pre-filled next time (AC-26). */
export class PrefsRepository {
  constructor(private readonly db: Db) {}

  get(): SuggestionPrefs {
    const row = this.db
      .prepare('SELECT calorie_limit AS calorieLimit, budget_limit AS budgetLimit, time_limit AS timeLimit, participant_ids AS ids FROM suggestion_prefs WHERE id = 1')
      .get() as { calorieLimit: number | null; budgetLimit: number | null; timeLimit: number | null; ids: string } | undefined;
    if (!row) return { calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [] };
    let participantIds: number[] = [];
    try {
      const parsed = JSON.parse(row.ids) as unknown;
      if (Array.isArray(parsed)) participantIds = parsed.filter((n): n is number => Number.isInteger(n));
    } catch {
      /* corrupt value: treat as empty */
    }
    return { calorieLimit: row.calorieLimit, budgetLimit: row.budgetLimit, timeLimit: row.timeLimit, participantIds };
  }

  save(prefs: SuggestionPrefs): void {
    this.db
      .prepare(
        `INSERT INTO suggestion_prefs (id, calorie_limit, budget_limit, time_limit, participant_ids) VALUES (1, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET calorie_limit = excluded.calorie_limit, budget_limit = excluded.budget_limit,
           time_limit = excluded.time_limit, participant_ids = excluded.participant_ids`,
      )
      .run(prefs.calorieLimit, prefs.budgetLimit, prefs.timeLimit, JSON.stringify(prefs.participantIds));
  }
}
