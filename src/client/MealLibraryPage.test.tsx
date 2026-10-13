// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MealLibraryPage } from './MealLibraryPage';
import type { Meal } from '../shared/types';

vi.mock('./api', () => ({
  api: {
    listMeals: vi.fn(),
    setFavourite: vi.fn(),
    deleteMeal: vi.fn(),
  },
}));
import { api } from './api';
const mocked = vi.mocked(api, true);

const meal = (over: Partial<Meal> = {}): Meal => ({
  id: 1, name: 'Soup', baseServings: 4,
  ingredients: [{ id: 1, position: 0, name: 'Carrot', nameKey: 'carrot', quantity: 200, unit: 'g' }],
  prepMinutes: 10, cookMinutes: 30, totalMinutes: 40,
  caloriesPerServing: 250, caloriesEstimated: false, totalCostEur: 6.5, costEstimated: false,
  isFavourite: false, sourceUrl: null, createdAt: '', updatedAt: '', ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <MealLibraryPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.resetAllMocks();
});

describe('MealLibraryPage (T-14)', () => {
  it('shows calories per serving, cost in EUR, prep, cook and total minutes (AC-2, AC-16)', async () => {
    mocked.listMeals.mockResolvedValue([meal()]);
    renderPage();
    const row = await screen.findByTestId('meal-row-Soup');
    expect(row).toHaveTextContent('250 kcal per serving');
    expect(row).toHaveTextContent('6.50 EUR');
    expect(row).toHaveTextContent('Prep 10 min');
    expect(row).toHaveTextContent('Cook 30 min');
    expect(row).toHaveTextContent('Total 40 min');
  });

  it('renders null calories and cost as "missing", never 0 (AC-2)', async () => {
    mocked.listMeals.mockResolvedValue([meal({ caloriesPerServing: null, totalCostEur: null })]);
    renderPage();
    const row = await screen.findByTestId('meal-row-Soup');
    expect(row).toHaveTextContent('Calories: missing');
    expect(row).toHaveTextContent('Cost: missing');
    expect(row.textContent).not.toMatch(/Calories: 0|Cost: 0/);
  });

  it('shows an "estimated" badge only when flagged (AC-19)', async () => {
    mocked.listMeals.mockResolvedValue([
      meal({ id: 1, name: 'Flagged', caloriesEstimated: true }),
      meal({ id: 2, name: 'Plain' }),
    ]);
    renderPage();
    expect(within(await screen.findByTestId('meal-row-Flagged')).getAllByText('estimated')).toHaveLength(1);
    expect(within(screen.getByTestId('meal-row-Plain')).queryByText('estimated')).not.toBeInTheDocument();
  });

  it('shows the source link for imported meals only (AC-17)', async () => {
    mocked.listMeals.mockResolvedValue([
      meal({ id: 1, name: 'Imported', sourceUrl: 'https://example.org/r' }),
      meal({ id: 2, name: 'Manual' }),
    ]);
    renderPage();
    const link = within(await screen.findByTestId('meal-row-Imported')).getByRole('link', { name: /source/i });
    expect(link).toHaveAttribute('href', 'https://example.org/r');
    expect(within(screen.getByTestId('meal-row-Manual')).queryByRole('link', { name: /source/i })).not.toBeInTheDocument();
  });

  it('star click calls the favourite API and updates the button state (AC-3)', async () => {
    mocked.listMeals.mockResolvedValue([meal()]);
    mocked.setFavourite.mockResolvedValue(meal({ isFavourite: true }));
    const user = userEvent.setup();
    renderPage();
    const star = await screen.findByRole('button', { name: 'Mark Soup as favourite' });
    expect(star).toHaveAttribute('aria-pressed', 'false');
    await user.click(star);
    expect(mocked.setFavourite).toHaveBeenCalledWith(1, true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark Soup as favourite' })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('"Favourites only" asks the API for favourites and a unmarked meal disappears from that view (AC-3)', async () => {
    mocked.listMeals.mockImplementation(async (opts) =>
      opts?.favouritesOnly ? [meal({ isFavourite: true })] : [meal({ isFavourite: true }), meal({ id: 2, name: 'Plain' })],
    );
    mocked.setFavourite.mockResolvedValue(meal({ isFavourite: false }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('meal-row-Plain');
    await user.click(screen.getByRole('checkbox', { name: 'Favourites only' }));
    await waitFor(() => expect(screen.queryByTestId('meal-row-Plain')).not.toBeInTheDocument());
    expect(mocked.listMeals).toHaveBeenLastCalledWith({ favouritesOnly: true });
    await user.click(screen.getByRole('button', { name: 'Mark Soup as favourite' }));
    await waitFor(() => expect(screen.queryByTestId('meal-row-Soup')).not.toBeInTheDocument());
  });

  it('delete shows a confirm dialog; cancel makes no API call; confirm deletes and removes the row (AC-15)', async () => {
    mocked.listMeals.mockResolvedValue([meal()]);
    mocked.deleteMeal.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete Soup' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(mocked.deleteMeal).not.toHaveBeenCalled();
    expect(screen.getByTestId('meal-row-Soup')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Soup' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete meal' }));
    expect(mocked.deleteMeal).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByTestId('meal-row-Soup')).not.toBeInTheDocument());
  });

  it('shows an empty state when there are no meals', async () => {
    mocked.listMeals.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no meals yet/i)).toBeInTheDocument();
  });
});
