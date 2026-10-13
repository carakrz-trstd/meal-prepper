// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ShoppingListPage } from '../../src/client/plan/ShoppingListPage';
import { week, entry } from './fixtures';

vi.mock('../../src/client/plan/planApi', async (orig) => {
  const actual = await orig<typeof import('../../src/client/plan/planApi')>();
  return {
    ...actual,
    planApi: { getWeek: vi.fn(), planDay: vi.fn(), changeServings: vi.fn(), removeDay: vi.fn(), setTick: vi.fn(), usage: vi.fn() },
  };
});
import { planApi } from '../../src/client/plan/planApi';
const plan = vi.mocked(planApi, true);

const renderPage = (url = '/shopping') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ShoppingListPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0, 0));
});
afterEach(() => vi.useRealTimers());

const withList = (...entries: ReturnType<typeof entry>[]) => week({ shopping: entries }, { 1: { mealName: 'Pasta' } });

describe('ShoppingListPage (T-12)', () => {
  it('renders one list in the given order with a checkbox, quantity, unit and a sources line (AC-10, AC-16, AC-24)', async () => {
    plan.getWeek.mockResolvedValue(
      withList(
        entry({ name: 'Flour', quantity: 800, unit: 'g', sources: [{ day: 1, mealName: 'Pasta' }, { day: 3, mealName: 'Soup' }] }),
        entry({ name: 'Onion', family: 'piece', id: 'piece:onion', quantity: 8, unit: 'piece', sources: [{ day: 2, mealName: 'Stew' }] }),
      ),
    );
    renderPage();
    const list = await screen.findByRole('list', { name: 'Shopping list' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Flour');
    expect(items[0]).toHaveTextContent('800 g');
    expect(items[0]).toHaveTextContent('Mon Pasta, Wed Soup');
    expect(items[1]).toHaveTextContent('Onion');
    expect(items[1]).toHaveTextContent('8 piece');
    expect(within(items[0]).getByRole('checkbox', { name: /Flour/ })).not.toBeChecked();
  });

  it('shows decimals without a trailing .0 (AC-21)', async () => {
    plan.getWeek.mockResolvedValue(withList(entry({ name: 'Milk', quantity: 1.5, unit: 'l', family: 'volume', id: 'volume:milk' })));
    renderPage();
    expect(await screen.findByText('1.5 l')).toBeInTheDocument();
  });

  it('ticking calls the tick endpoint and the row shows checked from the response (AC-16)', async () => {
    plan.getWeek.mockResolvedValue(withList(entry({ name: 'Flour' })));
    plan.setTick.mockResolvedValue(withList(entry({ name: 'Flour', ticked: true })));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    await user.click(await screen.findByRole('checkbox', { name: /Flour/ }));
    expect(plan.setTick).toHaveBeenCalledWith('2026-10-12', 'mass:flour', true);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Flour/ })).toBeChecked());
  });

  it('the checkbox flips immediately, before the server answers, and follows the response afterwards (usable in the shop)', async () => {
    plan.getWeek.mockResolvedValue(withList(entry({ name: 'Flour' })));
    let answer!: (v: ReturnType<typeof withList>) => void;
    plan.setTick.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    const box = await screen.findByRole('checkbox', { name: /Flour/ });
    await user.click(box);
    expect(box).toBeChecked(); // optimistic: the server has not answered yet
    answer(withList(entry({ name: 'Flour', ticked: true })));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Flour/ })).toBeChecked());
  });

  it('a failed tick request reverts the checkbox and shows the error', async () => {
    const { PlanApiError } = await import('../../src/client/plan/planApi');
    plan.getWeek.mockResolvedValue(withList(entry({ name: 'Flour' })));
    plan.setTick.mockRejectedValue(new PlanApiError('ENTRY_NOT_FOUND', 404, 'This entry does not exist.'));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    const box = await screen.findByRole('checkbox', { name: /Flour/ });
    await user.click(box);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Flour/ })).not.toBeChecked());
    expect(screen.getByRole('alert')).toHaveTextContent(/does not exist/i);
  });

  it('a response where the tick was cleared shows unchecked (AC-19 at UI level)', async () => {
    plan.getWeek.mockResolvedValue(withList(entry({ name: 'Flour', ticked: true })));
    plan.setTick.mockResolvedValue(withList(entry({ name: 'Flour', ticked: false, quantity: 1200 })));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    const box = await screen.findByRole('checkbox', { name: /Flour/ });
    expect(box).toBeChecked();
    await user.click(box); // untick
    expect(plan.setTick).toHaveBeenCalledWith('2026-10-12', 'mass:flour', false);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Flour/ })).not.toBeChecked());
    expect(screen.getByText('1200 g')).toBeInTheDocument();
  });

  it('an empty week shows the empty state with a link to the plan of that week (AC-26)', async () => {
    plan.getWeek.mockResolvedValue(week({ weekStart: '2026-10-19' }));
    renderPage('/shopping?week=2026-10-19');
    expect(await screen.findByText(/No meals are planned for this week/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the plan' })).toHaveAttribute('href', '/plan?week=2026-10-19');
    expect(screen.queryByRole('list', { name: 'Shopping list' })).not.toBeInTheDocument();
  });

  it('uses the current week when no week is given and falls back from a past week (AC-11)', async () => {
    plan.getWeek.mockImplementation(async (w) => week({ weekStart: w }));
    renderPage('/shopping?week=2026-09-28');
    await screen.findByText(/No meals are planned/i);
    expect(plan.getWeek).toHaveBeenCalledWith('2026-10-12');
  });

  it('shows a load error as an alert', async () => {
    const { PlanApiError } = await import('../../src/client/plan/planApi');
    plan.getWeek.mockRejectedValue(new PlanApiError('INVALID_WEEK', 400, 'bad week'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/bad week/i);
  });
});
