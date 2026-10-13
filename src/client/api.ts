import type { FieldError, ImportJobStatus, Meal, MealInput } from '../shared/types';

export type SaveOutcome =
  | { kind: 'ok'; meal: Meal }
  | { kind: 'invalid'; fields: FieldError[] }
  | { kind: 'duplicate' };

export type StartImportOutcome = { kind: 'started'; jobId: string } | { kind: 'invalid'; message: string };

async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error('Could not reach the server. Is the app still running?');
  }
}

const json = (body: unknown): RequestInit => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function unexpected(res: Response): never {
  throw new Error(`The server answered with an unexpected status (${res.status}).`);
}

async function save(url: string, method: 'POST' | 'PUT', input: MealInput, allowDuplicateName?: boolean): Promise<SaveOutcome> {
  const res = await request(url, { method, ...json(allowDuplicateName ? { ...input, allowDuplicateName: true } : input) });
  if (res.status === 201 || res.status === 200) return { kind: 'ok', meal: await readJson<Meal>(res) };
  if (res.status === 422) return { kind: 'invalid', fields: (await readJson<{ fields: FieldError[] }>(res)).fields };
  if (res.status === 409) return { kind: 'duplicate' };
  return unexpected(res);
}

export const api = {
  async listMeals(opts: { favouritesOnly?: boolean } = {}): Promise<Meal[]> {
    const res = await request(opts.favouritesOnly ? '/api/meals?favourites=true' : '/api/meals');
    if (!res.ok) unexpected(res);
    return readJson<Meal[]>(res);
  },

  async getMeal(id: number): Promise<Meal | null> {
    const res = await request(`/api/meals/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) unexpected(res);
    return readJson<Meal>(res);
  },

  createMeal(input: MealInput, opts: { allowDuplicateName?: boolean } = {}): Promise<SaveOutcome> {
    return save('/api/meals', 'POST', input, opts.allowDuplicateName);
  },

  updateMeal(id: number, input: MealInput, opts: { allowDuplicateName?: boolean } = {}): Promise<SaveOutcome> {
    return save(`/api/meals/${id}`, 'PUT', input, opts.allowDuplicateName);
  },

  async deleteMeal(id: number): Promise<void> {
    const res = await request(`/api/meals/${id}`, { method: 'DELETE' });
    if (res.status !== 204 && res.status !== 404) unexpected(res);
  },

  async setFavourite(id: number, value: boolean): Promise<Meal> {
    const res = await request(`/api/meals/${id}/favourite`, { method: 'PUT', ...json({ value }) });
    if (!res.ok) unexpected(res);
    return readJson<Meal>(res);
  },

  async startImport(url: string): Promise<StartImportOutcome> {
    const res = await request('/api/imports', { method: 'POST', ...json({ url }) });
    if (res.status === 202) return { kind: 'started', jobId: (await readJson<{ jobId: string }>(res)).jobId };
    if (res.status === 422) return { kind: 'invalid', message: (await readJson<{ message?: string }>(res)).message ?? 'Enter a valid web address.' };
    return unexpected(res);
  },

  async getImport(jobId: string): Promise<ImportJobStatus> {
    const res = await request(`/api/imports/${jobId}`);
    if (!res.ok) unexpected(res);
    return readJson<ImportJobStatus>(res);
  },
};
