import { assertEquals, assertMatch } from 'jsr:@std/assert@1';

import {
  cacheKey,
  type CacheStore,
  createCached,
  MAX_STALE_SECONDS,
  REFRESH_COOL_DOWN_SECONDS,
  stableStringify,
} from './cache.ts';

/** In-memory `api_cache` stand-in that counts reads, so tests can tell which layer answered. */
class FakeCacheTable implements CacheStore {
  rows = new Map<string, { value: unknown; expiresAt: Date }>();
  reads = 0;
  purgedBefore: Date | null = null;
  constructor(private readonly failing = false) {}
  get(key: string) {
    this.reads++;
    if (this.failing) return Promise.reject(new Error('db down'));
    return Promise.resolve(this.rows.get(key));
  }
  set(key: string, value: unknown, expiresAt: Date) {
    if (this.failing) return Promise.reject(new Error('db down'));
    this.rows.set(key, { value, expiresAt });
    return Promise.resolve();
  }
  purgeExpired(before: Date) {
    this.purgedBefore = before;
    for (const [k, r] of this.rows) if (r.expiresAt < before) this.rows.delete(k);
    return Promise.resolve();
  }
}

/** A table whose writes hang until the test releases them (a slow `api_cache` upsert). */
class SlowWriteTable extends FakeCacheTable {
  private release: () => void = () => undefined;
  private readonly released = new Promise<void>((resolve) => (this.release = resolve));
  override async set(key: string, value: unknown, expiresAt: Date) {
    await this.released;
    return super.set(key, value, expiresAt);
  }
  finishWrites = () => this.release();
}

/** Collects the work `cached` hands to the runtime to finish after the response. */
class FakeBackground {
  tasks: Promise<unknown>[] = [];
  run = (task: Promise<unknown>) => void this.tasks.push(task);
  /** Waits for every task, including the ones queued by tasks (a refresh queues its write). */
  settle = async () => {
    for (let done = 0; done < this.tasks.length; done = this.tasks.length) {
      await Promise.all(this.tasks);
    }
  };
}

/** Resolves to `marker` after `ms` unless cancelled — to tell "answered" from "still waiting". */
function after<T>(ms: number, marker: T) {
  let id: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<T>((resolve) => (id = setTimeout(() => resolve(marker), ms)));
  return { promise, cancel: () => clearTimeout(id) };
}

Deno.test('stableStringify sorts keys recursively', () => {
  assertEquals(
    stableStringify({ b: 1, a: { d: [1, { f: 2, e: 1 }], c: null } }),
    stableStringify({
      a: { c: null, d: [1, { e: 1, f: 2 }] },
      b: 1,
    }),
  );
});

Deno.test('cacheKey is namespaced sha256', async () => {
  assertMatch(await cacheKey('fx', { from: 'BRL', to: 'EUR' }), /^fx:[0-9a-f]{64}$/);
  assertEquals(await cacheKey('x', { a: 1, b: 2 }), await cacheKey('x', { b: 2, a: 1 }));
});

Deno.test('cached: hit, expiry, ttl function and purge', async () => {
  const table = new FakeCacheTable();
  let t = new Date('2026-09-27T00:00:00Z');
  let n = 0;
  const background = new FakeBackground();
  const cached = createCached(table, { now: () => t, random: () => 0, background: background.run });
  const fetcher = () => Promise.resolve(++n);
  assertEquals(await cached('k', 60, fetcher), 1);
  assertEquals(await cached('k', 60, fetcher), 1);
  t = new Date(t.getTime() + 61_000);
  assertEquals(await cached('k', 60, fetcher), 2);
  // ttl ≤ 0 → not stored
  assertEquals(await cached('skip', () => 0, fetcher), 3);
  await background.settle();
  assertEquals(table.rows.has('skip'), false);
  // Purging keeps entries that may still be served stale.
  assertEquals(table.purgedBefore, new Date(t.getTime() - MAX_STALE_SECONDS * 1000));
});

