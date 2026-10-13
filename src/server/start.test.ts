import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, type RunningServer } from './main';

const dirs: string[] = [];
const running: RunningServer[] = [];
afterEach(async () => {
  for (const s of running.splice(0)) await s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const tmpDb = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-start-'));
  dirs.push(dir);
  return path.join(dir, 'meals.db');
};
const meal = {
  name: 'Persisted Soup',
  baseServings: 4,
  ingredients: [{ name: 'Carrot', quantity: 200, unit: 'g' }],
  cookMinutes: 30,
};

describe('server start (T-16)', () => {
  it('data created in the first run is present after a restart on the same DB file (AC-7)', async () => {
    const file = tmpDb();
    const first = await startServer({ port: 0, dbFile: file });
    const created = await fetch(`${first.url}/api/meals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(meal),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: number };
    await fetch(`${first.url}/api/meals/${id}/favourite`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: true }),
    });
    await first.close();

    const second = await startServer({ port: 0, dbFile: file });
    running.push(second);
    const list = (await (await fetch(`${second.url}/api/meals`)).json()) as { name: string; isFavourite: boolean }[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Persisted Soup', isFavourite: true });
  });

  it('applies migrations at startup on an empty database', async () => {
    const s = await startServer({ port: 0, dbFile: tmpDb() });
    running.push(s);
    expect(s.db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(1);
  });

  it('binds to 127.0.0.1 only', async () => {
    const s = await startServer({ port: 0, dbFile: tmpDb() });
    running.push(s);
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(s.app.server.address()).toMatchObject({ address: '127.0.0.1' });
  });

  it('graceful shutdown closes the database', async () => {
    const s = await startServer({ port: 0, dbFile: tmpDb() });
    expect(s.db.open).toBe(true);
    await s.close();
    expect(s.db.open).toBe(false);
  });
});
