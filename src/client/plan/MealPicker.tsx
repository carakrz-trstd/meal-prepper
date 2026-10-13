import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { MealForm, type SaveHandler } from '../MealForm';
import { constraintsApi } from '../constraints/constraintsApi';
import { ParticipantTicks } from '../constraints/ParticipantTicks';
import { SuggestPanel, type PlanPick } from '../constraints/SuggestPanel';
import type { MealCheckResult, Participant } from '../../shared/constraints/types';
import type { Meal, MealDraft } from '../../shared/types';
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
  /** `participantIds` is only passed when `constraints` is on (Epic 3) */
  onConfirm: (mealId: number, servings: number, replace: boolean, participantIds?: number[]) => Promise<ConfirmResult>;
  onClose: () => void;
  /** Epic 3: participants, dietary/blacklist warning, "Suggest a meal" and online recipes. Needs `weekStart`. */
  constraints?: boolean;
  weekStart?: string;
  /** a meal that was already chosen (drag and drop): the dialog starts at the servings step */
  initialMeal?: { id: number; name: string };
}

type Step = 'list' | 'suggest' | 'review' | 'servings' | 'warning' | 'confirm';
type CheckState = MealCheckResult | { error: true };

const SERVINGS_ERROR = 'Servings must be a whole number from 1 to 20.';
const hasFindings = (c: MealCheckResult) => c.violations.length > 0 || c.blacklisted.length > 0 || c.unknownIngredients.length > 0;

/** Dialog to choose a meal, enter its servings and participants and (when replacing) confirm the replacement (AC-1..5, 8, 11, 13, 15, 18, 20, 21, 25). */
export function MealPicker({ day, days, lastServings, replacing, onConfirm, onClose, constraints = false, weekStart, initialMeal }: Props) {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [chosen, setChosen] = useState<{ id: number; name: string } | null>(initialMeal ?? null);
  const [servings, setServings] = useState(String(lastServings));
  const [step, setStep] = useState<Step>(initialMeal ? 'servings' : 'list');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [ticked, setTicked] = useState<number[]>([]);
  const [check, setCheck] = useState<CheckState | null>(null);
  const [draft, setDraft] = useState<MealDraft | null>(null);

  useEffect(() => {
    api.listMeals().then(setMeals, (e: Error) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    if (!constraints) return;
    constraintsApi.listParticipants().then(setParticipants, () => setParticipants([]));
  }, [constraints]);

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
    setChosen({ id: meal.id, name: meal.name });
    setStep('servings');
  }

  /** "Plan this meal" in the suggestion panel: continue with servings and participants of the suggestion. */
  async function planPick(p: PlanPick) {
    setTicked(p.participantIds);
    setServings(String(p.servings));
    setMessage(null);
    if (p.source === 'library') {
      setChosen({ id: p.mealId, name: p.name });
      setStep('servings');
      return;
    }
    try {
      const c = await constraintsApi.getCandidate(p.searchId, p.candidateId);
      setDraft(c.draft);
      setStep('review');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  /** The online recipe is saved to the library through the Epic 1 review step before it is planned (AC-18). */
  const saveOnline: SaveHandler = async (input, opts) => {
    const r = await api.createMeal(input, opts);
    if (r.kind === 'ok') {
      setChosen({ id: r.meal.id, name: r.meal.name });
      setDraft(null);
      setStep('servings');
      return { kind: 'ok' };
    }
    return r;
  };

  const parsed = servings.trim() === '' ? NaN : Number(servings);
  const servingsValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 20;

  async function submit(replace: boolean) {
    if (!chosen) return;
    setBusy(true);
    const result = constraints ? await onConfirm(chosen.id, parsed, replace, ticked) : await onConfirm(chosen.id, parsed, replace);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      setStep('list');
    }
  }

  function proceed() {
    if (replacing) setStep('confirm');
    else void submit(false);
  }

  async function next() {
    if (!servingsValid) {
      setMessage(SERVINGS_ERROR);
      return;
    }
    setMessage(null);
    if (!constraints || !chosen) return proceed();
    setBusy(true);
    let result: CheckState;
    try {
      result = await constraintsApi.checkMeal(chosen.id, ticked);
    } catch {
      result = { error: true };
    }
    setBusy(false);
    if ('error' in result || hasFindings(result)) {
      setCheck(result);
      setStep('warning');
    } else proceed();
  }

  function changeTicks(ids: number[]) {
    setTicked(ids);
    if (ids.length > 0) setServings(String(ids.length));
  }

  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-label="Choose a meal" className="dialog picker">
        <h2>{replacing ? `Replace ${replacing}` : `Plan a meal for ${weekdayName(day)}`}</h2>

        {step === 'list' && (
          <>
            {constraints && (
              <p>
                <button type="button" onClick={() => { setMessage(null); setStep('suggest'); }}>Suggest a meal</button>
              </p>
            )}
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

        {step === 'suggest' && constraints && weekStart && (
          <>
            {message && <p role="alert" className="error">{message}</p>}
            <SuggestPanel weekStart={weekStart} participants={participants} lastServings={lastServings} onPlan={(p) => void planPick(p)} />
            <p><button type="button" onClick={() => { setMessage(null); setStep('list'); }}>Back to the list</button></p>
          </>
        )}

        {step === 'review' && draft && (
          <>
            <h3>Review the online recipe</h3>
            <p className="meta">The recipe is saved to your meal library first, then it is planned.</p>
            <MealForm mode="review" draft={draft} onSave={saveOnline} />
            <p><button type="button" onClick={() => { setDraft(null); setStep('suggest'); }}>Cancel review</button></p>
          </>
        )}

        {step === 'servings' && chosen && (
          <>
            <p>{chosen.name}</p>
            {constraints && <ParticipantTicks participants={participants} ticked={ticked} onChange={changeTicks} />}
            <label>
              Servings
              <input type="number" min={1} max={20} step={1} value={servings} onChange={(e) => setServings(e.target.value)} />
            </label>
            {message && <p role="alert" className="error">{message}</p>}
          </>
        )}

        {step === 'warning' && chosen && check && (
          <div data-testid="dietary-warning" className="warning">
            <p><strong>Check before planning “{chosen.name}”</strong></p>
            {'error' in check ? (
              <p>The restrictions and the blacklist could not be checked.</p>
            ) : (
              <ul>
                {check.violations.map((v) => (
                  <li key={`${v.participant}-${v.restriction}-${v.ingredient}`}>{`${v.participant} (${v.restriction}): ${v.ingredient}`}</li>
                ))}
                {check.blacklisted.length > 0 && <li>{`Blacklisted ingredient: ${check.blacklisted.join(', ')}`}</li>}
                {check.unknownIngredients.length > 0 && <li>{`Could not verify against the restrictions: ${check.unknownIngredients.join(', ')}`}</li>}
              </ul>
            )}
            <div className="actions">
              <button type="button" onClick={proceed}>Confirm anyway</button>
              <button type="button" onClick={() => { setCheck(null); setStep('servings'); }}>Cancel</button>
            </div>
          </div>
        )}

        {step === 'confirm' && chosen && <p>{`Replace '${replacing}' with '${chosen.name}'?`}</p>}

        <div className="actions">
          {step === 'servings' && (
            <button type="button" disabled={busy} onClick={() => void next()}>
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
