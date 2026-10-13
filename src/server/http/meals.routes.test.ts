import { describe, it, expect } from 'vitest';
import { buildApp } from './app';
import { openDatabase } from '../db/open';

const body = (over: Record<string, unknown> = {}) => ({
  name: 'Soup',
  baseServings: 4,
  ingredients: [{ name: 'Carrot', quantity: 200, unit: 'g' }],
  cookMinutes: 30,
  ...over,
});

const app = async () => buildApp({ db: openDatabase(':memory:') });

describe('meal routes (T-5)', () => {
  it('POST valid returns 201 with the body (AC-1)', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/meals', payload: body({ caloriesPerServing: 250 }) });
    expect(res.statusCode).toBe(201);
    const meal = res.json();
    expect(meal.name).toBe('Soup');
    expect(meal.caloriesPerServing).toBe(250);
    expect(meal.totalCostEur).toBeNull();
    expect(meal.ingredients[0]).toMatchObject({ name: 'Carrot', quantity: 200, unit: 'g' });
  });

  it('POST without cook time returns 422 with fields containing cookMinutes (AC-11)', async () => {
    const a = await app();
    const { cookMinutes: _c, ...rest } = body();
    const res = await a.inject({ method: 'POST', url: '/api/meals', payload: rest });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('VALIDATION');
    expect(res.json().fields.map((f: { field: string }) => f.field)).toContain('cookMinutes');
  });

  it('POST invalid unit returns 422 (AC-12)', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST',
      url: '/api/meals',
      payload: body({ ingredients: [{ name: 'Flour', quantity: 1, unit: 'cup' }] }),
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST duplicate returns 409 DUPLICATE_NAME, again with allowDuplicateName returns 201 (AC-20)', async () => {
    const a = await app();
    await a.inject({ method: 'POST', url: '/api/meals', payload: body() });
    const dup = await a.inject({ method: 'POST', url: '/api/meals', payload: body() });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('DUPLICATE_NAME');
    const again = await a.inject({ method: 'POST', url: '/api/meals', payload: body({ allowDuplicateName: true }) });
    expect(again.statusCode).toBe(201);
  });

  it('GET list and ?favourites=true (AC-3)', async () => {
    const a = await app();
    const m1 = (await a.inject({ method: 'POST', url: '/api/meals', payload: body({ name: 'A' }) })).json();
    await a.inject({ method: 'POST', url: '/api/meals', payload: body({ name: 'B' }) });
    expect((await a.inject({ method: 'GET', url: '/api/meals' })).json()).toHaveLength(2);
    const fav = await a.inject({ method: 'PUT', url: `/api/meals/${m1.id}/favourite`, payload: { value: true } });
    expect(fav.statusCode).toBe(200);
    expect(fav.json().isFavourite).toBe(true);
    const only = (await a.inject({ method: 'GET', url: '/api/meals?favourites=true' })).json();
    expect(only.map((m: { name: string }) => m.name)).toEqual(['A']);
    await a.inject({ method: 'PUT', url: `/api/meals/${m1.id}/favourite`, payload: { value: false } });
    expect((await a.inject({ method: 'GET', url: '/api/meals?favourites=true' })).json()).toHaveLength(0);
  });

  it('GET one meal and 404 for an unknown id', async () => {
    const a = await app();
    const m = (await a.inject({ method: 'POST', url: '/api/meals', payload: body() })).json();
    expect((await a.inject({ method: 'GET', url: `/api/meals/${m.id}` })).statusCode).toBe(200);
    expect((await a.inject({ method: 'GET', url: '/api/meals/9999' })).statusCode).toBe(404);
  });

  it('PUT meal returns the updated body, 404 and 422 handled (AC-15)', async () => {
    const a = await app();
    const m = (await a.inject({ method: 'POST', url: '/api/meals', payload: body() })).json();
    const upd = await a.inject({ method: 'PUT', url: `/api/meals/${m.id}`, payload: body({ name: 'Stew', cookMinutes: 45 }) });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ name: 'Stew', cookMinutes: 45 });
    expect((await a.inject({ method: 'PUT', url: '/api/meals/9999', payload: body() })).statusCode).toBe(404);
    expect((await a.inject({ method: 'PUT', url: `/api/meals/${m.id}`, payload: body({ name: '' }) })).statusCode).toBe(422);
  });

  it('DELETE returns 204 then GET returns 404 (AC-15)', async () => {
    const a = await app();
    const m = (await a.inject({ method: 'POST', url: '/api/meals', payload: body() })).json();
    expect((await a.inject({ method: 'DELETE', url: `/api/meals/${m.id}` })).statusCode).toBe(204);
    expect((await a.inject({ method: 'GET', url: `/api/meals/${m.id}` })).statusCode).toBe(404);
    expect((await a.inject({ method: 'DELETE', url: `/api/meals/${m.id}` })).statusCode).toBe(404);
  });

  it('keeps the estimated marker through the API (AC-19)', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST',
      url: '/api/meals',
      payload: body({ caloriesPerServing: 300, caloriesEstimated: true }),
    });
    expect(res.json().caloriesEstimated).toBe(true);
    expect(res.json().costEstimated).toBe(false);
  });
});
