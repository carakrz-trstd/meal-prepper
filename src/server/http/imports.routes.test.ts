import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from './app';
import { openDatabase } from '../db/open';
import type { PageFetcher } from '../import/RecipeFetcher';

const html = fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'recipe-jsonld-full.html'), 'utf8');
const fetcher: PageFetcher = { fetch: async () => html };

const app = () =>
  buildApp({
    db: openDatabase(':memory:'),
    importDeps: {
      fetcher,
      nutrition: { lookup: async () => null },
      prices: { lookup: async () => null },
      deadlineMs: 30000,
    },
  });

async function poll(a: Awaited<ReturnType<typeof app>>, jobId: string) {
  for (let i = 0; i < 100; i++) {
    const res = await a.inject({ method: 'GET', url: `/api/imports/${jobId}` });
    if (res.json().status !== 'running') return res.json();
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('import did not finish');
}

describe('import routes (T-11)', () => {
  it('POST returns 202 with a jobId and GET reports running then done (AD-17)', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/imports', payload: { url: 'https://example.org/r' } });
    expect(res.statusCode).toBe(202);
    const { jobId } = res.json();
    expect(typeof jobId).toBe('string');
    const first = await a.inject({ method: 'GET', url: `/api/imports/${jobId}` });
    expect(first.statusCode).toBe(200);
    expect(['running', 'done']).toContain(first.json().status);
    const done = await poll(a, jobId);
    expect(done.status).toBe('done');
    expect(done.draft.name).toBe('Full Source Stew');
  });

  it('an import never creates a meal (AC-4)', async () => {
    const a = await app();
    const { jobId } = (await a.inject({ method: 'POST', url: '/api/imports', payload: { url: 'https://example.org/r' } })).json();
    await poll(a, jobId);
    expect((await a.inject({ method: 'GET', url: '/api/meals' })).json()).toEqual([]);
  });

  it('a malformed URL returns 422', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/imports', payload: { url: 'not a url' } });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INVALID_URL');
    const missing = await a.inject({ method: 'POST', url: '/api/imports', payload: {} });
    expect(missing.statusCode).toBe(422);
  });

  it('an unknown job id returns 404', async () => {
    const a = await app();
    expect((await a.inject({ method: 'GET', url: '/api/imports/nope' })).statusCode).toBe(404);
  });

  it('a failing import reports failed with an error code and still creates no meal (AC-6)', async () => {
    const a = await buildApp({
      db: openDatabase(':memory:'),
      importDeps: { fetcher: { fetch: async () => '<html><body>nothing</body></html>' }, nutrition: { lookup: async () => null }, prices: { lookup: async () => null }, deadlineMs: 30000 },
    });
    const { jobId } = (await a.inject({ method: 'POST', url: '/api/imports', payload: { url: 'https://example.org/x' } })).json();
    const s = await poll(a, jobId);
    expect(s).toMatchObject({ status: 'failed', error: { code: 'NO_RECIPE_FOUND' } });
    expect((await a.inject({ method: 'GET', url: '/api/meals' })).json()).toEqual([]);
  });
});
