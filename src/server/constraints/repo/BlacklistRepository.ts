import type { Db } from '../../db/open';
import { normalizeTerm } from '../../../shared/constraints/blacklist';

export interface BlacklistItem {
  id: number;
  term: string;
}

/** Ingredient blacklist: terms stored trimmed and lower-cased; adding an existing term is a no-op (AC-6). */
export class BlacklistRepository {
  constructor(private readonly db: Db) {}

  list(): BlacklistItem[] {
    return this.db.prepare('SELECT id, term FROM blacklist_item ORDER BY term').all() as BlacklistItem[];
  }

  terms(): string[] {
    return this.list().map((i) => i.term);
  }

  add(term: string): BlacklistItem {
    const t = normalizeTerm(term);
    this.db.prepare('INSERT OR IGNORE INTO blacklist_item (term) VALUES (?)').run(t);
    return this.db.prepare('SELECT id, term FROM blacklist_item WHERE term = ?').get(t) as BlacklistItem;
  }

  remove(id: number): boolean {
    return this.db.prepare('DELETE FROM blacklist_item WHERE id = ?').run(id).changes > 0;
  }
}
