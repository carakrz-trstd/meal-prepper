import { SearchBlockedError, SearchFailedError, type SearchEngineAdapter } from './SearchEngineAdapter';

/**
 * Tries the primary source (google.com); only when it reports a captcha or block does the fallback source
 * (allrecipes.com) take over, within the same signal/deadline (AC-27). Other failures are not retried.
 */
export class FallbackSearch implements SearchEngineAdapter {
  readonly name: string;

  constructor(
    private readonly primary: SearchEngineAdapter,
    private readonly fallback: SearchEngineAdapter,
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async search(query: string, signal: AbortSignal): Promise<string[]> {
    try {
      return await this.primary.search(query, signal);
    } catch (e) {
      if (!(e instanceof SearchBlockedError)) throw e;
    }
    try {
      return await this.fallback.search(query, signal);
    } catch (e) {
      if (signal.aborted || e instanceof SearchFailedError) throw e;
      throw new SearchFailedError(`${this.fallback.name} failed: ${(e as Error).message}`);
    }
  }
}
