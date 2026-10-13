// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealPicker, type ConfirmResult } from '../../../src/client/plan/MealPicker';
import { week, meal } from '../../client/fixtures';
import { anna, ben, emptyPrefs, libMatch, result } from './fixtures';

vi.mock('../../../src/client/api', () => ({ api: { listMeals: vi.fn(), createMeal: vi.fn() } }));
vi.mock('../../../src/client/constraints/constraintsApi', () => ({
  constraintsApi: { listParticipants: vi.fn(), checkMeal: vi.fn(), getPrefs: vi.fn(), suggest: vi.fn(), startOnline: vi.fn(), openOnlineEvents: vi.fn(), getCandidate: vi.fn() },
}));
import { api } from '../../../src/client/api';
import { constraintsApi } from '../../../src/client/constraints/constraintsApi';
const meals = vi.mocked(api, true);
const cons = vi.mocked(constraintsApi, true);

type ConfirmFn = (mealId: number, servings: number, replace: boolean, participantIds?: number[]) => Promise<ConfirmResult>;

function renderPicker(over: { replacing?: string | null; lastServings?: number } = {}) {
  const onConfirm = vi.fn<ConfirmFn>().mockResolvedValue({ ok: true });
  const onClose = vi.fn();
  render(
    <MealPicker
      day={4}
      days={week().days}
      lastServings={over.lastServings ?? 4}
      replacing={over.replacing ?? null}
      constraints
      weekStart="2026-10-12"
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );
  return { onConfirm, onClose };
}

async function toServings(user: ReturnType<typeof userEvent.setup>, name = 'Chicken curry') {
  await user.click(await screen.findByRole('button', { name }));
}

beforeEach(() => {
  vi.resetAllMocks();
  meals.listMeals.mockResolvedValue([meal({ id: 10, name: 'Chicken curry' }), meal({ id: 20, name: 'Plain rice' })]);
  cons.listParticipants.mockResolvedValue([anna, ben]);
  cons.getPrefs.mockResolvedValue(emptyPrefs);
});

describe('planning with participants (T-14, AC-8, AC-11, AC-13, AC-15)', () => {
  it('shows the participants next to the servings; ticking sets the servings to the number ticked and they stay editable (AC-15)', async () => {
    const user = userEvent.setup();
    renderPicker({ lastServings: 6 });
    await toServings(user);
    const servings = screen.getByLabelText('Servings');
    expect(servings).toHaveValue(6);
    await user.click(screen.getByLabelText('Anna'));
    await user.click(screen.getByLabelText('Ben'));
    expect(servings).toHaveValue(2);
    await user.clear(servings);
    await user.type(servings, '3');
    expect(servings).toHaveValue(3);
  });

  it('without findings the meal is planned at once, with the ticked participants (AC-8)', async () => {
    cons.checkMeal.mockResolvedValue({ violations: [], unknownIngredients: [], blacklisted: [] });
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await toServings(user);
    await user.click(screen.getByLabelText('Anna'));
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(cons.checkMeal).toHaveBeenCalledWith(10, [1]);
    expect(onConfirm).toHaveBeenCalledWith(10, 1, false, [1]);
  });

  it('a violation shows a warning naming participant, restriction and ingredient, with "Confirm anyway" (AC-11)', async () => {
    cons.checkMeal.mockResolvedValue({
      violations: [{ participant: 'Anna', restriction: 'vegetarian', ingredient: 'Chicken' }],
      unknownIngredients: [], blacklisted: [],
    });
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await toServings(user);
    await user.click(screen.getByLabelText('Anna'));
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    const warning = await screen.findByTestId('dietary-warning');
    expect(warning).toHaveTextContent('Anna');
    expect(warning).toHaveTextContent('vegetarian');
    expect(warning).toHaveTextContent('Chicken');
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm anyway' }));
    expect(onConfirm).toHaveBeenCalledWith(10, 1, false, [1]);
  });

  it('cancelling the warning plans nothing (AC-11)', async () => {
    cons.checkMeal.mockResolvedValue({ violations: [{ participant: 'Anna', restriction: 'vegetarian', ingredient: 'Chicken' }], unknownIngredients: [], blacklisted: [] });
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await toServings(user);
    await user.click(screen.getByLabelText('Anna'));
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    await user.click(within(await screen.findByTestId('dietary-warning')).getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dietary-warning')).not.toBeInTheDocument();
  });

  it('a blacklisted ingredient shows a warning naming the term; the user may confirm (AC-13)', async () => {
    cons.checkMeal.mockResolvedValue({ violations: [], unknownIngredients: [], blacklisted: ['nuts'] });
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await toServings(user);
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    const warning = await screen.findByTestId('dietary-warning');
    expect(warning).toHaveTextContent(/blacklist/i);
    expect(warning).toHaveTextContent('nuts');
    await user.click(screen.getByRole('button', { name: 'Confirm anyway' }));
    expect(onConfirm).toHaveBeenCalledWith(10, 4, false, []);
  });

  it('unknown ingredients are mentioned as "could not verify" but are not a violation (AC-9)', async () => {
    cons.checkMeal.mockResolvedValue({ violations: [], unknownIngredients: ['Dragon fruit'], blacklisted: [] });
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await toServings(user);
    await user.click(screen.getByLabelText('Anna'));
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(await screen.findByTestId('dietary-warning')).toHaveTextContent(/could not verify.*Dragon fruit/i);
    await user.click(screen.getByRole('button', { name: 'Confirm anyway' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('after the warning, replacing still asks for the replace confirmation (AC-2)', async () => {
    cons.checkMeal.mockResolvedValue({ violations: [], unknownIngredients: [], blacklisted: ['nuts'] });
    const user = userEvent.setup();
    const { onConfirm } = renderPicker({ replacing: 'Old meal' });
    await toServings(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm anyway' }));
    expect(screen.getByText("Replace 'Old meal' with 'Chicken curry'?")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    expect(onConfirm).toHaveBeenCalledWith(10, 4, true, []);
  });

  it('if the check cannot be done the user may still plan the meal, with a note', async () => {
    cons.checkMeal.mockRejectedValue(new Error('Could not reach the server.'));
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await toServings(user);
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(await screen.findByTestId('dietary-warning')).toHaveTextContent(/could not be checked/i);
    await user.click(screen.getByRole('button', { name: 'Confirm anyway' }));
    expect(onConfirm).toHaveBeenCalledWith(10, 4, false, []);
  });

  it('"Suggest a meal" opens the suggestion panel; "Plan this meal" continues with that meal, servings and participants (AC-15, AC-21)', async () => {
    cons.suggest.mockResolvedValue(result([libMatch(20, 'Plain rice')]));
    cons.checkMeal.mockResolvedValue({ violations: [], unknownIngredients: [], blacklisted: [] });
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await user.click(await screen.findByRole('button', { name: 'Suggest a meal' }));
    await user.click(await screen.findByLabelText('Anna'));
    await user.click(screen.getByRole('button', { name: 'Show suggestion' }));
    await user.click(await screen.findByRole('button', { name: 'Plan this meal' }));
    expect(screen.getByLabelText('Servings')).toHaveValue(1);
    expect(screen.getByLabelText('Anna')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(onConfirm).toHaveBeenCalledWith(20, 1, false, [1]);
  });
});

