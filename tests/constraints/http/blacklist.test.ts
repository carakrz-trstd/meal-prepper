import { describe, it, expect } from 'vitest';
import { makeApp } from './support';

describe('blacklist API (T-6, AC-6)', () => {
  it('POST " Nuts " stores "nuts"', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/blacklist', payload: { term: ' Nuts ' } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(Number), term: 'nuts' });
  });

  it('a duplicate does not create a second row and answers 200 with the existing item', async () => {
    const { app } = await makeApp();
    const first = (await app.inject({ method: 'POST', url: '/api/blacklist', payload: { term: 'nuts' } })).json();
    const again = await app.inject({ method: 'POST', url: '/api/blacklist', payload: { term: 'NUTS' } });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.id);
    expect((await app.inject({ method: 'GET', url: '/api/blacklist' })).json()).toHaveLength(1);
  });

  it('an empty term -> 400', async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: 'POST', url: '/api/blacklist', payload: { term: '  ' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/blacklist', payload: {} })).statusCode).toBe(400);
  });

  it('GET lists, DELETE removes (404 when unknown)', async () => {
    const { app } = await makeApp();
    const a = (await app.inject({ method: 'POST', url: '/api/blacklist', payload: { term: 'milk' } })).json();
    await app.inject({ method: 'POST', url: '/api/blacklist', payload: { term: 'egg' } });
    expect((await app.inject({ method: 'GET', url: '/api/blacklist' })).json().map((i: { term: string }) => i.term)).toEqual(['egg', 'milk']);
    expect((await app.inject({ method: 'DELETE', url: `/api/blacklist/${a.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/blacklist' })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: `/api/blacklist/${a.id}` })).statusCode).toBe(404);
  });
});
