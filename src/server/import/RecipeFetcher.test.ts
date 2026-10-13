import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { RecipeFetcher, ImportError } from './RecipeFetcher';

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    switch (req.url) {
      case '/ok':
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<html><body>hello</body></html>');
        break;
      case '/404':
        res.writeHead(404, { 'content-type': 'text/html' });
        res.end('nope');
        break;
      case '/500':
        res.writeHead(500);
        res.end('boom');
        break;
      case '/json':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"a":1}');
        break;
      case '/big':
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('a'.repeat(2 * 1024 * 1024 + 10));
        break;
      case '/slow':
        // never answers
        break;
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

const fetcher = new RecipeFetcher();
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    return e instanceof ImportError ? e.code : (e as Error).name;
  }
};

describe('RecipeFetcher (T-8)', () => {
  it('200 HTML returns the body', async () => {
    expect(await fetcher.fetch(`${base}/ok`, new AbortController().signal)).toContain('hello');
  });
  it('404 and 500 -> UNREACHABLE (AC-6)', async () => {
    expect(await code(fetcher.fetch(`${base}/404`, new AbortController().signal))).toBe('UNREACHABLE');
    expect(await code(fetcher.fetch(`${base}/500`, new AbortController().signal))).toBe('UNREACHABLE');
  });
  it('connection refused -> UNREACHABLE (AC-6)', async () => {
    expect(await code(fetcher.fetch('http://127.0.0.1:1/x', new AbortController().signal))).toBe('UNREACHABLE');
  });
  it('non-HTML content type -> NO_RECIPE_FOUND', async () => {
    expect(await code(fetcher.fetch(`${base}/json`, new AbortController().signal))).toBe('NO_RECIPE_FOUND');
  });
  it('body above 2 MB -> UNREACHABLE', async () => {
    expect(await code(fetcher.fetch(`${base}/big`, new AbortController().signal))).toBe('UNREACHABLE');
  });
  it('an aborted signal rejects (AC-21)', async () => {
    const ac = new AbortController();
    const p = fetcher.fetch(`${base}/slow`, ac.signal);
    setTimeout(() => ac.abort(), 50);
    await expect(p).rejects.toThrow();
  });
  it('non-http(s) URL -> INVALID_URL', async () => {
    expect(await code(fetcher.fetch('file:///etc/passwd', new AbortController().signal))).toBe('INVALID_URL');
    expect(await code(fetcher.fetch('not a url', new AbortController().signal))).toBe('INVALID_URL');
  });
});
