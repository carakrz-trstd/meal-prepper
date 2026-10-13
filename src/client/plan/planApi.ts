import type { WeekView } from '../../shared/plan-types';

export class PlanApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'PlanApiError';
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new PlanApiError('NETWORK', 0, 'Could not reach the server. Is the app still running?');
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const { code, message, ...extra } = body as { code?: string; message?: string };
    throw new PlanApiError(code ?? 'ERROR', res.status, message ?? `The server answered with status ${res.status}.`, extra);
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const base = (weekStart: string) => `/api/plan/${weekStart}`;

/** Every mutation resolves with the full updated week view (AD-10). */
export const planApi = {
  getWeek: (weekStart: string) => call<WeekView>(base(weekStart)),
  planDay: (weekStart: string, day: number, input: { mealId: number; servings: number; replace?: boolean }) =>
    call<WeekView>(`${base(weekStart)}/days/${day}`, json('PUT', input)),
  changeServings: (weekStart: string, day: number, servings: number) =>
    call<WeekView>(`${base(weekStart)}/days/${day}`, json('PATCH', { servings })),
  removeDay: (weekStart: string, day: number) => call<WeekView>(`${base(weekStart)}/days/${day}`, { method: 'DELETE' }),
  setTick: (weekStart: string, entryId: string, ticked: boolean) =>
    call<WeekView>(`${base(weekStart)}/ticks`, json('PUT', { entryId, ticked })),
  usage: (mealId: number) => call<{ plannedCount: number }>(`/api/plan/usage/${mealId}`),
};
