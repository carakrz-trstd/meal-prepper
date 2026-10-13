import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { ConfirmDialog } from './ConfirmDialog';
import { planApi } from './plan/planApi';
import type { Meal } from '../shared/types';

function Calories({ meal }: { meal: Meal }) {
  if (meal.caloriesPerServing === null) return <span>Calories: missing</span>;
  return (
    <span>
      Calories: {meal.caloriesPerServing} kcal per serving
      {meal.caloriesEstimated && <span className="badge"> estimated</span>}
    </span>
  );
}

function Cost({ meal }: { meal: Meal }) {
  if (meal.totalCostEur === null) return <span>Cost: missing</span>;
  return (
    <span>
      Cost: {meal.totalCostEur.toFixed(2)} EUR
      {meal.costEstimated && <span className="badge"> estimated</span>}
    </span>
  );
}

export function MealLibraryPage() {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<{ meal: Meal; note: string } | null>(null);

  const load = useCallback(async (onlyFavourites: boolean) => {
    try {
      setMeals(await api.listMeals(onlyFavourites ? { favouritesOnly: true } : undefined));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load(favouritesOnly);
  }, [favouritesOnly, load]);

  async function toggleFavourite(meal: Meal) {
    try {
      const updated = await api.setFavourite(meal.id, !meal.isFavourite);
      setMeals((prev) =>
        (prev ?? [])
          .map((m) => (m.id === updated.id ? updated : m))
          .filter((m) => !favouritesOnly || m.isFavourite),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Opens the delete confirmation; it mentions the plan when the meal is planned somewhere (AC-18). */
  async function askDelete(meal: Meal) {
    let note = '';
    try {
      const { plannedCount } = await planApi.usage(meal.id);
      if (plannedCount > 0) {
        note = ` This meal is planned in ${plannedCount} ${plannedCount === 1 ? 'place' : 'places'} and will be removed from the plan if you delete it.`;
      }
    } catch {
      note = ' Whether this meal is in a plan could not be checked.';
    }
    setToDelete({ meal, note });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const id = toDelete.meal.id;
    setToDelete(null);
    try {
      await api.deleteMeal(id);
      setMeals((prev) => (prev ?? []).filter((m) => m.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section>
      <h1>Meals</h1>
      <label className="inline">
        <input type="checkbox" checked={favouritesOnly} onChange={(e) => setFavouritesOnly(e.target.checked)} />
        Favourites only
      </label>
      {error && <p role="alert" className="error">{error}</p>}
      {meals && meals.length === 0 && (
        <p>{favouritesOnly ? 'No favourites yet.' : 'No meals yet. Add a meal or import a recipe.'}</p>
      )}
      <ul className="meal-list">
        {meals?.map((meal) => (
          <li key={meal.id} data-testid={`meal-row-${meal.name}`} className="meal-row">
            <div className="meal-main">
              <h2>{meal.name}</h2>
              <p className="meta">
                <Calories meal={meal} /> · <Cost meal={meal} />
              </p>
              <p className="meta">
                Prep {meal.prepMinutes} min · Cook {meal.cookMinutes} min · Total {meal.totalMinutes} min · {meal.baseServings} servings
              </p>
              {meal.sourceUrl && (
                <p className="meta">
                  <a href={meal.sourceUrl} target="_blank" rel="noreferrer">Source</a>
                </p>
              )}
            </div>
            <div className="meal-actions">
              <button
                type="button"
                aria-label={`Mark ${meal.name} as favourite`}
                aria-pressed={meal.isFavourite}
                onClick={() => void toggleFavourite(meal)}
              >
                {meal.isFavourite ? '★' : '☆'}
              </button>
              <Link to={`/meals/${meal.id}/edit`} aria-label={`Edit ${meal.name}`}>Edit</Link>
              <button type="button" aria-label={`Delete ${meal.name}`} onClick={() => void askDelete(meal)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {toDelete && (
        <ConfirmDialog
          title="Delete meal?"
          message={`"${toDelete.meal.name}" and its ingredients will be removed. This cannot be undone.${toDelete.note}`}
          confirmLabel="Delete meal"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}
    </section>
  );
}
