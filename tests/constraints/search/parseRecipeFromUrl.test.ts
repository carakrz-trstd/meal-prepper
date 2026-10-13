import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { makeParseRecipeFromUrl } from '../../../src/server/constraints/parseRecipeFromUrl';
import { RecipeFetcher, ImportError } from '../../../src/server/import/RecipeFetcher';

const page = (name: string) => fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const files: Record<string, string> = {
      '/jsonld': 'recipe-jsonld-full.html',
      '/html': 'recipe-html.html',
      '/none': 'not-a-recipe.html',
    };
    if (req.url === '/slow') return; // never answers
    const file = files[req.url ?? ''];
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

const parse = makeParseRecipeFromUrl(new RecipeFetcher());
const signal = () => new AbortController().signal;

describe('parseRecipeFromUrl (T-11, AD-9)', () => {
  it('returns the JSON-LD draft with the source URL set and source values only (no estimate lookups)', async () => {
    const d = await parse(`${base}/jsonld`, signal());
    expect(d.name).toBe('Full Source Stew');
    expect(d.sourceUrl).toBe(`${base}/jsonld`);
    expect(d.caloriesPerServing).toBe(520);
    expect(d.caloriesEstimate).toBeNull();
    expect(d.costEstimate).toBeNull();
  });

  it('falls back to the HTML parser', async () => {
    const d = await parse(`${base}/html`, signal());
    expect(d.name).toBe('Kartoffelsuppe');
    expect(d.caloriesPerServing).toBeNull();
  });

  it('a page without a recipe -> NO_RECIPE_FOUND', async () => {
    await expect(parse(`${base}/none`, signal())).rejects.toMatchObject({ code: 'NO_RECIPE_FOUND' });
  });

  it('an unreachable page -> UNREACHABLE; an invalid URL -> INVALID_URL', async () => {
    await expect(parse(`${base}/missing`, signal())).rejects.toMatchObject({ code: 'UNREACHABLE' });
    await expect(parse('not a url', signal())).rejects.toBeInstanceOf(ImportError);
  });

  it('an aborted signal rejects', async () => {
    const ac = new AbortController();
    const p = parse(`${base}/slow`, ac.signal);
    setTimeout(() => ac.abort(), 30);
    await expect(p).rejects.toBeDefined();
  });
});
