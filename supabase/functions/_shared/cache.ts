// Response cache over `public.api_cache` (key text PK, value jsonb, expires_at timestamptz), with
// a small in-isolate memory in front of it (D-054). Cache failures are logged and never fail the
// request: the fetcher result is returned anyway. Table writes run after the response, and a
// failed background refresh is not retried for a cool-down (D-063).
import type { SupabaseClient } from '@supabase/supabase-js';

import { CircuitBreaker } from './breaker.ts';

/** A stored value and when it stops being fresh. */
export type CacheEntry = { value: unknown; expiresAt: Date };

export interface CacheStore {
  /** The entry for `key`, fresh or expired; undefined when there is none. */
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, value: unknown, expiresAt: Date): Promise<void>;
  /** Deletes the entries that expired before `before`. */
  purgeExpired(before: Date): Promise<void>;
}

/** TTL in seconds, or a function of the fetched value (≤ 0 means "do not store"). */
export type Ttl<T> = number | ((value: T) => number);

/**
 * `staleFor`: seconds after expiry during which the old value is still answered, at once, while a
 * fresh one is fetched in the background — for sources too slow to wait for (the GAC advisory
 * index takes 1–12 s).
 */
export type CacheOptions = { staleFor?: number };

export type Cached = <T>(
  key: string,
  ttl: Ttl<T>,
  fetcher: () => Promise<T>,
  options?: CacheOptions,
) => Promise<T>;

/** Longest `staleFor` honoured: expired rows are kept this long before they are purged. */
export const MAX_STALE_SECONDS = 30 * 24 * 3600;

/**
 * After a background refresh fails, the stale value is answered from memory — without reading
 * the table or calling the source again — for this long. An upstream down for days (the GAC
 * advisory index, 20 s timeout) is then retried a few times an hour per isolate, not on every
 * request; the stale value stays valid for days (`staleFor`), so nothing is lost by waiting.
 */
export const REFRESH_COOL_DOWN_SECONDS = 300;

/** Entries one isolate keeps in memory between requests (FX pairs, the advisory index, …). */
const MEMORY_ENTRIES = 256;

/** Pass-through cache (tests, or when no store is available). */
export const noCache: Cached = (_key, _ttl, fetcher) => fetcher();

/** Stable JSON: object keys sorted recursively, so equal inputs hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `${namespace}:${sha256(stable JSON of the normalised input)}`. */
export async function cacheKey(namespace: string, input: unknown): Promise<string> {
  return `${namespace}:${await sha256Hex(stableStringify(input))}`;
}

/** Work to finish after the response has been sent. */
export type Background = (task: Promise<unknown>) => void;

/** Supabase's `EdgeRuntime.waitUntil` when running there; elsewhere the task just runs. */
export const runtimeBackground: Background = (task) => {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime;
  if (runtime) runtime.waitUntil(task);
  else void task.catch(() => undefined);
};

/** A bounded map of the entries this isolate has seen (the oldest is dropped first). */
class MemoryCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(key: string): CacheEntry | undefined {
    return this.entries.get(key);
  }

  set(key: string, entry: CacheEntry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    const oldest = this.entries.keys().next().value;
    if (this.entries.size > MEMORY_ENTRIES && oldest !== undefined) this.entries.delete(oldest);
  }
}

type CachedOptions = {
  now?: () => Date;
  purgeProbability?: number;
  random?: () => number;
  background?: Background;
};

const isFresh = (entry: CacheEntry, at: number) => entry.expiresAt.getTime() > at;

/** True when an expired entry may still be answered while a fresh one is fetched. */
function isServableStale(entry: CacheEntry, at: number, staleFor = 0): boolean {
  const limit = Math.min(staleFor, MAX_STALE_SECONDS) * 1000;
  return limit > 0 && at - entry.expiresAt.getTime() <= limit;
}

