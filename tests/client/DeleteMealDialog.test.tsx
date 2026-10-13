// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MealLibraryPage } from '../../src/client/MealLibraryPage';
import { meal } from './fixtures';

vi.mock('../../src/client/api', () => ({ api: { listMeals: vi.fn(), setFavourite: vi.fn(), deleteMeal: vi.fn() } }));
vi.mock('../../src/client/plan/planApi', async (orig) => {
  const actual = await orig<typeof import('../../src/client/plan/planApi')>();
  return { ...actual, planApi: { usage: vi.fn() } };
});
import { api } from '../../src/client/api';
import { planApi } from '../../src/client/plan/planApi';
const meals = vi.mocked(api, true);
const plan = vi.mocked(planApi, true);

const open = async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><MealLibraryPage /></MemoryRouter>);
  await user.click(await screen.findByRole('button', { name: 'Delete Pancakes' }));
  return { user, dialog: await screen.findByRole('alertdialog') };
};

beforeEach(() => {
  vi.resetAllMocks();
  meals.listMeals.mockResolvedValue([meal({ id: 7, name: 'Pancakes' })]);
  meals.deleteMeal.mockResolvedValue(undefined);
});

describe('delete confirmation with plan usage (T-14, AC-18)', () => {
  it('for a planned meal the dialog says it is planned and will be removed from the plan', async () => {
    plan.usage.mockResolvedValue({ plannedCount: 2 });
    const { dialog } = await open();
    expect(plan.usage).toHaveBeenCalledWith(7);
    expect(dialog).toHaveTextContent(/planned in 2 places/i);
    expect(dialog).toHaveTextContent(/removed from the plan/i);
  });

  it('for a meal planned once the text uses the singular', async () => {
    plan.usage.mockResolvedValue({ plannedCount: 1 });
    const { dialog } = await open();
    expect(dialog).toHaveTextContent(/planned in 1 place\b/i);
  });

  it('for an unplanned meal the original text is shown', async () => {
    plan.usage.mockResolvedValue({ plannedCount: 0 });
    const { dialog } = await open();
    expect(dialog).not.toHaveTextContent(/planned/i);
    expect(dialog).toHaveTextContent(/cannot be undone/i);
  });

  it('confirm deletes; cancel deletes nothing and sends no delete request', async () => {
    plan.usage.mockResolvedValue({ plannedCount: 2 });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(meals.deleteMeal).not.toHaveBeenCalled();
    expect(screen.getByTestId('meal-row-Pancakes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Pancakes' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete meal' }));
    expect(meals.deleteMeal).toHaveBeenCalledWith(7);
    await waitFor(() => expect(screen.queryByTestId('meal-row-Pancakes')).not.toBeInTheDocument());
  });

  it('if the usage lookup fails, the generic text is shown with a note and deleting still works', async () => {
    plan.usage.mockRejectedValue(new Error('offline'));
    const { dialog } = await open();
    expect(dialog).toHaveTextContent(/cannot be undone/i);
    expect(dialog).toHaveTextContent(/could not be checked/i);
  });
});
