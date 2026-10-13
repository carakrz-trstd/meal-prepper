/** Replaceable source of recipe page URLs for a search query (NFR-4). */
export interface SearchEngineAdapter {
  readonly name: string;
  /** Result URLs, best first. Throws SearchBlockedError on a captcha/block, SearchFailedError otherwise. */
  search(query: string, signal: AbortSignal): Promise<string[]>;
}

/** The site asked for a captcha or refused the request: the caller may try the fallback source (AC-27). */
export class SearchBlockedError extends Error {
  constructor(message = 'The search was blocked.') {
    super(message);
    this.name = 'SearchBlockedError';
  }
}

/** The search could not be done (network, server error, unexpected page): no fallback, the user is told (AC-19). */
export class SearchFailedError extends Error {
  constructor(message = 'The search failed.') {
    super(message);
    this.name = 'SearchFailedError';
  }
}

export interface AdapterOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  accept: 'text/html,application/xhtml+xml',
};
