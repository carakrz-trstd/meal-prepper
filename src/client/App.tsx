import { useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { MealForm, type SaveHandler } from './MealForm';
import { MealLibraryPage } from './MealLibraryPage';
import { ImportPage } from './ImportPage';
import { WeekPlanPage } from './plan/WeekPlanPage';
import { ShoppingListPage } from './plan/ShoppingListPage';
import { ParticipantsPage } from './constraints/ParticipantsPage';
import { BlacklistPage } from './constraints/BlacklistPage';
import { ThemeToggle } from './ThemeToggle';
import { ToastProvider } from './toast';
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
    <ToastProvider>
    <BrowserRouter>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">⚔</span>
          <strong>Meal Prepper</strong>
          <small>Provisions for the party</small>
        </div>
        <nav aria-label="Main">
          <NavLink to="/" end>Meals</NavLink>
          <NavLink to="/meals/new">Add meal</NavLink>
          <NavLink to="/import">Import recipe</NavLink>
          <NavLink to="/plan">Plan</NavLink>
          <NavLink to="/shopping">Shopping list</NavLink>
          <NavLink to="/participants">Participants</NavLink>
          <NavLink to="/blacklist">Blacklist</NavLink>
        </nav>
        <ThemeToggle />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<MealLibraryPage />} />
          <Route path="/meals/new" element={<AddMealPage />} />
          <Route path="/meals/:id/edit" element={<EditMealPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/plan" element={<WeekPlanPage />} />
          <Route path="/shopping" element={<ShoppingListPage />} />
          <Route path="/participants" element={<ParticipantsPage />} />
          <Route path="/blacklist" element={<BlacklistPage />} />
          <Route path="*" element={<p>Page not found. <Link to="/">Back to the meals</Link></p>} />
        </Routes>
      </main>
    </BrowserRouter>
    </ToastProvider>
  );
}
