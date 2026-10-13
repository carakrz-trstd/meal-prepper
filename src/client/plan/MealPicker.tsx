import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Meal } from '../../shared/types';
import type { PlannedDay } from '../../shared/plan-types';
import { weekdayName } from '../../shared/week';

export type ConfirmResult = { ok: true } | { ok: false; message: string };

interface Props {
  /** the day being planned (1-7) */
  day: number;
  /** the days of the viewed week, to mark meals that are already planned */
  days: PlannedDay[];
  lastServings: number;
  /** name of the meal being replaced, or null when planning an empty day */
  replacing: string | null;
  onConfirm: (mealId: number, servings: number, replace: boolean) => Promise<ConfirmResult>;
  onClose: () => void;
}

const SERVINGS_ERROR = 'Servings must be a whole number from 1 to 20.';

/** Dialog to choose a meal, enter its servings and (when replacing) confirm the replacement (AC-1..5, 15, 20, 25). */
export function MealPicker({ day, days, lastServings, replacing, onConfirm, onClose }: Props) {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [chosen, setChosen] = useState<Meal | null>(null);
  const [servings, setServings] = useState(String(lastServings));
  const [step, setStep] = useState<'list' | 'servings' | 'confirm'>('list');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listMeals().then(setMeals, (e: Error) => setLoadError(e.message));
  }, []);

  /** meal id -> day on which it is planned elsewhere in this week */
  const plannedElsewhere = useMemo(() => {
    const map = new Map<number, number>();
    for (const d of days) if (d.entry && d.day !== day) map.set(d.entry.mealId, d.day);
    return map;
  }, [days, day]);

  const visible = useMemo(
    () =>
      (meals ?? []).filter(
        (m) => m.name.toLowerCase().includes(search.trim().toLowerCase()) && (!favouritesOnly || m.isFavourite),
      ),
    [meals, search, favouritesOnly],
  );

  function pick(meal: Meal) {
    const other = plannedElsewhere.get(meal.id);
    if (other !== undefined) {
      setMessage(`'${meal.name}' is already planned on ${weekdayName(other)} this week.`);
      return;
    }
    setMessage(null);
    setChosen(meal);
    setStep('servings');
  }

  const parsed = servings.trim() === '' ? NaN : Number(servings);
  const servingsValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 20;

  async function submit(replace: boolean) {
    if (!chosen) return;
    setBusy(true);
    const result = await onConfirm(chosen.id, parsed, replace);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      setStep('list');
    }
  }

  function next() {
    if (!servingsValid) {
      setMessage(SERVINGS_ERROR);
      return;
    }
    setMessage(null);
    if (replacing) setStep('confirm');
    else void submit(false);
  }

  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-label="Choose a meal" className="dialog picker">
        <h2>{replacing ? `Replace ${replacing}` : `Plan a meal for ${weekdayName(day)}`}</h2>

        {step === 'list' && (
          <>
            <div className="picker-filters">
              <label>
                Search meals
                <input value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <label className="inline">
                <input type="checkbox" checked={favouritesOnly} onChange={(e) => setFavouritesOnly(e.target.checked)} />
                Favourites only
              </label>
            </div>
            {loadError && <p role="alert" className="error">{loadError}</p>}
            {message && <p role="alert" className="error">{message}</p>}
            {meals && visible.length === 0 && <p>No meals found.</p>}
            <ul className="picker-list">
              {visible.map((m) => (
                <li key={m.id} data-testid={`picker-meal-${m.name}`}>
                  <button type="button" onClick={() => pick(m)}>{m.name}</button>
                  {plannedElsewhere.has(m.id) && <span className="badge">Planned this week</span>}
                  {m.isFavourite && <span aria-hidden="true">★</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 'servings' && chosen && (
          <>
            <p>{chosen.name}</p>
            <label>
              Servings
              <input type="number" min={1} max={20} step={1} value={servings} onChange={(e) => setServings(e.target.value)} />
            </label>
            {message && <p role="alert" className="error">{message}</p>}
          </>
        )}

        {step === 'confirm' && chosen && (
          <p>{`Replace '${replacing}' with '${chosen.name}'?`}</p>
        )}

        <div className="actions">
          {step === 'servings' && (
            <button type="button" disabled={busy} onClick={next}>
              {replacing ? 'Continue' : 'Add to plan'}
            </button>
          )}
          {step === 'confirm' && (
            <button type="button" disabled={busy} onClick={() => void submit(true)}>Replace</button>
          )}
          {step === 'servings' && <button type="button" onClick={() => { setStep('list'); setMessage(null); }}>Back</button>}
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
