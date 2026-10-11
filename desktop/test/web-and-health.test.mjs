import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { waitUntil } from '../src/health.mjs';
import { pageFor } from '../src/web-server.mjs';

const ROOT = resolve('/site');
/** A file system of exactly these files (paths relative to the site root), and their folders. */
function fsOf(files) {
  const absolute = new Set(files.map((f) => join(ROOT, f)));
  const folders = new Map();
  for (const file of absolute) {
    const folder = resolve(file, '..');
    folders.set(folder, [...(folders.get(folder) ?? []), file.slice(folder.length + 1)]);
  }
  return {
    isFile: (p) => absolute.has(p),
    list: (folder) => folders.get(folder) ?? [],
  };
}
const SITE = fsOf([
  'index.html',
  'about.html',
  'short/[slug].html',
  'short/[slug]/meetups.html',
  '_expo/app.js',
]);

test('a file that exists is served as it is', () => {
  assert.equal(pageFor(ROOT, '/_expo/app.js', SITE), join(ROOT, '_expo/app.js'));
  assert.equal(pageFor(ROOT, '/about.html', SITE), join(ROOT, 'about.html'));
});

test('a route without extension is the page exported for it', () => {
  assert.equal(pageFor(ROOT, '/about', SITE), join(ROOT, 'about.html'));
});

test('a dynamic route is served by its exported [slug] template', () => {
  assert.equal(pageFor(ROOT, '/short/lisbon', SITE), join(ROOT, 'short/[slug].html'));
});

test('a route nobody exported falls back to the app, which routes on the client', () => {
  assert.equal(pageFor(ROOT, '/nowhere/at/all', SITE), join(ROOT, 'index.html'));
  assert.equal(pageFor(ROOT, '/', SITE), join(ROOT, 'index.html'));
});

test('a query string and a hash are ignored', () => {
  assert.equal(pageFor(ROOT, '/about?x=1#top', SITE), join(ROOT, 'about.html'));
});

test('a path that climbs out of the site is never served', () => {
  for (const attack of ['/../secret.txt', '/..%2f..%2fetc/passwd', '/%2e%2e/%2e%2e/boot.ini']) {
    const served = pageFor(ROOT, attack, fsOf(['index.html', '../secret.txt']));
    assert.ok(served.startsWith(ROOT), `${attack} -> ${served}`);
  }
});

test('waitUntil returns as soon as the check passes', async () => {
  let calls = 0;
  await waitUntil(async () => ++calls >= 3, { timeoutMs: 1000, intervalMs: 1, label: 'x' });
  assert.equal(calls, 3);
});

test('waitUntil gives up with the name of what it waited for and the time', async () => {
  let now = 0;
  await assert.rejects(
    waitUntil(async () => false, {
      timeoutMs: 100,
      intervalMs: 10,
      label: 'the city service',
      sleep: async (ms) => {
        now += ms;
      },
      now: () => now,
    }),
    /the city service.*100 ms/,
  );
});

test('waitUntil keeps going when a check throws, like a server that is not up yet', async () => {
  let calls = 0;
  await waitUntil(
    async () => {
      if (++calls < 3) throw new Error('ECONNREFUSED');
      return true;
    },
    { timeoutMs: 1000, intervalMs: 1, label: 'x' },
  );
  assert.equal(calls, 3);
});
