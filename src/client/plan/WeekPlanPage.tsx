import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { addWeeks, formatDate, weekdayName } from '../../shared/week';
import type { PlannedDay, PlannedEntry } from '../../shared/plan-types';
import type { PlanWarning } from '../../shared/constraints/types';
import type { Meal } from '../../shared/types';
import { api } from '../api';
import { constraintsApi } from '../constraints/constraintsApi';
import { useToast } from '../toast';
import { MealPicker } from './MealPicker';
import { usePlan } from './usePlan';
import { useWeekParam } from './useWeekParam';

const SERVINGS_ERROR = 'Servings must be a whole number from 1 to 20.';
const money = (n: number) => String(Number(n.toFixed(2)));

/** what is being dragged: a meal from the pantry or the meal planned on a day */
type Drag = { kind: 'meal'; mealId: number; name: string } | { kind: 'day'; day: number };

/** "Anna (vegetarian): Chicken; blacklisted: walnut" (AC-25) */
function describeWarning(w: PlanWarning): string {
  const parts = w.violations.map((v) => `${v.participant} (${v.restriction}): ${v.ingredient}`);
  if (w.blacklisted.length > 0) parts.push(`blacklisted: ${w.blacklisted.join(', ')}`);
  return parts.join('; ');
}

function DayCard({
  day,
  warning,
  drag,
  canDrop,
  onPlan,
  onReplace,
  onRemove,
  onServings,
  onMove,
  onDragStartMeal,
  onDragEnd,
  onDrop,
}: {
  day: PlannedDay;
  warning?: PlanWarning;
  drag: Drag | null;
  canDrop: () => boolean;
  onPlan: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onServings: (servings: number) => Promise<boolean>;
  onMove: (toDay: number) => void;
  onDragStartMeal: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const name = weekdayName(day.day);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
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

  function allow(ev: DragEvent) {
    if (!canDrop()) return;
    ev.preventDefault();
    setOver(true);
  }

  const classes = [
    'day-card',
    drag ? 'drop-ready' : '',
    over && drag ? 'drop-over' : '',
    drag?.kind === 'day' && drag.day === day.day ? 'dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      role="group"
      aria-label={name}
      className={classes}
      onDragEnter={allow}
      onDragOver={allow}
      onDragLeave={(ev) => {
        if (ev.relatedTarget instanceof Node && ev.currentTarget.contains(ev.relatedTarget)) return;
        setOver(false);
      }}
      onDrop={(ev) => {
        if (!canDrop()) return;
        ev.preventDefault();
        setOver(false);
        onDrop();
      }}
    >
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
          <p
            className="meal-name"
            data-testid="drag-handle"
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.effectAllowed = 'move';
              ev.dataTransfer.setData('text/plain', e.mealName);
              onDragStartMeal();
            }}
            onDragEnd={onDragEnd}
          >
            {e.mealName}
          </p>
          <p className="meta">
            {e.servings} servings ·{' '}
            {e.caloriesPerServing === null ? 'calories: missing' : `${e.caloriesPerServing} kcal per serving`} ·{' '}
            {e.totalCostEur === null ? 'cost: missing' : `${money(e.totalCostEur)} EUR`} · {e.totalMinutes} min
          </p>
          {warning && <p className="warning" data-testid="plan-warning">{`Warning: ${describeWarning(warning)}`}</p>}
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
              <label className="move">
                Move to day
                <select value="" onChange={(ev) => ev.target.value && onMove(Number(ev.target.value))}>
                  <option value="">Choose a day…</option>
                  {[1, 2, 3, 4, 5, 6, 7].filter((d) => d !== day.day).map((d) => (
                    <option key={d} value={d}>{weekdayName(d)}</option>
                  ))}
                </select>
              </label>
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
  const toast = useToast();
  const [picker, setPicker] = useState<{ day: number; replacing: string | null; initialMeal?: { id: number; name: string } } | null>(null);
  const [warnings, setWarnings] = useState<PlanWarning[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [filter, setFilter] = useState('');
  const [drag, setDrag] = useState<Drag | null>(null);
  // The ref is what the drop handlers trust; the state only paints the drop targets.
  const dragRef = useRef<Drag | null>(null);
  const view = plan.view;
  const pickerOpen = picker !== null;

  // Warnings are computed against the current restrictions and blacklist; they never remove a meal (AC-25).
  useEffect(() => {
    if (!view) return;
    let alive = true;
    constraintsApi.planWarnings(week).then(
      (w) => alive && setWarnings(w),
      () => alive && setWarnings([]),
    );
    return () => {
      alive = false;
    };
  }, [view, week]);

  // The pantry lists the library; it is reloaded when the dialog closes because it may have saved an online recipe.
  useEffect(() => {
    if (pickerOpen) return;
    let alive = true;
    Promise.resolve()
      .then(() => api.listMeals())
      .then(
        (m) => alive && setMeals(Array.isArray(m) ? m : []),
        () => undefined,
      );
    return () => {
      alive = false;
    };
  }, [pickerOpen]);

  const pantry = useMemo(
    () => meals.filter((m) => m.name.toLowerCase().includes(filter.trim().toLowerCase())),
    [meals, filter],
  );

  const entryOf = (day: number): PlannedEntry | null => view?.days.find((d) => d.day === day)?.entry ?? null;

  const nameOfMeal = useCallback(
    async (mealId: number): Promise<string> => {
      const known = meals.find((m) => m.id === mealId);
      if (known) return known.name;
      try {
        return (await api.listMeals()).find((m) => m.id === mealId)?.name ?? 'The meal';
      } catch {
        return 'The meal';
      }
    },
    [meals],
  );

  /** restores a meal exactly as it was (servings and participants) */
  const restore = (day: number, e: PlannedEntry, replace: boolean) =>
    plan.planDay(day, { mealId: e.mealId, servings: e.servings, replace, participantIds: e.participantIds });

  async function dropMeal(target: number, meal: { mealId: number; name: string }) {
    if (!view) return;
    const dayName = weekdayName(target);
    const planned = view.days.find((d) => d.entry?.mealId === meal.mealId);
    if (planned) {
      toast.show({ message: `'${meal.name}' is already planned on ${weekdayName(planned.day)} this week.` });
      return;
    }
    const occupied = entryOf(target);
    const openDialog = () => {
      plan.clearError();
      setPicker({ day: target, replacing: occupied?.mealName ?? null, initialMeal: { id: meal.mealId, name: meal.name } });
    };
    // Replacing a meal always goes through the dialog's confirmation; nothing is replaced silently.
    if (occupied) return openDialog();
    try {
      const check = await constraintsApi.checkMeal(meal.mealId, []);
      if (check.violations.length > 0 || check.blacklisted.length > 0 || check.unknownIngredients.length > 0) return openDialog();
    } catch {
      return openDialog();
    }
    const ok = await plan.planDay(target, { mealId: meal.mealId, servings: view.lastServings, replace: false, participantIds: [] });
    if (ok) {
      toast.show({
        message: `${meal.name} planned for ${dayName}`,
        actionLabel: 'Undo',
        onAction: () => void plan.removeDay(target),
      });
    }
  }

  async function moveMeal(from: number, to: number) {
    if (from === to) return;
    const moving = entryOf(from);
    const other = entryOf(to);
    if (!moving) return;
    const ok = await plan.moveDay(from, to);
    if (!ok) return;
    toast.show({
      message: other
        ? `${moving.mealName} and ${other.mealName} swapped`
        : `${moving.mealName} moved to ${weekdayName(to)}`,
      actionLabel: 'Undo',
      onAction: () => void plan.moveDay(to, from),
    });
  }

  /**
   * Chromium cancels a drag when the page changes the dragged element's surroundings inside the dragstart handler,
   * so the drop targets of a planned meal are painted one tick later.
   */
  function startDrag(d: Drag, deferPaint: boolean) {
    dragRef.current = d;
    if (!deferPaint) return setDrag(d);
    setTimeout(() => { if (dragRef.current === d) setDrag(d); }, 0);
  }
  function endDrag() {
    dragRef.current = null;
    setDrag(null);
  }

  function handleDrop(target: number) {
    const dragged = dragRef.current;
    endDrag();
    if (!dragged) return;
    if (dragged.kind === 'day') void moveMeal(dragged.day, target);
    else void dropMeal(target, dragged);
  }

  function removeMeal(day: number) {
    const e = entryOf(day);
    if (!e) return;
    void plan.removeDay(day).then((ok) => {
      if (ok) {
        toast.show({
          message: `${e.mealName} removed from ${weekdayName(day)}`,
          actionLabel: 'Undo',
          onAction: () => void restore(day, e, false),
        });
      }
    });
  }

  async function changeServings(day: number, servings: number): Promise<boolean> {
    const e = entryOf(day);
    const ok = await plan.changeServings(day, servings);
    if (ok && e) {
      toast.show({
        message: `Servings of ${e.mealName} changed to ${servings}`,
        actionLabel: 'Undo',
        onAction: () => void plan.changeServings(day, e.servings),
      });
    }
    return ok;
  }

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
        <>
          <aside className="pantry no-print" aria-label="Pantry">
            <h2>Pantry</h2>
            <p className="meta">
              Drag a meal onto a day, or drag a planned meal to another day. Without a mouse use “Plan meal” and “Move to day”.
            </p>
            <label>
              Filter pantry
              <input value={filter} onChange={(ev) => setFilter(ev.target.value)} />
            </label>
            <ul className="pantry-list">
              {pantry.map((m) => (
                <li
                  key={m.id}
                  className="chip"
                  data-testid={`pantry-${m.name}`}
                  draggable
                  onDragStart={(ev) => {
                    ev.dataTransfer.effectAllowed = 'copyMove';
                    ev.dataTransfer.setData('text/plain', m.name);
                    startDrag({ kind: 'meal', mealId: m.id, name: m.name }, false);
                  }}
                  onDragEnd={endDrag}
                >
                  {m.isFavourite && <span aria-hidden="true">★ </span>}
                  {m.name}
                </li>
              ))}
            </ul>
          </aside>

          <div className="week-grid">
            {view.days.map((d) => (
              <DayCard
                key={d.day}
                day={d}
                drag={drag}
                canDrop={() => dragRef.current !== null}
                warning={warnings.find((w) => w.day === d.day)}
                onPlan={() => { plan.clearError(); setPicker({ day: d.day, replacing: null }); }}
                onReplace={() => { plan.clearError(); setPicker({ day: d.day, replacing: d.entry?.mealName ?? null }); }}
                onRemove={() => removeMeal(d.day)}
                onServings={(s) => changeServings(d.day, s)}
                onMove={(to) => void moveMeal(d.day, to)}
                onDragStartMeal={() => startDrag({ kind: 'day', day: d.day }, true)}
                onDragEnd={endDrag}
                onDrop={() => handleDrop(d.day)}
              />
            ))}
          </div>
        </>
      )}

      {picker && view && (
        <MealPicker
          day={picker.day}
          days={view.days}
          lastServings={view.lastServings}
          replacing={picker.replacing}
          initialMeal={picker.initialMeal}
          constraints
          weekStart={week}
          onClose={() => setPicker(null)}
          onConfirm={async (mealId, servings, replace, participantIds) => {
            const previous = entryOf(picker.day);
            const ok = await plan.planDay(picker.day, { mealId, servings, replace, participantIds });
            if (ok) {
              const day = picker.day;
              setPicker(null);
              const name = await nameOfMeal(mealId);
              toast.show(
                previous
                  ? {
                      message: `${name} planned for ${weekdayName(day)} (replaced ${previous.mealName})`,
                      actionLabel: 'Undo',
                      onAction: () => void restore(day, previous, true),
                    }
                  : {
                      message: `${name} planned for ${weekdayName(day)}`,
                      actionLabel: 'Undo',
                      onAction: () => void plan.removeDay(day),
                    },
              );
              return { ok: true as const };
            }
            return { ok: false as const, message: 'This meal could not be planned. It may already be planned on another day of this week.' };
          }}
        />
      )}
    </section>
  );
}
