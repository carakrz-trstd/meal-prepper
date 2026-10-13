import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './api';
import type { MealInput } from '../shared/types';

const input: MealInput = {
  name: 'Soup',
  baseServings: 4,
  ingredients: [{ name: 'Carrot', quantity: 200, unit: 'g' }],
  cookMinutes: 30,
};

const respond = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

afterEach(() => vi.restoreAllMocks());

describe('api client (T-12)', () => {
  it('maps 422 to a field-error object', async () => {
    respond(422, { code: 'VALIDATION', fields: [{ field: 'name', message: 'Name is required.' }] });
    const r = await api.createMeal(input);
    expect(r).toEqual({ kind: 'invalid', fields: [{ field: 'name', message: 'Name is required.' }] });
  });

  it('maps 409 to a duplicateName result', async () => {
    respond(409, { code: 'DUPLICATE_NAME' });
    expect(await api.createMeal(input)).toEqual({ kind: 'duplicate' });
  });

  it('returns the meal on 201 and sends allowDuplicateName when asked', async () => {
    const spy = respond(201, { id: 7, name: 'Soup' });
    const r = await api.createMeal(input, { allowDuplicateName: true });
    expect(r).toMatchObject({ kind: 'ok', meal: { id: 7 } });
    const sent = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(sent.allowDuplicateName).toBe(true);
  });

  it('maps 204 to void for delete', async () => {
    respond(204);
    await expect(api.deleteMeal(7)).resolves.toBeUndefined();
  });

  it('lists favourites with the query parameter', async () => {
    const spy = respond(200, []);
    await api.listMeals({ favouritesOnly: true });
    expect(String(spy.mock.calls[0][0])).toBe('/api/meals?favourites=true');
  });

  it('a network error surfaces a readable error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.listMeals()).rejects.toThrow(/could not reach the server/i);
  });

  it('startImport maps 422 to an invalid-url result', async () => {
    respond(422, { code: 'INVALID_URL', message: 'Enter a valid web address.' });
    expect(await api.startImport('x')).toEqual({ kind: 'invalid', message: 'Enter a valid web address.' });
  });
});
