// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WeekPlanPage } from '../../../src/client/plan/WeekPlanPage';
import { week, meal } from '../../client/fixtures';
import type { PlanWarning } from '../../../src/shared/constraints/types';

vi.mock('../../../src/client/plan/planApi', async (orig) => {
  const actual = await orig<typeof import('../../../src/client/plan/planApi')>();
  return { ...actual, planApi: { getWeek: vi.fn(), planDay: vi.fn(), changeServings: vi.fn(), removeDay: vi.fn(), setTick: vi.fn(), usage: vi.fn() } };
});
vi.mock('../../../src/client/api', () => ({ api: { listMeals: vi.fn() } }));
vi.mock('../../../src/client/constraints/constraintsApi', () => ({
  constraintsApi: { planWarnings: vi.fn(), listParticipants: vi.fn(), checkMeal: vi.fn(), getPrefs: vi.fn() },
}));
import { planApi } from '../../../src/client/plan/planApi';
import { api } from '../../../src/client/api';
import { constraintsApi } from '../../../src/client/constraints/constraintsApi';
const plan = vi.mocked(planApi, true);
const meals = vi.mocked(api, true);
const cons = vi.mocked(constraintsApi, true);

const warning = (day: number, over: Partial<PlanWarning> = {}): PlanWarning => ({
  day, plannedMealId: day, mealId: day * 10, mealName: 'Chicken curry',
  violations: [{ participant: 'Anna', restriction: 'vegetarian', ingredient: 'Chicken' }],
  unknownIngredients: [], blacklisted: [], ...over,
});

const renderPage = () => render(<MemoryRouter initialEntries={['/plan']}><WeekPlanPage /></MemoryRouter>);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0, 0));
  meals.listMeals.mockResolvedValue([meal({ id: 10, name: 'Pasta' })]);
  cons.listParticipants.mockResolvedValue([]);
  cons.checkMeal.mockResolvedValue({ violations: [], unknownIngredients: [], blacklisted: [] });
  cons.getPrefs.mockResolvedValue({ calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [] });
  plan.getWeek.mockResolvedValue(week({}, { 3: { mealName: 'Chicken curry' }, 5: { mealName: 'Soup' } }));
});
afterEach(() => vi.useRealTimers());

describe('warnings in the plan view (T-15, AC-25)', () => {
  it('shows a warning with participant, restriction and ingredient on the affected day only', async () => {
    cons.planWarnings.mockResolvedValue([warning(3)]);
    renderPage();
    const wed = await screen.findByRole('group', { name: 'Wednesday' });
    await waitFor(() => expect(within(wed).getByText(/^Warning:/)).toBeInTheDocument());
    expect(wed).toHaveTextContent('Anna');
    expect(wed).toHaveTextContent('vegetarian');
    expect(wed).toHaveTextContent('Chicken');
    expect(screen.getByRole('group', { name: 'Friday' })).not.toHaveTextContent('Warning');
    expect(cons.planWarnings).toHaveBeenCalledWith('2026-10-12');
  });

  it('shows blacklist hits in the warning', async () => {
    cons.planWarnings.mockResolvedValue([warning(5, { violations: [], blacklisted: ['walnut'] })]);
    renderPage();
    const fri = await screen.findByRole('group', { name: 'Friday' });
    await waitFor(() => expect(fri).toHaveTextContent(/blacklist.*walnut/i));
  });

  it('the meal stays planned and removing it keeps working (warnings never remove a meal)', async () => {
    cons.planWarnings.mockResolvedValue([warning(3)]);
    plan.removeDay.mockResolvedValue(week({}, { 5: { mealName: 'Soup' } }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    const wed = await screen.findByRole('group', { name: 'Wednesday' });
    await waitFor(() => expect(wed).toHaveTextContent('Warning'));
    expect(wed).toHaveTextContent('Chicken curry');
    cons.planWarnings.mockResolvedValue([]);
    await user.click(within(wed).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Wednesday' })).toHaveTextContent('Nothing planned'));
    expect(screen.getByRole('group', { name: 'Wednesday' })).not.toHaveTextContent('Warning');
  });

  it('refreshes the warnings after the plan changed', async () => {
    cons.planWarnings.mockResolvedValue([]);
    plan.planDay.mockResolvedValue(week({}, { 3: { mealName: 'Chicken curry' }, 5: { mealName: 'Soup' }, 6: { mealName: 'Pasta' } }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    await screen.findByRole('group', { name: 'Saturday' });
    const callsBefore = cons.planWarnings.mock.calls.length;
    await user.click(within(screen.getByRole('group', { name: 'Saturday' })).getByRole('button', { name: 'Plan meal for Saturday' }));
    await user.click(await screen.findByRole('button', { name: 'Pasta' }));
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    await waitFor(() => expect(cons.planWarnings.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('no warnings when the warning request fails (the plan page keeps working)', async () => {
    cons.planWarnings.mockRejectedValue(new Error('offline'));
    renderPage();
    await screen.findByRole('group', { name: 'Wednesday' });
    expect(screen.queryByText(/^Warning:/)).not.toBeInTheDocument();
  });

  it('plans with the ticked participant ids from the picker (AC-25 storage)', async () => {
    cons.planWarnings.mockResolvedValue([]);
    cons.listParticipants.mockResolvedValue([{ id: 1, name: 'Anna', restrictions: [] }]);
    cons.checkMeal.mockResolvedValue({ violations: [], unknownIngredients: [], blacklisted: [] });
    plan.planDay.mockResolvedValue(week({}, { 6: { mealName: 'Pasta' } }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    await user.click(within(await screen.findByRole('group', { name: 'Saturday' })).getByRole('button', { name: 'Plan meal for Saturday' }));
    await user.click(await screen.findByRole('button', { name: 'Pasta' }));
    await user.click(await screen.findByLabelText('Anna'));
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    await waitFor(() => expect(plan.planDay).toHaveBeenCalledWith('2026-10-12', 6, { mealId: 10, servings: 1, replace: false, participantIds: [1] }));
  });
});


