import type { AggregatedEntry } from '../../shared/aggregate';
import type { UnitFamily } from '../../shared/unit-conversion';
import type { PlanRepository } from './plan.repository';
import { PlanError } from './plan.errors';

const EPS = 1e-9;

function splitId(id: string): { family: UnitFamily; key: string } | null {
  const i = id.indexOf(':');
  if (i < 1) return null;
  return { family: id.slice(0, i) as UnitFamily, key: id.slice(i + 1) };
}

/**
 * Brings stored ticks in line with the current need and returns the ids that count as ticked (AC-19):
 * rows of entries that are no longer needed are deleted; a snapshot above the need is lowered to the need
 * (so 5 -> 3 -> 4 clears the tick); an entry is ticked iff snapshot >= need.
 */
export function reconcileTicks(repo: PlanRepository, weekStart: string, entries: AggregatedEntry[]): Set<string> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const ticked = new Set<string>();
  repo.db.transaction(() => {
    for (const row of repo.listTicks(weekStart)) {
      const entry = byId.get(`${row.family}:${row.key}`);
      if (!entry) {
        repo.deleteTick(weekStart, row.key, row.family);
        continue;
      }
      let qty = row.tickedQty;
      if (qty > entry.needBase + EPS) {
        qty = entry.needBase;
        repo.upsertTick(weekStart, row.key, row.family, qty);
      }
      if (qty >= entry.needBase - EPS) ticked.add(entry.id);
    }
  })();
  return ticked;
}

/** Ticking stores the current need as the snapshot; unticking deletes the row (AC-16). */
export function setTick(repo: PlanRepository, weekStart: string, entries: AggregatedEntry[], entryId: string, ticked: boolean): void {
  const entry = entries.find((e) => e.id === entryId);
  const parts = splitId(entryId);
  if (!entry || !parts) throw new PlanError('ENTRY_NOT_FOUND');
  if (ticked) repo.upsertTick(weekStart, parts.key, parts.family, entry.needBase);
  else repo.deleteTick(weekStart, parts.key, parts.family);
}
