// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePlan } from '../../src/client/plan/usePlan';
import { PlanApiError } from '../../src/client/plan/planApi';
import { week, WEEK, entry } from './fixtures';

vi.mock('../../src/client/plan/planApi', async (orig) => {
  const actual = await orig<typeof import('../../src/client/plan/planApi')>();
  return {
    ...actual,
    planApi: { getWeek: vi.fn(), planDay: vi.fn(), changeServings: vi.fn(), removeDay: vi.fn(), setTick: vi.fn(), usage: vi.fn() },
  };
});
import { planApi } from '../../src/client/plan/planApi';
const api = vi.mocked(planApi, true);

beforeEach(() => vi.resetAllMocks());

describe('usePlan (T-9)', () => {
  it('loads the week and exposes the view', async () => {
    api.getWeek.mockResolvedValue(week());
    const { result } = renderHook(() => usePlan(WEEK));
    await waitFor(() => expect(result.current.view?.weekStart).toBe(WEEK));
    expect(api.getWeek).toHaveBeenCalledWith(WEEK);
  });

  it('after each mutation the state equals the response, with no extra fetch (AC-8)', async () => {
    api.getWeek.mockResolvedValue(week());
    const planned = week({ shopping: [entry({ name: 'Flour' })] }, { 3: { mealName: 'Pasta' } });
    api.planDay.mockResolvedValue(planned);
    const { result } = renderHook(() => usePlan(WEEK));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    await act(async () => {
      expect(await result.current.planDay(3, { mealId: 30, servings: 4 })).toBe(true);
    });
    expect(result.current.view).toEqual(planned);
    expect(api.getWeek).toHaveBeenCalledTimes(1);

    const changed = week({ shopping: [entry({ name: 'Flour', quantity: 200 })] }, { 3: { mealName: 'Pasta', servings: 2 } });
    api.changeServings.mockResolvedValue(changed);
    await act(async () => { await result.current.changeServings(3, 2); });
    expect(result.current.view).toEqual(changed);

    const ticked = week({ shopping: [entry({ name: 'Flour', ticked: true })] });
    api.setTick.mockResolvedValue(ticked);
    await act(async () => { await result.current.setTick('mass:flour', true); });
    expect(result.current.view).toEqual(ticked);

    const removed = week();
    api.removeDay.mockResolvedValue(removed);
    await act(async () => { await result.current.removeDay(3); });
    expect(result.current.view).toEqual(removed);
    expect(api.getWeek).toHaveBeenCalledTimes(1);
  });

  it('an error response sets an error with its code and leaves the state unchanged', async () => {
    const initial = week({}, { 1: { mealName: 'A' } });
    api.getWeek.mockResolvedValue(initial);
    api.planDay.mockRejectedValue(new PlanApiError('MEAL_ALREADY_PLANNED', 409, 'already planned', { day: 2 }));
    const { result } = renderHook(() => usePlan(WEEK));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    let ok = true;
    await act(async () => { ok = await result.current.planDay(3, { mealId: 10, servings: 4 }); });
    expect(ok).toBe(false);
    expect(result.current.error).toMatchObject({ code: 'MEAL_ALREADY_PLANNED', extra: { day: 2 } });
    expect(result.current.view).toEqual(initial);
  });

  it('a week change loads the new week', async () => {
    api.getWeek.mockImplementation(async (w) => week({ weekStart: w }));
    const { result, rerender } = renderHook(({ w }) => usePlan(w), { initialProps: { w: WEEK } });
    await waitFor(() => expect(result.current.view?.weekStart).toBe(WEEK));
    rerender({ w: '2026-10-19' });
    await waitFor(() => expect(result.current.view?.weekStart).toBe('2026-10-19'));
    expect(api.getWeek).toHaveBeenLastCalledWith('2026-10-19');
  });

  it('a load error is reported, not thrown', async () => {
    api.getWeek.mockRejectedValue(new PlanApiError('WEEK_IN_PAST', 400, 'past'));
    const { result } = renderHook(() => usePlan(WEEK));
    await waitFor(() => expect(result.current.error?.code).toBe('WEEK_IN_PAST'));
    expect(result.current.view).toBeNull();
  });
});
