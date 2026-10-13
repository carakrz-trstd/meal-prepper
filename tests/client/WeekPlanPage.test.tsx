// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WeekPlanPage } from '../../src/client/plan/WeekPlanPage';
import { week, meal, WEEK } from './fixtures';

vi.mock('../../src/client/plan/planApi', async (orig) => {
  const actual = await orig<typeof import('../../src/client/plan/planApi')>();
  return {
    ...actual,
    planApi: { getWeek: vi.fn(), planDay: vi.fn(), changeServings: vi.fn(), removeDay: vi.fn(), setTick: vi.fn(), usage: vi.fn() },
  };
});
vi.mock('../../src/client/api', () => ({ api: { listMeals: vi.fn() } }));
import { planApi } from '../../src/client/plan/planApi';
import { api } from '../../src/client/api';
const plan = vi.mocked(planApi, true);
const meals = vi.mocked(api, true);

const renderPage = (url = '/plan') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <WeekPlanPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0, 0)); // Wednesday 2026-10-14 -> current week Monday 2026-10-12
  meals.listMeals.mockResolvedValue([meal({ id: 10, name: 'Pasta' })]);
});
afterEach(() => vi.useRealTimers());

describe('WeekPlanPage (T-10)', () => {
  it('renders seven day cards Monday to Sunday with dates, empty days say "Nothing planned" (AC-11, AC-12)', async () => {
    plan.getWeek.mockResolvedValue(week());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Week of 12 Oct 2026' })).toBeInTheDocument();
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const n of names) {
      const group = screen.getByRole('group', { name: n });
      expect(within(group).getByText('Nothing planned')).toBeInTheDocument();
    }
    expect(plan.getWeek).toHaveBeenCalledWith('2026-10-12');
  });

  it('a planned day shows name, servings, kcal per serving, cost in EUR and minutes (AC-1, AC-23)', async () => {
    plan.getWeek.mockResolvedValue(week({}, { 3: { mealName: 'Pasta Bolognese', servings: 6, totalCostEur: 12, totalMinutes: 35 } }));
    renderPage();
    const wed = await screen.findByRole('group', { name: 'Wednesday' });
    expect(wed).toHaveTextContent('Pasta Bolognese');
    expect(wed).toHaveTextContent('6 servings');
    expect(wed).toHaveTextContent('600 kcal per serving');
    expect(wed).toHaveTextContent('12 EUR');
    expect(wed).toHaveTextContent('35 min');
  });

  it('missing calories or cost render "missing", never 0 (AC-23)', async () => {
    plan.getWeek.mockResolvedValue(week({}, { 5: { mealName: 'Soup', caloriesPerServing: null, totalCostEur: null } }));
    renderPage();
    const fri = await screen.findByRole('group', { name: 'Friday' });
    expect(fri).toHaveTextContent('calories: missing');
    expect(fri).toHaveTextContent('cost: missing');
    expect(fri.textContent).not.toMatch(/\b0 kcal|\b0 EUR/);
  });

  it('"Previous week" is disabled on the current week; "Next week" loads the next Monday (AC-11)', async () => {
    plan.getWeek.mockImplementation(async (w) => week({ weekStart: w }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    await screen.findByRole('heading', { name: 'Week of 12 Oct 2026' });
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(await screen.findByRole('heading', { name: 'Week of 19 Oct 2026' })).toBeInTheDocument();
    expect(plan.getWeek).toHaveBeenLastCalledWith('2026-10-19');
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeEnabled();
  });

  it('a past week in the URL falls back to the current week (AC-11)', async () => {
    plan.getWeek.mockImplementation(async (w) => week({ weekStart: w }));
    renderPage('/plan?week=2026-10-05');
    await screen.findByRole('heading', { name: 'Week of 12 Oct 2026' });
    expect(plan.getWeek).not.toHaveBeenCalledWith('2026-10-05');
  });

  it('an invalid week in the URL falls back to the current week', async () => {
    plan.getWeek.mockImplementation(async (w) => week({ weekStart: w }));
    renderPage('/plan?week=banana');
    await screen.findByRole('heading', { name: 'Week of 12 Oct 2026' });
  });

  it('occupied days offer Replace, Change servings and Remove, also past days of the current week (AC-13)', async () => {
    plan.getWeek.mockResolvedValue(week({}, { 1: { mealName: 'Past meal' } })); // Monday is before Wednesday
    renderPage();
    const mon = await screen.findByRole('group', { name: 'Monday' });
    expect(within(mon).getByRole('button', { name: 'Replace meal' })).toBeEnabled();
    expect(within(mon).getByRole('button', { name: 'Change servings' })).toBeEnabled();
    expect(within(mon).getByRole('button', { name: 'Remove' })).toBeEnabled();
    // empty past days can be planned too
    expect(within(screen.getByRole('group', { name: 'Tuesday' })).getByRole('button', { name: 'Plan meal for Tuesday' })).toBeEnabled();
  });

  it('Remove calls the API and the card is replaced from the response (AC-8)', async () => {
    plan.getWeek.mockResolvedValue(week({}, { 2: { mealName: 'Soup' } }));
    plan.removeDay.mockResolvedValue(week());
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    const tue = await screen.findByRole('group', { name: 'Tuesday' });
    await user.click(within(tue).getByRole('button', { name: 'Remove' }));
    expect(plan.removeDay).toHaveBeenCalledWith('2026-10-12', 2);
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'Tuesday' })).getByText('Nothing planned')).toBeInTheDocument());
  });

  it('Change servings saves a valid number and refuses an invalid one (AC-20)', async () => {
    plan.getWeek.mockResolvedValue(week({}, { 2: { mealName: 'Soup', servings: 4 } }));
    plan.changeServings.mockResolvedValue(week({}, { 2: { mealName: 'Soup', servings: 8 } }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    const tue = await screen.findByRole('group', { name: 'Tuesday' });
    await user.click(within(tue).getByRole('button', { name: 'Change servings' }));
    const input = within(tue).getByLabelText('Servings');
    await user.clear(input);
    await user.type(input, '21');
    await user.click(within(tue).getByRole('button', { name: 'Save servings' }));
    expect(plan.changeServings).not.toHaveBeenCalled();
    expect(within(tue).getByRole('alert')).toHaveTextContent('Servings must be a whole number from 1 to 20');
    await user.clear(input);
    await user.type(input, '8');
    await user.click(within(tue).getByRole('button', { name: 'Save servings' }));
    expect(plan.changeServings).toHaveBeenCalledWith('2026-10-12', 2, 8);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Tuesday' })).toHaveTextContent('8 servings'));
  });

  it('shows a load error as an alert', async () => {
    const { PlanApiError } = await import('../../src/client/plan/planApi');
    plan.getWeek.mockRejectedValue(new PlanApiError('INVALID_WEEK', 400, 'bad week'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/bad week/i);
  });
});

describe('WeekPlanPage constants', () => {
  it('uses the test week fixture', () => expect(WEEK).toBe('2026-10-12'));
});
