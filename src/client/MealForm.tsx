import { useMemo, useState, type FormEvent } from 'react';
import { UNITS, isUnit, type Unit } from '../shared/units';
import { validateMealInput } from '../shared/validation';
import type { FieldError, Meal, MealDraft, MealInput } from '../shared/types';

export type SaveResult = { kind: 'ok' } | { kind: 'invalid'; fields: FieldError[] } | { kind: 'duplicate' };
export type SaveHandler = (input: MealInput, opts: { allowDuplicateName?: boolean }) => Promise<SaveResult>;

type Props =
  | { mode: 'create'; onSave: SaveHandler; onCancel?: () => void }
  | { mode: 'edit'; meal: Meal; onSave: SaveHandler; onCancel?: () => void }
  | { mode: 'review'; draft: MealDraft; onSave: SaveHandler; onCancel?: () => void };

interface Row {
  key: number;
  name: string;
  quantity: string;
  unit: Unit | '';
}

interface FormState {
  name: string;
  baseServings: string;
  prep: string;
  cook: string;
  calories: string;
  cost: string;
  caloriesEstimated: boolean;
  costEstimated: boolean;
  rows: Row[];
  sourceUrl: string | null;
}

const DEFAULT_SERVINGS = '4';
let rowKey = 0;
const newRow = (name = '', quantity = '', unit: Unit | '' = 'g'): Row => ({ key: ++rowKey, name, quantity, unit });
const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

