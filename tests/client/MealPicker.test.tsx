// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealPicker, type ConfirmResult } from '../../src/client/plan/MealPicker';
import { week, meal } from './fixtures';

vi.mock('../../src/client/api', () => ({ api: { listMeals: vi.fn() } }));
import { api } from '../../src/client/api';
const meals = vi.mocked(api, true);

const library = [
  meal({ id: 10, name: 'Pasta Bolognese' }),
  meal({ id: 20, name: 'Pancakes', isFavourite: true }),
  meal({ id: 30, name: 'Onion Soup' }),
];

type ConfirmFn = (mealId: number, servings: number, replace: boolean) => Promise<ConfirmResult>;
interface Opts { lastServings?: number; replacing?: string | null; onConfirm?: Mock<ConfirmFn>; day?: number }
function renderPicker({ lastServings = 4, replacing = null, onConfirm = vi.fn<ConfirmFn>().mockResolvedValue({ ok: true }), day = 4 }: Opts = {}) {
  // Pasta is planned on Wednesday (day 3) of the viewed week
  const days = week({}, { 3: { mealName: 'Pasta Bolognese', mealId: 10 } }).days;
  const onClose = vi.fn();
  render(<MealPicker day={day} days={days} lastServings={lastServings} replacing={replacing} onConfirm={onConfirm} onClose={onClose} />);
  return { onConfirm, onClose };
}

beforeEach(() => {
  vi.resetAllMocks();
  meals.listMeals.mockResolvedValue(library);
});

describe('MealPicker (T-11)', () => {
  it('typing in "Search meals" filters by name, case-insensitively (AC-25)', async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByText('Pancakes');
    await user.type(screen.getByLabelText('Search meals'), 'PAST');
    expect(screen.getByText('Pasta Bolognese')).toBeInTheDocument();
    expect(screen.queryByText('Pancakes')).not.toBeInTheDocument();
    expect(screen.queryByText('Onion Soup')).not.toBeInTheDocument();
  });

  it('"Favourites only" shows only favourites (AC-25)', async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByText('Pancakes');
    await user.click(screen.getByLabelText('Favourites only'));
    expect(screen.getByText('Pancakes')).toBeInTheDocument();
    expect(screen.queryByText('Pasta Bolognese')).not.toBeInTheDocument();
  });

  it('meals planned in the viewed week show "Planned this week" (AC-25)', async () => {
    renderPicker();
    const planned = await screen.findByTestId('picker-meal-Pasta Bolognese');
    expect(within(planned).getByText('Planned this week')).toBeInTheDocument();
    expect(within(screen.getByTestId('picker-meal-Pancakes')).queryByText('Planned this week')).not.toBeInTheDocument();
  });

  it('picking an already-planned meal shows "already planned on <weekday>" and does not call the API (AC-3)', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await user.click(await screen.findByRole('button', { name: 'Pasta Bolognese' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/already planned on Wednesday this week/i);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Servings')).not.toBeInTheDocument(); // stays on the list
  });

  it('the servings field is pre-filled with the last servings, initially 4 (AC-15)', async () => {
    const user = userEvent.setup();
    renderPicker({ lastServings: 6 });
    await user.click(await screen.findByRole('button', { name: 'Pancakes' }));
    expect(screen.getByLabelText('Servings')).toHaveValue(6);
  });

  it.each(['0', '21', '2.5', ''])('servings "%s" shows an error and does nothing (AC-5, AC-20)', async (bad) => {
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await user.click(await screen.findByRole('button', { name: 'Pancakes' }));
    const input = screen.getByLabelText('Servings');
    await user.clear(input);
    if (bad) await user.type(input, bad);
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Servings must be a whole number from 1 to 20');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a valid servings value plans the meal (AC-1)', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await user.click(await screen.findByRole('button', { name: 'Pancakes' }));
    const input = screen.getByLabelText('Servings');
    await user.clear(input);
    await user.type(input, '6');
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(onConfirm).toHaveBeenCalledWith(20, 6, false);
  });

  it('replacing shows a confirm step and only then calls the API with replace: true (AC-2)', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderPicker({ replacing: 'Onion Soup', day: 5 });
    await user.click(await screen.findByRole('button', { name: 'Pancakes' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Replace 'Onion Soup' with 'Pancakes'?")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    expect(onConfirm).toHaveBeenCalledWith(20, 4, true);
  });

  it('cancelling the replace confirmation leaves the day unchanged (AC-2)', async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderPicker({ replacing: 'Onion Soup', day: 5 });
    await user.click(await screen.findByRole('button', { name: 'Pancakes' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('the meal currently on the replaced day is not marked as planned elsewhere (AC-2)', async () => {
    renderPicker({ replacing: 'Pasta Bolognese', day: 3 });
    const row = await screen.findByTestId('picker-meal-Pasta Bolognese');
    expect(within(row).queryByText('Planned this week')).not.toBeInTheDocument();
  });

  it('shows a server refusal in the dialog and keeps it open', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn<ConfirmFn>().mockResolvedValue({ ok: false, message: 'This meal is already planned on another day of this week.' });
    const { onClose } = renderPicker({ onConfirm });
    await user.click(await screen.findByRole('button', { name: 'Pancakes' }));
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already planned/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is a dialog named "Choose a meal"', async () => {
    renderPicker();
    expect(await screen.findByRole('dialog', { name: 'Choose a meal' })).toBeInTheDocument();
  });
});
