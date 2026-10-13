// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WeekPlanPage } from '../../src/client/plan/WeekPlanPage';
import { ToastProvider } from '../../src/client/toast';
import { week, meal } from './fixtures';

vi.mock('../../src/client/plan/planApi', async (orig) => {
  const actual = await orig<typeof import('../../src/client/plan/planApi')>();
  return {
    ...actual,
    planApi: { getWeek: vi.fn(), planDay: vi.fn(), changeServings: vi.fn(), removeDay: vi.fn(), moveDay: vi.fn(), setTick: vi.fn(), usage: vi.fn() },
  };
});
vi.mock('../../src/client/api', () => ({ api: { listMeals: vi.fn(), createMeal: vi.fn() } }));
vi.mock('../../src/client/constraints/constraintsApi', () => ({
  constraintsApi: { planWarnings: vi.fn(), listParticipants: vi.fn(), checkMeal: vi.fn(), getPrefs: vi.fn() },
}));
import { planApi } from '../../src/client/plan/planApi';
import { api } from '../../src/client/api';
import { constraintsApi } from '../../src/client/constraints/constraintsApi';
const plan = vi.mocked(planApi, true);
const meals = vi.mocked(api, true);
const cons = vi.mocked(constraintsApi, true);

const library = [meal({ id: 10, name: 'Pasta' }), meal({ id: 20, name: 'Pancakes', isFavourite: true }), meal({ id: 30, name: 'Onion Soup' })];

/** a minimal DataTransfer for jsdom */
function dataTransfer() {
  const store: Record<string, string> = {};
  return {
    store,
    effectAllowed: 'all', dropEffect: 'none',
    get types() { return Object.keys(store); },
    setData: (k: string, v: string) => { store[k] = v; },
    getData: (k: string) => store[k] ?? '',
    setDragImage: vi.fn(),
  };
}

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/plan']}>
        <WeekPlanPage />
      </MemoryRouter>
    </ToastProvider>,
  );

const day = (name: string) => screen.getByRole('group', { name });

/** drags the pantry meal `name` onto the day card */
function dragMealToDay(name: string, dayName: string) {
  const dt = dataTransfer();
  fireEvent.dragStart(screen.getByTestId(`pantry-${name}`), { dataTransfer: dt });
  fireEvent.dragOver(day(dayName), { dataTransfer: dt });
  fireEvent.drop(day(dayName), { dataTransfer: dt });
}
/** drags the planned meal of one day onto another */
function dragDayToDay(from: string, to: string) {
  const dt = dataTransfer();
  fireEvent.dragStart(within(day(from)).getByTestId('drag-handle'), { dataTransfer: dt });
  fireEvent.dragOver(day(to), { dataTransfer: dt });
  fireEvent.drop(day(to), { dataTransfer: dt });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0, 0));
  meals.listMeals.mockResolvedValue(library);
  cons.planWarnings.mockResolvedValue([]);
  cons.listParticipants.mockResolvedValue([]);
  cons.getPrefs.mockResolvedValue({ calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [] });
  cons.checkMeal.mockResolvedValue({ violations: [], unknownIngredients: [], blacklisted: [] });
  plan.getWeek.mockResolvedValue(week({}, { 1: { mealName: 'Onion Soup', mealId: 30, servings: 3, participantIds: [7] } }));
});
afterEach(() => vi.useRealTimers());