function initialState(props: Props): FormState {
  if (props.mode === 'edit') {
    const m = props.meal;
    return {
      name: m.name,
      baseServings: String(m.baseServings),
      prep: m.prepMinutes ? String(m.prepMinutes) : '',
      cook: String(m.cookMinutes),
      calories: str(m.caloriesPerServing),
      cost: str(m.totalCostEur),
      caloriesEstimated: m.caloriesEstimated,
      costEstimated: m.costEstimated,
      rows: m.ingredients.map((i) => newRow(i.name, String(i.quantity), i.unit)),
      sourceUrl: m.sourceUrl,
    };
  }
  if (props.mode === 'review') {
    const d = props.draft;
    return {
      name: d.name,
      baseServings: String(d.baseServings),
      prep: str(d.prepMinutes),
      cook: str(d.cookMinutes),
      calories: str(d.caloriesPerServing),
      cost: str(d.totalCostEur),
      caloriesEstimated: false,
      costEstimated: false,
      rows: d.ingredients.map((i) => newRow(i.name, str(i.quantity), i.unit ?? '')),
      sourceUrl: d.sourceUrl,
    };
  }
  return {
    name: '', baseServings: DEFAULT_SERVINGS, prep: '', cook: '', calories: '', cost: '',
    caloriesEstimated: false, costEstimated: false, rows: [newRow()], sourceUrl: null,
  };
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

/** Add, edit and import-review form for a meal (AC-1, AC-5, AC-10, AC-11, AC-12, AC-14, AC-16, AC-19, AC-20, AC-23). */
export function MealForm(props: Props) {
  const review = props.mode === 'review';
  const [s, setS] = useState<FormState>(() => initialState(props));
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsServingsConfirm, setNeedsServingsConfirm] = useState(
    review ? props.draft.baseServingsNeedsConfirmation : false,
  );
  const [caloriesProposal, setCaloriesProposal] = useState<number | null>(review ? (props.draft.caloriesEstimate?.value ?? null) : null);
  const [costProposal, setCostProposal] = useState<number | null>(review ? (props.draft.costEstimate?.value ?? null) : null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setS((prev) => ({ ...prev, [key]: value }));
  const errorsFor = (field: string) => errors.filter((e) => e.field === field);
  const rowErrors = (i: number) => errors.filter((e) => e.field.startsWith(`ingredients[${i}]`));

  const total = useMemo(() => {
    const cook = Number(s.cook);
    const prep = s.prep.trim() === '' ? 0 : Number(s.prep);
    return Number.isFinite(cook) && Number.isFinite(prep) && s.cook.trim() !== '' ? prep + cook : null;
  }, [s.prep, s.cook]);

  function updateRow(key: number, patch: Partial<Row>) {
    setS((prev) => ({ ...prev, rows: prev.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  }

  function buildInput(): MealInput {
    const calories = s.calories.trim() === '' ? null : Number(s.calories);
    const cost = s.cost.trim() === '' ? null : Number(s.cost);
    return {
      name: s.name,
      baseServings: num(s.baseServings),
      ingredients: s.rows.map((r) => ({ name: r.name, quantity: num(r.quantity), unit: (isUnit(r.unit) ? r.unit : '') as Unit })),
      prepMinutes: s.prep.trim() === '' ? null : Number(s.prep),
      cookMinutes: num(s.cook),
      caloriesPerServing: calories,
      totalCostEur: cost,
      caloriesEstimated: s.caloriesEstimated && calories !== null,
      costEstimated: s.costEstimated && cost !== null,
      sourceUrl: s.sourceUrl,
    };
  }

  async function submit(allowDuplicateName: boolean) {
    const input = buildInput();
    const v = validateMealInput(input);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const result = await props.onSave(input, allowDuplicateName ? { allowDuplicateName: true } : {});
      if (result.kind === 'invalid') setErrors(result.fields);
      if (result.kind === 'duplicate') setDuplicate(true);
    } catch (e) {
      setErrors([{ field: 'form', message: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(false);
  };

  const missing = (empty: boolean) => review && empty && <span className="missing">missing</span>;

  return (
    <form onSubmit={onSubmit} noValidate className="meal-form">
      {errorsFor('form').map((e) => <p key={e.message} role="alert" className="error">{e.message}</p>)}

      <div className="field">
        <label htmlFor="meal-name">Name</label>
        <input id="meal-name" value={s.name} onChange={(e) => { set('name', e.target.value); setDuplicate(false); }} />
        {errorsFor('name').map((e) => <span key={e.message} role="alert" className="error">{e.message}</span>)}
      </div>

      <div className="field">
        <label htmlFor="meal-servings">Base servings</label>
        <input
          id="meal-servings" type="number" min={1} step={1} value={s.baseServings}
          onChange={(e) => { set('baseServings', e.target.value); setNeedsServingsConfirm(false); }}
        />
        {needsServingsConfirm && (
          <span className="confirm">
            Please confirm the servings (the page gave no yield).{' '}
            <button type="button" onClick={() => setNeedsServingsConfirm(false)}>Confirm servings</button>
          </span>
        )}
        {errorsFor('baseServings').map((e) => <span key={e.message} role="alert" className="error">{e.message}</span>)}
      </div>

      <fieldset className="ingredients">
        <legend>Ingredients</legend>
        {errorsFor('ingredients').map((e) => <span key={e.message} role="alert" className="error">{e.message}</span>)}
        {s.rows.map((r, i) => (
          <div key={r.key} className="ingredient-row">
            <input aria-label="Ingredient name" value={r.name} onChange={(e) => updateRow(r.key, { name: e.target.value })} />
            <input
              aria-label="Quantity" type="number" min={0} step="any" value={r.quantity}
              onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
            />
            <select aria-label="Unit" value={r.unit} onChange={(e) => updateRow(r.key, { unit: e.target.value as Unit })}>
              {r.unit === '' && <option value="">Choose unit</option>}
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            {s.rows.length > 1 && (
              <button type="button" aria-label={`Remove ingredient ${i + 1}`} onClick={() => setS((p) => ({ ...p, rows: p.rows.filter((x) => x.key !== r.key) }))}>
                Remove
              </button>
            )}
            {rowErrors(i).map((e) => <span key={e.field} role="alert" className="error">{e.message}</span>)}
          </div>
        ))}
        <button type="button" onClick={() => setS((p) => ({ ...p, rows: [...p.rows, newRow()] }))}>Add ingredient</button>
      </fieldset>

      <div className="field">
        <label htmlFor="meal-prep">Preparation time (min)</label>
        <input id="meal-prep" type="number" min={0} step={1} value={s.prep} onChange={(e) => set('prep', e.target.value)} />
        {missing(s.prep.trim() === '')}
        {errorsFor('prepMinutes').map((e) => <span key={e.message} role="alert" className="error">{e.message}</span>)}
      </div>

      <div className="field">
        <label htmlFor="meal-cook">Cooking time (min)</label>
        <input id="meal-cook" type="number" min={1} step={1} value={s.cook} onChange={(e) => set('cook', e.target.value)} />
        {missing(s.cook.trim() === '')}
        {errorsFor('cookMinutes').map((e) => <span key={e.message} role="alert" className="error">{e.message}</span>)}
      </div>
      <p className="total">Total time: {total === null ? '–' : `${total} min`}</p>

      <div className="field">
        <label htmlFor="meal-calories">Calories per serving</label>
        <input
          id="meal-calories" type="number" min={0} step="any" value={s.calories}
          onChange={(e) => { setS((p) => ({ ...p, calories: e.target.value, caloriesEstimated: false })); setCaloriesProposal(null); }}
        />
        {s.caloriesEstimated && <span className="badge">estimated</span>}
        {missing(s.calories.trim() === '')}
        {caloriesProposal !== null && (
          <span className="proposal">
            Estimate: {caloriesProposal} kcal per serving{' '}
            <button
              type="button" aria-label="Accept calories estimate"
              onClick={() => { setS((p) => ({ ...p, calories: String(caloriesProposal), caloriesEstimated: true })); setCaloriesProposal(null); }}
            >
              Accept
            </button>
          </span>
        )}
        {errorsFor('caloriesPerServing').map((e) => <span key={e.message} role="alert" className="error">{e.message}</span>)}
      </div>

      <div className="field">
        <label htmlFor="meal-cost">Total cost (EUR)</label>
        <input
          id="meal-cost" type="number" min={0} step="any" value={s.cost}
          onChange={(e) => { setS((p) => ({ ...p, cost: e.target.value, costEstimated: false })); setCostProposal(null); }}
        />
        {s.costEstimated && <span className="badge">estimated</span>}
        {missing(s.cost.trim() === '')}
        {costProposal !== null && (
          <span className="proposal">
            Estimate: {costProposal.toFixed(2)} EUR{' '}
            <button
              type="button" aria-label="Accept cost estimate"
              onClick={() => { setS((p) => ({ ...p, cost: String(costProposal), costEstimated: true })); setCostProposal(null); }}
            >
              Accept
            </button>
          </span>
        )}
        {errorsFor('totalCostEur').map((e) => <span key={e.message} role="alert" className="error">{e.message}</span>)}
      </div>

      {duplicate && (
        <p className="warning" role="status">
          A meal with this name already exists.{' '}
          <button type="button" onClick={() => void submit(true)}>Save anyway</button>
        </p>
      )}

      <div className="actions">
        <button type="submit" disabled={busy}>Save meal</button>
        {props.onCancel && <button type="button" onClick={props.onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
