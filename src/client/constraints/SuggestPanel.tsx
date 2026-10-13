import { useEffect, useRef, useState } from 'react';
import type { Participant, SuggestionMatch } from '../../shared/constraints/types';
import { constraintsApi, type SuggestBody } from './constraintsApi';
import { ParticipantTicks } from './ParticipantTicks';

export type PlanPick =
  | { source: 'library'; mealId: number; name: string; servings: number; participantIds: number[] }
  | { source: 'online'; searchId: string; candidateId: string; name: string; servings: number; participantIds: number[] };

interface Props {
  weekStart: string;
  /** all saved participants, to tick who is eating */
  participants: Participant[];
  /** used as the servings when nobody is ticked */
  lastServings: number;
  onPlan: (pick: PlanPick) => void;
}

const FAILED = 'The online search failed or found nothing.';
const money = (n: number) => String(Number(n.toFixed(2)));
const toLimit = (s: string): number | null | 'invalid' => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 'invalid';
};

/**
 * "Suggest a meal": limits, participants and servings in, one suggestion at a time out (AC-1..5, 9, 14, 15, 22, 24, 26).
 * The online search only starts when the user asks for it (AC-16).
 */
export function SuggestPanel({ weekStart, participants, lastServings, onPlan }: Props) {
  const [calories, setCalories] = useState('');
  const [budget, setBudget] = useState('');
  const [time, setTime] = useState('');
  const [ticked, setTicked] = useState<number[]>([]);
  const [servings, setServings] = useState(String(lastServings));

  const [library, setLibrary] = useState<SuggestionMatch[] | null>(null);
  const [online, setOnline] = useState<SuggestionMatch[]>([]);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [onlineMessage, setOnlineMessage] = useState<string | null>(null);
  const [onlineStarted, setOnlineStarted] = useState(false);
  const closeEvents = useRef<(() => void) | null>(null);
  // set as soon as the user changes anything: late-arriving saved preferences must not overwrite their input
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    constraintsApi.getPrefs().then(
      (p) => {
        if (!alive || touched.current) return;
        setCalories(p.calorieLimit === null ? '' : String(p.calorieLimit));
        setBudget(p.budgetLimit === null ? '' : String(p.budgetLimit));
        setTime(p.timeLimit === null ? '' : String(p.timeLimit));
        const known = p.participantIds.filter((id) => participants.some((x) => x.id === id));
        setTicked(known);
        if (known.length > 0) setServings(String(known.length));
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
    // the saved preferences are loaded once when the panel opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => closeEvents.current?.(), []);

  function tick(ids: number[]) {
    touched.current = true;
    setTicked(ids);
    setServings(String(ids.length > 0 ? ids.length : lastServings));
  }

  function buildBody(): SuggestBody | null {
    const c = toLimit(calories);
    const b = toLimit(budget);
    const t = toLimit(time);
    if (c === 'invalid' || b === 'invalid' || t === 'invalid') {
      setError('Each limit must be a number greater than 0 (or empty).');
      return null;
    }
    const n = servings.trim() === '' ? NaN : Number(servings);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      setError('Servings must be a whole number from 1 to 20.');
      return null;
    }
    setError(null);
    return { weekStart, calorieLimit: c, budgetLimit: b, timeLimit: t, participantIds: ticked, servings: n };
  }

  async function show() {
    const body = buildBody();
    if (!body) return;
    closeEvents.current?.();
    closeEvents.current = null;
    setOnline([]);
    setOnlineMessage(null);
    setOnlineStarted(false);
    setSearching(false);
    setIndex(0);
    try {
      const r = await constraintsApi.suggest(body);
      setLibrary(r.matches);
      setMessage(r.matches.length === 0 ? (r.message ?? 'No meal matches.') : null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function searchOnline() {
    const body = buildBody();
    if (!body) return;
    setOnlineMessage(null);
    setOnlineStarted(true);
    setSearching(true);
    try {
      const { searchId: id } = await constraintsApi.startOnline(body);
      setSearchId(id);
      closeEvents.current = constraintsApi.openOnlineEvents(id, {
        onCandidate: (m) => setOnline((prev) => [...prev, m]),
        onDone: (found) => {
          setSearching(false);
          closeEvents.current?.();
          closeEvents.current = null;
          if (found === 0) setOnlineMessage(FAILED);
        },
        onFailed: (msg) => {
          setSearching(false);
          closeEvents.current?.();
          closeEvents.current = null;
          setOnlineMessage(msg);
        },
      });
    } catch (e) {
      setSearching(false);
      setOnlineStarted(false);
      setError((e as Error).message);
    }
  }

  function clear() {
    touched.current = true;
    closeEvents.current?.();
    closeEvents.current = null;
    setCalories('');
    setBudget('');
    setTime('');
    setTicked([]);
    setServings(String(lastServings));
    setLibrary(null);
    setOnline([]);
    setMessage(null);
    setError(null);
    setOnlineMessage(null);
    setOnlineStarted(false);
    setSearching(false);
    setIndex(0);
  }

  const all = [...(library ?? []), ...online];
  const current = all[index];
  const atEnd = index >= all.length - 1;
  const servingsNumber = Number(servings);

  function plan() {
    if (!current) return;
    const common = { name: current.meal.name, servings: servingsNumber, participantIds: ticked };
    if (current.source === 'online' && searchId && current.candidateId) {
      onPlan({ source: 'online', searchId, candidateId: current.candidateId, ...common });
    } else if (current.mealId !== undefined) {
      onPlan({ source: 'library', mealId: current.mealId, ...common });
    }
  }

  return (
    <div className="suggest-panel">
      <div className="suggest-form">
        <label>
          Calorie limit
          <input type="number" min={1} step="any" value={calories} onChange={(e) => { touched.current = true; setCalories(e.target.value); }} />
        </label>
        <label>
          Budget limit (EUR)
          <input type="number" min={0} step="any" value={budget} onChange={(e) => { touched.current = true; setBudget(e.target.value); }} />
        </label>
        <label>
          Cooking time limit (min)
          <input type="number" min={1} step={1} value={time} onChange={(e) => { touched.current = true; setTime(e.target.value); }} />
        </label>
        <ParticipantTicks participants={participants} ticked={ticked} onChange={tick} />
        <label>
          Servings
          <input type="number" min={1} max={20} step={1} value={servings} onChange={(e) => { touched.current = true; setServings(e.target.value); }} />
        </label>
        <div className="actions">
          <button type="button" onClick={() => void show()}>Show suggestion</button>
          <button type="button" onClick={clear}>Clear</button>
        </div>
      </div>

      {error && <p role="alert" className="error">{error}</p>}
      {message && <p className="no-match">{message}</p>}

      {current && (
        <div data-testid="suggestion-card" className="suggestion-card">
          <h3>{current.meal.name}</h3>
          {current.favourite && <p className="meta">★ Favourite</p>}
          <p className="meta">
            {current.meal.caloriesPerServing === null ? 'calories: missing' : `${current.meal.caloriesPerServing} kcal per serving`} ·{' '}
            {current.meal.totalCostEur === null ? 'cost: missing' : `${money((current.meal.totalCostEur * servingsNumber) / current.meal.baseServings)} EUR for ${servingsNumber} servings`} ·{' '}
            {current.meal.totalMinutes === null ? 'time: missing' : `${current.meal.totalMinutes} min`}
          </p>
          {current.source === 'online' && (
            <p className="meta">
              From the web: <a href={current.sourceUrl ?? '#'} target="_blank" rel="noreferrer">{current.sourceUrl}</a>
            </p>
          )}
          {current.unknownIngredients.length > 0 && (
            <p className="warning">Could not verify against the restrictions: {current.unknownIngredients.join(', ')}</p>
          )}
          {current.usedEstimate.calories && <p className="meta">Calories were checked using an estimate.</p>}
          {current.usedEstimate.cost && <p className="meta">Cost was checked using an estimate.</p>}
          <div className="actions">
            <button type="button" onClick={plan}>Plan this meal</button>
            <button type="button" disabled={atEnd} onClick={() => setIndex((i) => Math.min(i + 1, all.length - 1))}>Another suggestion</button>
          </div>
          {atEnd && !onlineStarted && <p className="meta">No more library matches.</p>}
          {atEnd && onlineStarted && !searching && <p className="meta">No more suggestions.</p>}
        </div>
      )}

      {library !== null && (
        <div className="online">
          {!onlineStarted && <button type="button" onClick={() => void searchOnline()}>Search online</button>}
          {searching && <p role="status">Searching online…</p>}
          {!searching && onlineMessage && <p role="status">{onlineMessage}</p>}
        </div>
      )}
    </div>
  );
}
