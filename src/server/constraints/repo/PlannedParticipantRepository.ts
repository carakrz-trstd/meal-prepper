import type { Db } from '../../db/open';

/** The participants ticked for a planned meal (AC-25, FR-19). Rows are removed by the foreign-key cascade. */
export class PlannedParticipantRepository {
  constructor(private readonly db: Db) {}

  idsOf(plannedMealId: number): number[] {
    return (
      this.db.prepare('SELECT participant_id AS id FROM planned_meal_participant WHERE planned_meal_id = ? ORDER BY participant_id').all(plannedMealId) as {
        id: number;
      }[]
    ).map((r) => r.id);
  }

  set(plannedMealId: number, participantIds: number[]): void {
    this.db.prepare('DELETE FROM planned_meal_participant WHERE planned_meal_id = ?').run(plannedMealId);
    const insert = this.db.prepare('INSERT INTO planned_meal_participant (planned_meal_id, participant_id) VALUES (?, ?)');
    for (const id of new Set(participantIds)) insert.run(plannedMealId, id);
  }

  allExist(participantIds: number[]): boolean {
    const exists = this.db.prepare('SELECT 1 AS x FROM participant WHERE id = ?');
    return participantIds.every((id) => exists.get(id) !== undefined);
  }
}
