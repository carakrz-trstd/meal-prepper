// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealPicker, type ConfirmResult } from '../../../src/client/plan/MealPicker';
import type { OnlineHandlers } from '../../../src/client/constraints/constraintsApi';
import { week, meal } from '../../client/fixtures';
import { draft, emptyPrefs, onlineMatch, result } from './fixtures';

vi.mock('../../../src/client/api', () => ({ api: { listMeals: vi.fn(), createMeal: vi.fn() } }));
vi.mock('../../../src/client/constraints/constraintsApi', () => ({
  constraintsApi: { listParticipants: vi.fn(), checkMeal: vi.fn(), getPrefs: vi.fn(), suggest: vi.fn(), startOnline: vi.fn(), openOnlineEvents: vi.fn(), getCandidate: vi.fn() },
}));
import { api } from '../../../src/client/api';
import { constraintsApi } from '../../../src/client/constraints/constraintsApi';
const meals = vi.mocked(api, true);
const cons = vi.mocked(constraintsApi, true);

type ConfirmFn = (mealId: number, servings: number, replace: boolean, participantIds?: number[]) => Promise<ConfirmResult>;
let handlers: OnlineHandlers;

function renderPicker() {
  const onConfirm = vi.fn<ConfirmFn>().mockResolvedValue({ ok: true });
  render(<MealPicker day={4} days={week().days} lastServings={4} replacing={null} constraints weekStart="2026-10-12" onConfirm={onConfirm} onClose={vi.fn()} />);
  return { onConfirm };
}

/** open the suggestion panel, search online, wait for the candidate and click "Plan this meal" */
async function pickOnlineCandidate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Suggest a meal' }));
  await user.click(await screen.findByRole('button', { name: 'Show suggestion' }));
  await user.click(await screen.findByRole('button', { name: 'Search online' }));
  await waitFor(() => expect(cons.openOnlineEvents).toHaveBeenCalled());
  handlers.onCandidate(onlineMatch('c1', 'Web soup'));
  await user.click(await screen.findByRole('button', { name: 'Plan this meal' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  meals.listMeals.mockResolvedValue([]);
  cons.listParticipants.mockResolvedValue([]);
  cons.getPrefs.mockResolvedValue(emptyPrefs);
  cons.suggest.mockResolvedValue(result([]));
  cons.startOnline.mockResolvedValue({ searchId: 's1' });
  cons.openOnlineEvents.mockImplementation(((_id: string, h: OnlineHandlers) => { handlers = h; return vi.fn(); }) as never);
  cons.getCandidate.mockResolvedValue({ candidateId: 'c1', match: onlineMatch('c1', 'Web soup'), draft: draft('Web soup') });
});

describe('picking an online recipe (T-13, AC-18)', () => {
  it('opens the Epic 1 review form pre-filled with the draft; nothing is saved before the user saves', async () => {
    const user = userEvent.setup();
    renderPicker();
    await pickOnlineCandidate(user);
    expect(cons.getCandidate).toHaveBeenCalledWith('s1', 'c1');
    expect(await screen.findByRole('heading', { name: /review the online recipe/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Web soup');
    expect(screen.getByLabelText('Ingredient name')).toHaveValue('Carrot');
    expect(meals.createMeal).not.toHaveBeenCalled();
  });

  it('after saving, the meal exists in the library (with its source URL) and planning continues with it', async () => {
    meals.createMeal.mockResolvedValue({ kind: 'ok', meal: meal({ id: 99, name: 'Web soup', sourceUrl: 'https://r.example/c1' }) });
    cons.checkMeal.mockResolvedValue({ violations: [], unknownIngredients: [], blacklisted: [] });
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await pickOnlineCandidate(user);
    await user.click(await screen.findByRole('button', { name: 'Save meal' }));
    expect(meals.createMeal).toHaveBeenCalledTimes(1);
    expect(meals.createMeal.mock.calls[0][0]).toMatchObject({ name: 'Web soup', sourceUrl: 'https://r.example/c1' });
    expect(await screen.findByLabelText('Servings')).toHaveValue(4);
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(onConfirm).toHaveBeenCalledWith(99, 4, false, []);
  });

  it('cancelling the review leaves the library unchanged and nothing planned', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderPicker();
    await pickOnlineCandidate(user);
    await user.click(await screen.findByRole('button', { name: 'Cancel review' }));
    expect(meals.createMeal).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('a duplicate name in the review asks to "Save anyway" like the Epic 1 form (AC-20 of Epic 1)', async () => {
    meals.createMeal.mockResolvedValueOnce({ kind: 'duplicate' }).mockResolvedValueOnce({ kind: 'ok', meal: meal({ id: 5, name: 'Web soup' }) });
    const user = userEvent.setup();
    renderPicker();
    await pickOnlineCandidate(user);
    await user.click(await screen.findByRole('button', { name: 'Save meal' }));
    await user.click(await screen.findByRole('button', { name: 'Save anyway' }));
    expect(meals.createMeal).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText('Servings')).toBeInTheDocument();
  });

  it('shows an error if the candidate cannot be loaded', async () => {
    cons.getCandidate.mockRejectedValue(new Error('This search result has expired.'));
    const user = userEvent.setup();
    renderPicker();
    await pickOnlineCandidate(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
  });
});
