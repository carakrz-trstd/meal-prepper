import type { Db } from '../../db/open';
import type { Participant, Restriction } from '../../../shared/constraints/types';

/** Saved participants (name only) and their dietary restrictions (AC-7). */
export class ParticipantRepository {
  constructor(private readonly db: Db) {}

  private restrictionsOf(id: number): Restriction[] {
    return (
      this.db.prepare('SELECT restriction FROM participant_restriction WHERE participant_id = ? ORDER BY restriction').all(id) as {
        restriction: Restriction;
      }[]
    ).map((r) => r.restriction);
  }

  private setRestrictions(id: number, restrictions: Restriction[]): void {
    this.db.prepare('DELETE FROM participant_restriction WHERE participant_id = ?').run(id);
    const insert = this.db.prepare('INSERT INTO participant_restriction (participant_id, restriction) VALUES (?, ?)');
    for (const r of new Set(restrictions)) insert.run(id, r);
  }

  list(): Participant[] {
    const rows = this.db.prepare('SELECT id, name FROM participant ORDER BY lower(name), id').all() as { id: number; name: string }[];
    return rows.map((r) => ({ ...r, restrictions: this.restrictionsOf(r.id) }));
  }

  get(id: number): Participant | null {
    const row = this.db.prepare('SELECT id, name FROM participant WHERE id = ?').get(id) as { id: number; name: string } | undefined;
    return row ? { ...row, restrictions: this.restrictionsOf(id) } : null;
  }

  getMany(ids: number[]): Participant[] {
    return [...new Set(ids)].map((id) => this.get(id)).filter((p): p is Participant => p !== null);
  }

  create(name: string, restrictions: Restriction[]): Participant {
    const id = this.db.transaction(() => {
      const newId = Number(this.db.prepare('INSERT INTO participant (name) VALUES (?)').run(name.trim()).lastInsertRowid);
      this.setRestrictions(newId, restrictions);
      return newId;
    })();
    return this.get(id)!;
  }

  update(id: number, name: string, restrictions: Restriction[]): Participant | null {
    if (!this.get(id)) return null;
    this.db.transaction(() => {
      this.db.prepare('UPDATE participant SET name = ? WHERE id = ?').run(name.trim(), id);
      this.setRestrictions(id, restrictions);
    })();
    return this.get(id);
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM participant WHERE id = ?').run(id).changes > 0;
  }
}
