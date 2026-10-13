import { describe, it, expect } from 'vitest';
import { makeApp, addParticipant } from './support';

describe('participants API (T-5, AC-7, AC-20)', () => {
  it('POST creates a participant with restrictions', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/participants', payload: { name: ' Anna ', restrictions: ['vegetarian', 'nut-free'] } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(Number), name: 'Anna', restrictions: ['nut-free', 'vegetarian'] });
  });

  it('POST with an unknown restriction ("keto") -> 400 (AC-20)', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/participants', payload: { name: 'Anna', restrictions: ['keto'] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION');
    expect(res.json().fields.map((f: { field: string }) => f.field)).toContain('restrictions');
  });

  it('POST with an empty name -> 400', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/participants', payload: { name: '   ', restrictions: [] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().fields.map((f: { field: string }) => f.field)).toContain('name');
  });

  it('POST without restrictions is fine (a participant without restrictions)', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/participants', payload: { name: 'Cleo' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().restrictions).toEqual([]);
  });

  it('GET lists participants with their restrictions', async () => {
    const { app } = await makeApp();
    await addParticipant(app, 'Ben', ['vegan']);
    await addParticipant(app, 'Anna', []);
    const list = (await app.inject({ method: 'GET', url: '/api/participants' })).json();
    expect(list.map((p: { name: string }) => p.name)).toEqual(['Anna', 'Ben']);
    expect(list[1].restrictions).toEqual(['vegan']);
  });

  it('PUT edits name and restrictions; unknown id -> 404; invalid -> 400', async () => {
    const { app } = await makeApp();
    const a = await addParticipant(app, 'Anna', ['vegan']);
    const res = await app.inject({ method: 'PUT', url: `/api/participants/${a.id}`, payload: { name: 'Anna B', restrictions: ['gluten-free'] } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: a.id, name: 'Anna B', restrictions: ['gluten-free'] });
    expect((await app.inject({ method: 'PUT', url: '/api/participants/999', payload: { name: 'x', restrictions: [] } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/api/participants/${a.id}`, payload: { name: '', restrictions: [] } })).statusCode).toBe(400);
  });

  it('DELETE removes a participant; unknown id -> 404', async () => {
    const { app } = await makeApp();
    const a = await addParticipant(app, 'Anna');
    expect((await app.inject({ method: 'DELETE', url: `/api/participants/${a.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/participants' })).json()).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `/api/participants/${a.id}` })).statusCode).toBe(404);
  });

  it('the response contains no fields besides id, name and restrictions (AC-7)', async () => {
    const { app } = await makeApp();
    const a = await addParticipant(app, 'Anna', ['vegan']);
    expect(Object.keys(a).sort()).toEqual(['id', 'name', 'restrictions']);
  });
});
