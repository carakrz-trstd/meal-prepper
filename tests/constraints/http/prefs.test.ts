import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../../../src/server/http/app';
import { openDatabase } from '../../../src/server/db/open';
import { fixedClock } from '../../helpers';
import { makeApp, addParticipant } from './support';

describe('suggestion prefs API (T-8, AC-26)', () => {
  it('GET returns empty prefs initially', async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/api/suggestion-prefs' })).json()).toEqual({
      calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [],
    });
  });

  it('PUT saves limits and participant ids and GET returns them after a new DB connection (restart)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prefs-'));
    const file = path.join(dir, 'p.db');
    const db1 = openDatabase(file);
    const app1 = await buildApp({ db: db1, clock: fixedClock() });
    const anna = await addParticipant(app1, 'Anna');
    const put = await app1.inject({
      method: 'PUT', url: '/api/suggestion-prefs',
      payload: { calorieLimit: 500, budgetLimit: 7.5, timeLimit: 45, participantIds: [anna.id] },
    });
    expect(put.statusCode).toBe(200);
    await app1.close();
    db1.close();

    const db2 = openDatabase(file);
    const app2 = await buildApp({ db: db2, clock: fixedClock() });
    expect((await app2.inject({ method: 'GET', url: '/api/suggestion-prefs' })).json()).toEqual({
      calorieLimit: 500, budgetLimit: 7.5, timeLimit: 45, participantIds: [anna.id],
    });
    await app2.close();
    db2.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('PUT with nulls and an empty list clears the prefs', async () => {
    const { app } = await makeApp();
    await app.inject({ method: 'PUT', url: '/api/suggestion-prefs', payload: { calorieLimit: 500, budgetLimit: 5, timeLimit: 30, participantIds: [] } });
    const cleared = await app.inject({
      method: 'PUT', url: '/api/suggestion-prefs',
      payload: { calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [] },
    });
    expect(cleared.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/suggestion-prefs' })).json()).toEqual({
      calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [],
    });
  });

  it('deleted participants are dropped from the returned ids', async () => {
    const { app } = await makeApp();
    const a = await addParticipant(app, 'Anna');
    const b = await addParticipant(app, 'Ben');
    await app.inject({ method: 'PUT', url: '/api/suggestion-prefs', payload: { calorieLimit: null, budgetLimit: null, timeLimit: null, participantIds: [a.id, b.id] } });
    await app.inject({ method: 'DELETE', url: `/api/participants/${a.id}` });
    expect((await app.inject({ method: 'GET', url: '/api/suggestion-prefs' })).json().participantIds).toEqual([b.id]);
  });

  it('invalid values -> 400', async () => {
    const { app } = await makeApp();
    for (const payload of [{ calorieLimit: -5 }, { budgetLimit: 'cheap' }, { timeLimit: 0 }, { participantIds: 'all' }]) {
      const res = await app.inject({ method: 'PUT', url: '/api/suggestion-prefs', payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });
});
