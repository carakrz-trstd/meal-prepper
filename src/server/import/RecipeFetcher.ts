export type ImportErrorCode = 'UNREACHABLE' | 'NO_RECIPE_FOUND' | 'INVALID_URL';

export class ImportError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

const MAX_BYTES = 2 * 1024 * 1024;

export interface PageFetcher {
  fetch(url: string, signal: AbortSignal): Promise<string>;
}

/** Fetches a recipe page: http/https only, 2 MB cap, abortable via the shared deadline signal (AD-7). */
export class RecipeFetcher implements PageFetcher {
  async fetch(url: string, signal: AbortSignal): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ImportError('INVALID_URL', 'This is not a valid web address.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ImportError('INVALID_URL', 'Only http and https addresses can be imported.');
    }

    let res: Response;
    try {
      res = await fetch(parsed, {
        signal,
        redirect: 'follow',
        headers: { 'user-agent': 'MealPlanner/0.1 (recipe import)', accept: 'text/html,application/xhtml+xml' },
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new ImportError('UNREACHABLE', 'The page could not be reached.');
    }

    if (!res.ok) throw new ImportError('UNREACHABLE', `The page answered with status ${res.status}.`);
    const type = res.headers.get('content-type') ?? '';
    if (!/html|xml/i.test(type)) throw new ImportError('NO_RECIPE_FOUND', 'The address is not a web page.');

    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        if (signal.aborted) throw e;
        throw new ImportError('UNREACHABLE', 'The page could not be read completely.');
      }
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new ImportError('UNREACHABLE', 'The page is too large.');
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
