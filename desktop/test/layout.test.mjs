import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseEnv } from '../src/env-file.mjs';
import { resolveLayout } from '../src/layout.mjs';

const PACKAGED = {
  packaged: true,
  resourcesPath: join('/opt', 'Travelist', 'resources'),
  appPath: join('/opt', 'Travelist', 'resources', 'app.asar'),
  userData: join('/home', 'ana', '.config', 'Travelist'),
};

test('a packaged app reads everything from the resources folder', () => {
  const layout = resolveLayout({ ...PACKAGED, platform: 'linux' });
  assert.equal(layout.webDir, join(PACKAGED.resourcesPath, 'web'));
  assert.equal(layout.stackTemplate, join(PACKAGED.resourcesPath, 'stack'));
  assert.equal(layout.serviceExe, join(PACKAGED.resourcesPath, 'service', 'travelist-service'));
  assert.equal(layout.supabaseExe, join(PACKAGED.resourcesPath, 'bin', 'supabase'));
});

test('on Windows the programs end in .exe', () => {
  const layout = resolveLayout({ ...PACKAGED, platform: 'win32' });
  assert.ok(layout.serviceExe.endsWith('travelist-service.exe'));
  assert.ok(layout.supabaseExe.endsWith('supabase.exe'));
});

test('what the app writes goes to the user data folder, never to the install folder', () => {
  const layout = resolveLayout({ ...PACKAGED, platform: 'linux' });
  for (const writable of [layout.stackDir, layout.stateDir, layout.envFile, layout.logsDir]) {
    assert.ok(writable.startsWith(PACKAGED.userData), `${writable} is under ${PACKAGED.userData}`);
  }
});

test('an unpackaged run (development) reads the prepared resources folder of the project', () => {
  const layout = resolveLayout({
    packaged: false,
    resourcesPath: '/ignored',
    appPath: join('/repo', 'desktop'),
    userData: PACKAGED.userData,
    platform: 'linux',
  });
  assert.equal(layout.webDir, join('/repo', 'desktop', 'resources', 'web'));
});

test('the ports and the database address are fixed and local', () => {
  const layout = resolveLayout({ ...PACKAGED, platform: 'linux' });
  assert.equal(layout.ports.service, 8787);
  assert.equal(layout.ports.supabase, 54321);
  assert.equal(layout.dbUrl, 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
});

test('the env file reader keeps values, strips quotes and skips comments', () => {
  const parsed = parseEnv(
    '# note\n\nSERPAPI_API_KEY=abc\nEMAIL_FROM="Travelist <a@b.c>"\nEMPTY=\nbad line\n',
  );
  assert.deepEqual(parsed, { SERPAPI_API_KEY: 'abc', EMAIL_FROM: 'Travelist <a@b.c>', EMPTY: '' });
});

test('the env file reader copes with Windows line endings and = inside a value', () => {
  assert.deepEqual(parseEnv('A=1\r\nURI=mongodb+srv://u:p@h/?a=b\r\n'), {
    A: '1',
    URI: 'mongodb+srv://u:p@h/?a=b',
  });
});