describe('pantry and drag and drop (week plan)', () => {
  it('lists the meals of the library as draggable chips and filters them', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    const chip = await screen.findByTestId('pantry-Pasta');
    expect(chip).toHaveAttribute('draggable', 'true');
    expect(screen.getByTestId('pantry-Pancakes')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Filter pantry'), 'pan');
    expect(screen.queryByTestId('pantry-Pasta')).not.toBeInTheDocument();
    expect(screen.getByTestId('pantry-Pancakes')).toBeInTheDocument();
  });

  it('a pantry meal dropped on an empty day is planned with the last servings and no participants (AC-1)', async () => {
    plan.planDay.mockResolvedValue(week({ lastServings: 4 }, { 1: { mealName: 'Onion Soup', mealId: 30 }, 4: { mealName: 'Pasta', mealId: 10 } }));
    renderPage();
    await screen.findByTestId('pantry-Pasta');
    dragMealToDay('Pasta', 'Thursday');
    await waitFor(() => expect(plan.planDay).toHaveBeenCalledWith('2026-10-12', 4, { mealId: 10, servings: 4, replace: false, participantIds: [] }));
    expect(cons.checkMeal).toHaveBeenCalledWith(10, []);
    expect(await screen.findByText('Pasta planned for Thursday')).toBeInTheDocument();
  });

  it('"Undo" after a drop removes the meal again', async () => {
    plan.planDay.mockResolvedValue(week({}, { 4: { mealName: 'Pasta', mealId: 10 } }));
    plan.removeDay.mockResolvedValue(week());
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    await screen.findByTestId('pantry-Pasta');
    dragMealToDay('Pasta', 'Thursday');
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(plan.removeDay).toHaveBeenCalledWith('2026-10-12', 4);
  });

  it('a meal that is already planned this week is not planned twice; the user is told (AC-3)', async () => {
    renderPage();
    await screen.findByTestId('pantry-Onion Soup');
    dragMealToDay('Onion Soup', 'Friday');
    expect(await screen.findByText(/'Onion Soup' is already planned on Monday this week/)).toBeInTheDocument();
    expect(plan.planDay).not.toHaveBeenCalled();
  });

  it('a blacklisted meal is not planned silently: the dialog opens at the servings step with the warning flow (AC-13)', async () => {
    cons.checkMeal.mockResolvedValue({ violations: [], unknownIngredients: [], blacklisted: ['nuts'] });
    renderPage();
    await screen.findByTestId('pantry-Pasta');
    dragMealToDay('Pasta', 'Thursday');
    const dialog = await screen.findByRole('dialog', { name: 'Choose a meal' });
    expect(within(dialog).getByLabelText('Servings')).toBeInTheDocument();
    expect(plan.planDay).not.toHaveBeenCalled();
    await userEvent.setup({ advanceTimers: () => {} }).click(within(dialog).getByRole('button', { name: 'Add to plan' }));
    expect(await within(dialog).findByTestId('dietary-warning')).toHaveTextContent(/blacklisted ingredient: nuts/i);
  });

  it('if the check cannot be done the dialog opens instead of planning blindly', async () => {
    cons.checkMeal.mockRejectedValue(new Error('offline'));
    renderPage();
    await screen.findByTestId('pantry-Pasta');
    dragMealToDay('Pasta', 'Thursday');
    expect(await screen.findByRole('dialog', { name: 'Choose a meal' })).toBeInTheDocument();
    expect(plan.planDay).not.toHaveBeenCalled();
  });

  it('dropping on a day that already has a meal asks to replace it (nothing is replaced silently, AC-2)', async () => {
    renderPage();
    await screen.findByTestId('pantry-Pasta');
    dragMealToDay('Pasta', 'Monday');
    const dialog = await screen.findByRole('dialog', { name: 'Choose a meal' });
    expect(within(dialog).getByLabelText('Servings')).toBeInTheDocument();
    await userEvent.setup({ advanceTimers: () => {} }).click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(await within(dialog).findByText("Replace 'Onion Soup' with 'Pasta'?")).toBeInTheDocument();
    expect(plan.planDay).not.toHaveBeenCalled();
  });

  it('dragging a planned meal onto an empty day moves it; "Undo" moves it back', async () => {
    plan.moveDay.mockResolvedValue(week({}, { 4: { mealName: 'Onion Soup', mealId: 30 } }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    await screen.findByTestId('pantry-Pasta');
    dragDayToDay('Monday', 'Thursday');
    await waitFor(() => expect(plan.moveDay).toHaveBeenCalledWith('2026-10-12', 1, 4));
    expect(await screen.findByText('Onion Soup moved to Thursday')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(plan.moveDay).toHaveBeenLastCalledWith('2026-10-12', 4, 1);
  });

  it('dragging a planned meal onto another planned meal swaps the two', async () => {
    plan.getWeek.mockResolvedValue(week({}, { 1: { mealName: 'Onion Soup', mealId: 30 }, 3: { mealName: 'Pancakes', mealId: 20 } }));
    plan.moveDay.mockResolvedValue(week({}, { 1: { mealName: 'Pancakes', mealId: 20 }, 3: { mealName: 'Onion Soup', mealId: 30 } }));
    renderPage();
    await screen.findByTestId('pantry-Pasta');
    dragDayToDay('Monday', 'Wednesday');
    await waitFor(() => expect(plan.moveDay).toHaveBeenCalledWith('2026-10-12', 1, 3));
    expect(await screen.findByText('Onion Soup and Pancakes swapped')).toBeInTheDocument();
  });

  it('dropping a planned meal on its own day does nothing', async () => {
    renderPage();
    await screen.findByTestId('pantry-Pasta');
    dragDayToDay('Monday', 'Monday');
    expect(plan.moveDay).not.toHaveBeenCalled();
  });

  it('days light up as drop targets while something is dragged, and the dragged card is marked', async () => {
    renderPage();
    const chip = await screen.findByTestId('pantry-Pasta');
    const dt = dataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    expect(day('Tuesday')).toHaveClass('drop-ready');
    fireEvent.dragEnter(day('Tuesday'), { dataTransfer: dt });
    fireEvent.dragOver(day('Tuesday'), { dataTransfer: dt });
    expect(day('Tuesday')).toHaveClass('drop-over');
    fireEvent.dragLeave(day('Tuesday'), { dataTransfer: dt });
    expect(day('Tuesday')).not.toHaveClass('drop-over');
    fireEvent.dragEnd(chip, { dataTransfer: dt });
    expect(day('Tuesday')).not.toHaveClass('drop-ready');
  });

  it('a failed move shows a message and keeps the plan as it was', async () => {
    const { PlanApiError } = await import('../../src/client/plan/planApi');
    plan.moveDay.mockRejectedValue(new PlanApiError('DAY_EMPTY', 404, 'Nothing is planned on this day.'));
    renderPage();
    await screen.findByTestId('pantry-Pasta');
    dragDayToDay('Monday', 'Friday');
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing is planned/i);
    expect(day('Monday')).toHaveTextContent('Onion Soup');
  });
});

describe('moving a meal without a mouse', () => {
  it('a "Move to day" select on a planned day moves the meal', async () => {
    plan.moveDay.mockResolvedValue(week({}, { 6: { mealName: 'Onion Soup', mealId: 30 } }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    const select = await within(await screen.findByRole('group', { name: 'Monday' })).findByLabelText('Move to day');
    expect(within(select).queryByRole('option', { name: 'Monday' })).not.toBeInTheDocument(); // not onto itself
    await user.selectOptions(select, 'Saturday');
    expect(plan.moveDay).toHaveBeenCalledWith('2026-10-12', 1, 6);
  });

  it('empty days have no move control', async () => {
    renderPage();
    await screen.findByTestId('pantry-Pasta');
    expect(within(day('Tuesday')).queryByLabelText('Move to day')).not.toBeInTheDocument();
  });
});

describe('undo for the other plan changes', () => {
  it('removing a meal can be undone and restores servings and participants exactly', async () => {
    plan.removeDay.mockResolvedValue(week());
    plan.planDay.mockResolvedValue(week({}, { 1: { mealName: 'Onion Soup', mealId: 30 } }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    await user.click(within(await screen.findByRole('group', { name: 'Monday' })).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Onion Soup removed from Monday')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(plan.planDay).toHaveBeenCalledWith('2026-10-12', 1, { mealId: 30, servings: 3, replace: false, participantIds: [7] });
  });

  it('replacing a meal can be undone and brings the previous meal back', async () => {
    plan.planDay.mockResolvedValue(week({}, { 1: { mealName: 'Pasta', mealId: 10 } }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    await user.click(within(await screen.findByRole('group', { name: 'Monday' })).getByRole('button', { name: 'Replace meal' }));
    await user.click(await screen.findByRole('button', { name: 'Pasta' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    await waitFor(() => expect(plan.planDay).toHaveBeenCalledWith('2026-10-12', 1, expect.objectContaining({ mealId: 10, replace: true })));
    expect(await screen.findByText('Pasta planned for Monday (replaced Onion Soup)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(plan.planDay).toHaveBeenLastCalledWith('2026-10-12', 1, { mealId: 30, servings: 3, replace: true, participantIds: [7] });
  });

  it('a servings change can be undone', async () => {
    plan.changeServings.mockResolvedValue(week({}, { 1: { mealName: 'Onion Soup', mealId: 30, servings: 8 } }));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    const mon = await screen.findByRole('group', { name: 'Monday' });
    await user.click(within(mon).getByRole('button', { name: 'Change servings' }));
    const input = within(mon).getByLabelText('Servings');
    await user.clear(input);
    await user.type(input, '8');
    await user.click(within(mon).getByRole('button', { name: 'Save servings' }));
    expect(await screen.findByText('Servings of Onion Soup changed to 8')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(plan.changeServings).toHaveBeenLastCalledWith('2026-10-12', 1, 3);
  });

  it('planning through the dialog also offers an undo', async () => {
    plan.planDay.mockResolvedValue(week({}, { 1: { mealName: 'Onion Soup', mealId: 30 }, 2: { mealName: 'Pancakes', mealId: 20 } }));
    plan.removeDay.mockResolvedValue(week());
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderPage();
    await user.click(within(await screen.findByRole('group', { name: 'Tuesday' })).getByRole('button', { name: 'Plan meal for Tuesday' }));
    await user.click(await screen.findByRole('button', { name: 'Pancakes' }));
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(await screen.findByText('Pancakes planned for Tuesday')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(plan.removeDay).toHaveBeenCalledWith('2026-10-12', 2);
  });
});
