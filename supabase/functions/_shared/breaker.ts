// Per-isolate circuit breaker (D-063): after an upstream outage, a name (a provider, a cache key)
// is skipped for a cool-down instead of being waited on by every request. State lives in the
// isolate's memory only — each isolate learns of an outage from its own first failed call.
import { HttpError } from './http.ts';

/**
 * True for failures that say "the service is down or busy right now": 429, 5xx and timeouts.
 * A 4xx such as 403 (quota) or a malformed answer is not retried sooner by waiting a minute.
 * @example isUpstreamOutage(new HttpError(url, 503, '')) // true
 */
export function isUpstreamOutage(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return err instanceof DOMException && err.name === 'TimeoutError';
}

/**
 * Remembers, per name, until when calls are skipped.
 * @example
 * const breaker = new CircuitBreaker(60);
 * await breaker.run('ors:optimize', () => ors.optimize(stops, true), isUpstreamOutage);
 */
export class CircuitBreaker {
  private readonly openUntil = new Map<string, number>();

  constructor(
    private readonly coolDownSeconds: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** True while `name` is cooling down after a trip. */
  isOpen(name: string): boolean {
    const until = this.openUntil.get(name);
    if (until === undefined) return false;
    if (this.now() < until) return true;
    this.openUntil.delete(name);
    return false;
  }

  /** Starts (or restarts) the cool-down of `name`. */
  trip(name: string): void {
    this.openUntil.set(name, this.now() + this.coolDownSeconds * 1000);
  }

  /** Calls `task` unless `name` is open (then rejects at once); trips it when `tripsOn(err)`. */
  async run<T>(
    name: string,
    task: () => Promise<T>,
    tripsOn: (err: unknown) => boolean,
  ): Promise<T> {
    if (this.isOpen(name)) {
      const until = new Date(this.openUntil.get(name)!).toISOString();
      throw new Error(`${name} skipped: cooling down after an outage until ${until}`);
    }
    try {
      return await task();
    } catch (err) {
      if (tripsOn(err)) this.trip(name);
      throw err;
    }
  }
}