/** Fetches, stores (table and memory) and returns a value; one fetch per key at a time. */
function createRefresher(store: CacheStore, memory: MemoryCache, opts: Required<CachedOptions>) {
  const inflight = new Map<string, Promise<unknown>>();

  /** Writes the table row (and sometimes purges); never rejects — failures are only logged. */
  async function persist(key: string, value: unknown, expiresAt: Date, at: Date): Promise<void> {
    try {
      await store.set(key, value, expiresAt);
      const before = new Date(at.getTime() - MAX_STALE_SECONDS * 1000);
      if (opts.random() < opts.purgeProbability) await store.purgeExpired(before);
    } catch (err) {
      console.warn(`cache write failed for ${key}:`, err);
    }
  }

  // Memory is set at once (this isolate answers from it next time); the table write runs after
  // the response, so no cache miss waits for the upsert (and the occasional purge) as well.
  function remember(key: string, value: unknown, seconds: number): void {
    const at = opts.now();
    const expiresAt = new Date(at.getTime() + seconds * 1000);
    memory.set(key, { value, expiresAt });
    opts.background(persist(key, value, expiresAt, at));
  }

  async function fetchAndStore<T>(key: string, ttl: Ttl<T>, fetcher: () => Promise<T>) {
    const value = await fetcher();
    const seconds = typeof ttl === 'function' ? ttl(value) : ttl;
    if (seconds > 0) remember(key, value, seconds);
    return value;
  }

  return <T>(key: string, ttl: Ttl<T>, fetcher: () => Promise<T>): Promise<T> => {
    const running = inflight.get(key);
    if (running) return running as Promise<T>;
    const task = fetchAndStore(key, ttl, fetcher).finally(() => inflight.delete(key));
    inflight.set(key, task);
    return task;
  };
}

/** The freshest entry known: this isolate's when fresh, else the table's (else a stale one). */
async function lookup(store: CacheStore, memory: MemoryCache, key: string, at: number) {
  const remembered = memory.get(key);
  if (remembered && isFresh(remembered, at)) return remembered;
  try {
    const stored = await store.get(key);
    if (stored) memory.set(key, stored);
    return stored ?? remembered;
  } catch (err) {
    console.warn(`cache read failed for ${key}:`, err);
    return remembered;
  }
}

/**
 * This isolate's entry when it may be answered without the table: fresh, or stale-but-servable
 * while a failed refresh of `key` cools down (the table would only hold the same stale row).
 */
function answerableFromMemory(
  memory: MemoryCache,
  breaker: CircuitBreaker,
  key: string,
  at: number,
  staleFor?: number,
): CacheEntry | undefined {
  const remembered = memory.get(key);
  if (!remembered) return undefined;
  if (isFresh(remembered, at)) return remembered;
  const coolingDown = breaker.isOpen(key) && isServableStale(remembered, at, staleFor);
  return coolingDown ? remembered : undefined;
}

/** Runs a refresh after the response; a failure starts that key's cool-down (no retry until). */
function refreshAfterResponse(background: Background, failedRefreshes: CircuitBreaker) {
  return (key: string, run: () => Promise<unknown>): void =>
    background(
      run().catch((err) => {
        failedRefreshes.trip(key);
        console.warn(`refresh of ${key} failed; retrying after the cool-down:`, err);
      }),
    );
}

/**
 * The cache the Edge Functions use: memory, then `api_cache`, then the fetcher. With `staleFor`,
 * an expired value is answered at once and refreshed in the background.
 * @example const rate = await cached('fx:…', 86_400, fetchRate, { staleFor: 7 * 86_400 });
 */
export function createCached(store: CacheStore, opts: CachedOptions = {}): Cached {
  const now = opts.now ?? (() => new Date());
  const background = opts.background ?? runtimeBackground;
  const memory = new MemoryCache();
  const failedRefreshes = new CircuitBreaker(REFRESH_COOL_DOWN_SECONDS, () => now().getTime());
  const refresh = createRefresher(store, memory, {
    now,
    purgeProbability: opts.purgeProbability ?? 0.02,
    random: opts.random ?? Math.random,
    background,
  });
  const refreshLater = refreshAfterResponse(background, failedRefreshes);

  return async <T>(key: string, ttl: Ttl<T>, fetcher: () => Promise<T>, options?: CacheOptions) => {
    const at = now().getTime();
    const warm = answerableFromMemory(memory, failedRefreshes, key, at, options?.staleFor);
    if (warm) return warm.value as T;
    const entry = await lookup(store, memory, key, at);
    if (entry && isFresh(entry, at)) return entry.value as T;
    if (!entry || !isServableStale(entry, at, options?.staleFor)) {
      return await refresh(key, ttl, fetcher);
    }
    refreshLater(key, () => refresh(key, ttl, fetcher));
    return entry.value as T;
  };
}

export function supabaseCacheStore(client: SupabaseClient): CacheStore {
  return {
    async get(key) {
      const { data, error } = await client
        .from('api_cache')
        .select('value, expires_at')
        .eq('key', key)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { value: data.value as unknown, expiresAt: new Date(data.expires_at) }
        : undefined;
    },
    async set(key, value, expiresAt) {
      const { error } = await client
        .from('api_cache')
        .upsert({
          key,
          value,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        });
      if (error) throw error;
    },
    async purgeExpired(before) {
      const { error } = await client.from('api_cache').delete().lt(
        'expires_at',
        before.toISOString(),
      );
      if (error) throw error;
    },
  };
}
