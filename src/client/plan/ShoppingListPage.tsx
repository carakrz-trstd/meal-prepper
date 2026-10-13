import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, weekdayName } from '../../shared/week';
import { formatQuantity } from '../../shared/unit-conversion';
import { ShoppingActions } from './ShoppingActions';
import { usePlan } from './usePlan';
import { useWeekParam } from './useWeekParam';

const shortDay = (day: number) => weekdayName(day).slice(0, 3);

export function ShoppingListPage() {
  const { week } = useWeekParam();
  const plan = usePlan(week);
  const view = plan.view;
  // Ticks flip at once and are then confirmed (or reverted) by the server's answer.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  async function toggle(id: string, ticked: boolean) {
    setPending((p) => ({ ...p, [id]: ticked }));
    await plan.setTick(id, ticked);
    setPending((p) => {
      const { [id]: _done, ...rest } = p;
      return rest;
    });
  }

  const total = view?.shopping.length ?? 0;
  const inBag = view?.shopping.filter((e) => pending[e.id] ?? e.ticked).length ?? 0;

  return (
    <section>
      <h1>Shopping list</h1>
      <p className="meta">{`Week of ${formatDate(week)}`} · <Link to={`/plan?week=${week}`} className="no-print">Back to the plan</Link></p>

      {plan.error && <p role="alert" className="error">{plan.error.message}</p>}
      {plan.loading && !view && <p role="status">Loading…</p>}

      {view && view.shopping.length === 0 && (
        <div className="empty-state">
          <p>No meals are planned for this week, so there is nothing to buy yet.</p>
          <Link to={`/plan?week=${week}`}>Go to the plan</Link>
        </div>
      )}

      {view && view.shopping.length > 0 && (
        <>
          <ShoppingActions entries={view.shopping} />
          <div className="bag" aria-live="off">
            <div
              className="progress"
              role="progressbar"
              aria-label="Items in the bag"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={inBag}
              style={{ '--pct': `${Math.round((inBag / total) * 100)}%` } as CSSProperties}
            >
              <span className="progress-fill" />
            </div>
            <p className="meta">{`${inBag} of ${total} items in the bag`}</p>
            {inBag === total && <p className="victory">All provisions gathered! The party feasts tonight.</p>}
          </div>
          <ul aria-label="Shopping list" className="shopping-list">
            {view.shopping.map((e) => (
              <li key={e.id}>
                <label className="shopping-row">
                  <input type="checkbox" checked={pending[e.id] ?? e.ticked} onChange={(ev) => void toggle(e.id, ev.target.checked)} />
                  <span className="name">{e.name}</span>
                  <span className="qty">{`${formatQuantity(e.quantity)} ${e.unit}`}</span>
                </label>
                <small className="sources">{e.sources.map((s) => `${shortDay(s.day)} ${s.mealName}`).join(', ')}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
