/** Spaces consecutive calls at least `minIntervalMs` apart (polite scraping). Safe for concurrent callers. */
export class RateLimiter {
  private nextSlot = 0;
  constructor(private readonly minIntervalMs: number) {}

  async wait(signal?: AbortSignal): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    const now = Date.now();
    const start = Math.max(now, this.nextSlot);
    this.nextSlot = start + this.minIntervalMs;
    const delay = start - now;
    if (delay <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, delay);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(signal.reason ?? new Error('aborted'));
      }, { once: true });
    });
  }
}

export const USER_AGENT = 'MealPlanner/0.1 (personal recipe app; estimates)';
