import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { resolveLayout } from '../src/layout.mjs';
import { checkPackage } from '../src/package-check.mjs';

function installed(missing = []) {
  const resources = mkdtempSync(join(tmpdir(), 'travelist-pkg-'));
  const layout = resolveLayout({
    packaged: true,
    resourcesPath: resources,
    appPath: resources,
    userData: resources,
    platform: 'linux',
  });
  const files = [
    join(layout.webDir, 'index.html'),
    join(layout.stackTemplate, 'supabase', 'config.toml'),
    layout.serviceExe,
    layout.supabaseExe,
  ];
  for (const file of files.filter((f) => !missing.some((m) => f.endsWith(m)))) {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, 'x');
  }
  return layout;
}

const answers = async () => ({ code: 0, output: 'ok' });

test('a complete install passes', async () => {
  assert.deepEqual(await checkPackage(installed(), answers), []);
});

test('every missing part is named', async () => {
  const problems = await checkPackage(installed(['index.html', 'config.toml']), answers);
  assert.equal(problems.length, 2);
  assert.match(problems.join('\n'), /index\.html/);
  assert.match(problems.join('\n'), /config\.toml/);
});

test('a program that does not run is reported with its output', async () => {
  const problems = await checkPackage(installed(), async () => ({ code: 127, output: 'bad ELF' }));
  assert.equal(problems.length, 2);
  assert.match(problems[0], /bad ELF/);
});
