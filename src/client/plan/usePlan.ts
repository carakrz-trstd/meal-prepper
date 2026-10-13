import { useCallback, useEffect, useRef, useState } from 'react';
import type { WeekView } from '../../shared/plan-types';
import { PlanApiError, planApi } from './planApi';

export interface PlanError {
  code: string;
  message: string;
  extra: Record<string, unknown>;
}

function toError(e: unknown): PlanError {
  if (e instanceof PlanApiError) return { code: e.code, message: e.message, extra: e.extra };
  return { code: 'ERROR', message: (e as Error).message ?? 'Something went wrong.', extra: {} };
}

/**
 * Holds the current week view. Each mutation replaces the state with the server's response (AD-10, AC-8);
 * on an error the state stays as it was and `error` is set.
 */
export function usePlan(weekStart: string) {
  const [view, setView] = useState<WeekView | null>(null);
  const [error, setError] = useState<PlanError | null>(null);
  const [loading, setLoading] = useState(true);
  const current = useRef(weekStart);
  current.current = weekStart;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    planApi.getWeek(weekStart).then(
      (v) => {
        if (!alive) return;
        setView(v);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (!alive) return;
        setView(null);
        setError(toError(e));
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [weekStart]);

  const mutate = useCallback(async (fn: () => Promise<WeekView>): Promise<boolean> => {
    try {
      const next = await fn();
      if (next.weekStart === current.current) setView(next);
      setError(null);
      return true;
    } catch (e) {
      setError(toError(e));
      return false;
    }
  }, []);

  return {
    view,
    error,
    loading,
    clearError: () => setError(null),
    planDay: (day: number, input: { mealId: number; servings: number; replace?: boolean; participantIds?: number[] }) =>
      mutate(() => planApi.planDay(weekStart, day, input)),
    changeServings: (day: number, servings: number) => mutate(() => planApi.changeServings(weekStart, day, servings)),
    removeDay: (day: number) => mutate(() => planApi.removeDay(weekStart, day)),
    setTick: (entryId: string, ticked: boolean) => mutate(() => planApi.setTick(weekStart, entryId, ticked)),
  };
}
