import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api';
import { MealForm, type SaveHandler } from './MealForm';
import type { EstimateField, ImportStage, MealDraft } from '../shared/types';

const STAGE_TEXT: Record<ImportStage, string> = {
  fetching: 'Loading the page…',
  parsing: 'Reading the recipe…',
  estimating_calories: 'Looking up calories…',
  estimating_cost: 'Looking up prices…',
};

type View =
  | { kind: 'idle' }
  | { kind: 'running'; stage: ImportStage }
  | { kind: 'failed'; message: string }
  | { kind: 'review'; draft: MealDraft; skipped: EstimateField[] };

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ImportPage({ pollMs = 700 }: { pollMs?: number }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [inputError, setInputError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  async function start(e: FormEvent) {
    e.preventDefault();
    if (!isHttpUrl(url)) {
      setInputError('Enter a valid web address starting with http:// or https://.');
      return;
    }
    setInputError(null);
    setView({ kind: 'running', stage: 'fetching' });
    try {
      const started = await api.startImport(url.trim());
      if (started.kind === 'invalid') {
        setView({ kind: 'idle' });
        setInputError(started.message);
        return;
      }
      for (;;) {
        const status = await api.getImport(started.jobId);
        if (cancelled.current) return;
        if (status.status === 'running') {
          setView({ kind: 'running', stage: status.stage });
          await new Promise((r) => setTimeout(r, pollMs));
          continue;
        }
        if (status.status === 'done') setView({ kind: 'review', draft: status.draft, skipped: status.skippedEstimates });
        else setView({ kind: 'failed', message: status.error.message });
        return;
      }
    } catch (err) {
      setView({ kind: 'failed', message: (err as Error).message });
    }
  }

  const save: SaveHandler = async (input, opts) => {
    const result = await api.createMeal(input, opts);
    if (result.kind === 'ok') navigate('/');
    return result.kind === 'ok' ? { kind: 'ok' } : result;
  };

  return (
    <section>
      <h1>Import recipe</h1>
      <form onSubmit={(e) => void start(e)} noValidate className="import-form">
        <label htmlFor="recipe-url">Recipe URL</label>
        <input id="recipe-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        <button type="submit" disabled={view.kind === 'running'}>Import</button>
      </form>
      {inputError && <p role="alert" className="error">{inputError}</p>}

      {view.kind === 'running' && <p role="status">{STAGE_TEXT[view.stage]}</p>}

      {view.kind === 'failed' && (
        <div role="alert" className="error">
          <p>The recipe could not be imported. {view.message}</p>
          <p>
            Try another address above, or <Link to="/meals/new">Add meal manually</Link>.
          </p>
        </div>
      )}

      {view.kind === 'review' && (
        <>
          <h2>Review the imported recipe</h2>
          <p>Nothing is saved until you press “Save meal”. Please check the values and fill in what is missing.</p>
          {view.skipped.length > 0 && (
            <p role="status" className="warning">
              Some estimates were skipped because the import took too long. Please fill in the missing values.
            </p>
          )}
          <MealForm mode="review" draft={view.draft} onSave={save} />
        </>
      )}
    </section>
  );
}
