import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { MealForm, type SaveHandler } from './MealForm';
import { MealLibraryPage } from './MealLibraryPage';
import { ImportPage } from './ImportPage';
import type { Meal } from '../shared/types';

function AddMealPage() {
  const navigate = useNavigate();
  const save: SaveHandler = async (input, opts) => {
    const r = await api.createMeal(input, opts);
    if (r.kind === 'ok') navigate('/');
    return r.kind === 'ok' ? { kind: 'ok' } : r;
  };
  return (
    <section>
      <h1>Add meal</h1>
      <MealForm mode="create" onSave={save} onCancel={() => navigate('/')} />
    </section>
  );
}

function EditMealPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meal, setMeal] = useState<Meal | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getMeal(Number(id)).then(setMeal, (e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (meal === undefined) return <p role="status">Loading…</p>;
  if (meal === null) return <p role="alert" className="error">This meal does not exist (any more).</p>;

  const save: SaveHandler = async (input, opts) => {
    const r = await api.updateMeal(meal.id, input, opts);
    if (r.kind === 'ok') navigate('/');
    return r.kind === 'ok' ? { kind: 'ok' } : r;
  };
  return (
    <section>
      <h1>Edit meal</h1>
      <MealForm mode="edit" meal={meal} onSave={save} onCancel={() => navigate('/')} />
    </section>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <header className="app-header">
        <strong>Meal planner</strong>
        <nav aria-label="Main">
          <Link to="/">Meals</Link>
          <Link to="/meals/new">Add meal</Link>
          <Link to="/import">Import recipe</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<MealLibraryPage />} />
          <Route path="/meals/new" element={<AddMealPage />} />
          <Route path="/meals/:id/edit" element={<EditMealPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="*" element={<p>Page not found. <Link to="/">Back to the meals</Link></p>} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
