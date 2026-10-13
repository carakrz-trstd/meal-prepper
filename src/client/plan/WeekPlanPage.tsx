import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addWeeks, formatDate, weekdayName } from '../../shared/week';
import type { PlannedDay } from '../../shared/plan-types';
import { MealPicker } from './MealPicker';
import { usePlan } from './usePlan';
import { useWeekParam } from './useWeekParam';

const SERVINGS_ERROR = 'Servings must be a whole number from 1 to 20.';
const money = (n: number) => String(Number(n.toFixed(2)));

function DayCard({
  day,
  onPlan,
  onReplace,
  onRemove,
  onServings,
}: {
  day: PlannedDay;
  onPlan: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onServings: (servings: number) => Promise<boolean>;
}) {
  const name = weekdayName(day.day);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const e = day.entry;

  async function save() {
    const n = value.trim() === '' ? NaN : Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      setError(SERVINGS_ERROR);
      return;
    }
    setError(null);
    if (await onServings(n)) setEditing(false);
  }

  return (
    <div role="group" aria-label={name} className="day-card">
      <h2>
        {name} <span className="date">{formatDate(day.date)}</span>
      </h2>
      {!e ? (
        <>
          <p className="empty">Nothing planned</p>
          <button type="button" onClick={onPlan}>{`Plan meal for ${name}`}</button>
        </>
      ) : (
        <>
          <p className="meal-name">{e.mealName}</p>
          <p className="meta">
            {e.servings} servings ·{' '}
            {e.caloriesPerServing === null ? 'calories: missing' : `${e.caloriesPerServing} kcal per serving`} ·{' '}
            {e.totalCostEur === null ? 'cost: missing' : `${money(e.totalCostEur)} EUR`} · {e.totalMinutes} min
          </p>
          {editing ? (
            <div className="servings-edit">
              <label>
                Servings
                <input type="number" min={1} max={20} step={1} value={value} onChange={(ev) => setValue(ev.target.value)} />
              </label>
              <button type="button" onClick={() => void save()}>Save servings</button>
              <button type="button" onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
              {error && <p role="alert" className="error">{error}</p>}
            </div>
          ) : (
            <div className="actions">
              <button type="button" onClick={onReplace}>Replace meal</button>
              <button type="button" onClick={() => { setValue(String(e.servings)); setEditing(true); }}>Change servings</button>
              <button type="button" onClick={onRemove}>Remove</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function WeekPlanPage() {
  const { week, current, setWeek } = useWeekParam();
  const plan = usePlan(week);
  const [picker, setPicker] = useState<{ day: number; replacing: string | null } | null>(null);
  const view = plan.view;

  return (
    <section>
      <h1>{`Week of ${formatDate(week)}`}</h1>
      <div className="week-nav">
        <button type="button" disabled={week <= current} onClick={() => setWeek(addWeeks(week, -1))}>Previous week</button>
        <button type="button" onClick={() => setWeek(addWeeks(week, 1))}>Next week</button>
        <Link to={`/shopping?week=${week}`}>Shopping list</Link>
      </div>

      {plan.error && <p role="alert" className="error">{plan.error.message}</p>}
      {plan.loading && !view && <p role="status">Loading…</p>}

      {view && (
        <div className="week-grid">
          {view.days.map((d) => (
            <DayCard
              key={d.day}
              day={d}
              onPlan={() => { plan.clearError(); setPicker({ day: d.day, replacing: null }); }}
              onReplace={() => { plan.clearError(); setPicker({ day: d.day, replacing: d.entry?.mealName ?? null }); }}
              onRemove={() => void plan.removeDay(d.day)}
              onServings={(s) => plan.changeServings(d.day, s)}
            />
          ))}
        </div>
      )}

      {picker && view && (
        <MealPicker
          day={picker.day}
          days={view.days}
          lastServings={view.lastServings}
          replacing={picker.replacing}
          onClose={() => setPicker(null)}
          onConfirm={async (mealId, servings, replace) => {
            const ok = await plan.planDay(picker.day, { mealId, servings, replace });
            if (ok) {
              setPicker(null);
              return { ok: true as const };
            }
            return { ok: false as const, message: 'This meal could not be planned. It may already be planned on another day of this week.' };
          }}
        />
      )}
    </section>
  );
}