Deno.test('cached: store errors are swallowed', async () => {
  const background = new FakeBackground();
  const cached = createCached(new FakeCacheTable(true), { background: background.run });
  assertEquals(await cached('k', 60, () => Promise.resolve('fresh')), 'fresh');
  await background.settle(); // the failed write does not reject the runtime's task either
});

Deno.test('cached: a miss is answered without waiting for the table write', async () => {
  const table = new SlowWriteTable();
  const background = new FakeBackground();
  const cached = createCached(table, { background: background.run });
  const timeout = after(200, 'still waiting for the write');
  const answer = await Promise.race([cached('k', 60, () => Promise.resolve('v')), timeout.promise]);
  timeout.cancel();
  assertEquals(answer, 'v');
  assertEquals(table.rows.has('k'), false, 'the write is still running');
  table.finishWrites();
  await background.settle();
  assertEquals(table.rows.get('k')?.value, 'v');
});

Deno.test('cached: a warm entry is answered from memory, without reading the table again', async () => {
  const table = new FakeCacheTable();
  const cached = createCached(table);
  await cached('fx', 60, () => Promise.resolve('rate'));
  const reads = table.reads;
  assertEquals(await cached('fx', 60, () => Promise.resolve('other')), 'rate');
  assertEquals(table.reads, reads);
});

Deno.test('cached: an expired entry within staleFor is answered at once and refreshed after', async () => {
  const table = new FakeCacheTable();
  table.rows.set('advisory', { value: 'old', expiresAt: new Date('2026-09-26T00:00:00Z') });
  const background = new FakeBackground();
  const cached = createCached(table, {
    now: () => new Date('2026-09-27T00:00:00Z'),
    background: background.run,
  });
  const slowSource = () => Promise.resolve('new');
  assertEquals(await cached('advisory', 3600, slowSource, { staleFor: 7 * 86400 }), 'old');
  await background.settle();
  assertEquals(table.rows.get('advisory')?.value, 'new');
});

Deno.test('cached: a failed stale refresh is not retried (nor the table re-read) for a cool-down', async () => {
  const table = new FakeCacheTable();
  table.rows.set('advisory', { value: 'old', expiresAt: new Date('2026-09-26T00:00:00Z') });
  const background = new FakeBackground();
  let t = new Date('2026-09-27T00:00:00Z');
  const cached = createCached(table, { now: () => t, background: background.run });
  let attempts = 0;
  const downSource = () => Promise.reject(new Error(`attempt ${++attempts}: source down`));
  const ask = () => cached('advisory', 3600, downSource, { staleFor: 7 * 86400 });
  assertEquals(await ask(), 'old');
  await background.settle();
  const reads = table.reads;
  assertEquals(await ask(), 'old');
  await background.settle();
  assertEquals([attempts, table.reads], [1, reads], 'answered from memory, no new refresh');
  t = new Date(t.getTime() + REFRESH_COOL_DOWN_SECONDS * 1000);
  assertEquals(await ask(), 'old');
  await background.settle();
  assertEquals(attempts, 2, 'tried again after the cool-down');
});

Deno.test('cached: an entry older than staleFor is fetched before answering', async () => {
  const table = new FakeCacheTable();
  table.rows.set('advisory', { value: 'old', expiresAt: new Date('2026-09-01T00:00:00Z') });
  const cached = createCached(table, { now: () => new Date('2026-09-27T00:00:00Z') });
  assertEquals(
    await cached('advisory', 3600, () => Promise.resolve('new'), { staleFor: 86400 }),
    'new',
  );
});

Deno.test('cached: concurrent misses of one key fetch it once', async () => {
  let fetches = 0;
  const cached = createCached(new FakeCacheTable());
  const source = () => Promise.resolve(++fetches);
  const answers = await Promise.all([cached('k', 60, source), cached('k', 60, source)]);
  assertEquals(answers, [1, 1]);
  assertEquals(fetches, 1);
});
