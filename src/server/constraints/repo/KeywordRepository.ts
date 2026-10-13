import type { Db } from '../../db/open';
import type { RestrictionKeyword } from '../../../shared/constraints/types';

/** The data-driven dietary mapping (NFR-3). Extend it by inserting rows; no code change needed. */
export class KeywordRepository {
  constructor(private readonly db: Db) {}

  list(): RestrictionKeyword[] {
    return this.db.prepare('SELECT restriction, keyword, effect FROM restriction_keyword ORDER BY id').all() as RestrictionKeyword[];
  }
}
