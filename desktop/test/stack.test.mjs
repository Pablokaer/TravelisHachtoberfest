import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { resolveLayout } from '../src/layout.mjs';
import { provisionStack } from '../src/provision.mjs';
import { Stack, StackError } from '../src/stack.mjs';

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'travelist-desktop-'));
  const resources = join(root, 'resources');
  const userData = join(root, 'user');
  mkdirSync(join(resources, 'stack', 'supabase', 'migrations'), { recursive: true });
  writeFileSync(join(resources, 'stack', 'supabase', 'config.toml'), "project_id = 'wayfarer'\n");
  writeFileSync(join(resources, 'stack', 'supabase', 'migrations', '1.sql'), 'select 1;');
  writeFileSync(
    join(resources, 'stack', '.env.example'),
    'SEND_EMAIL_HOOK_SECRET=local\nSERPAPI_API_KEY=\n',
  );
  const layout = resolveLayout({
    packaged: true,
    resourcesPath: resources,
    appPath: join(resources, 'app.asar'),
    userData,
    platform: 'linux',
  });
  return { root, layout };
}

test('the first start copies the Supabase project and writes the merged .env', async () => {
  const { layout } = sandbox();
  const { env } = await provisionStack({ layout, version: '1.0.0' });
  assert.ok(existsSync(join(layout.stackDir, 'supabase', 'config.toml')));
  assert.equal(env.SEND_EMAIL_HOOK_SECRET, 'local');
  assert.match(readFileSync(join(layout.stackDir, '.env'), 'utf8'), /SEND_EMAIL_HOOK_SECRET=local/);
});

test('the keys the user typed win over the defaults, and are never written back to the template', async () => {
  const { layout } = sandbox();
  await provisionStack({ layout, version: '1.0.0' });
  writeFileSync(layout.envFile, 'SERPAPI_API_KEY=my-key\nOLLAMA_MODEL=gemma3:4b\n');
  const { env } = await provisionStack({ layout, version: '1.0.0' });
  assert.equal(env.SERPAPI_API_KEY, 'my-key');
  assert.equal(env.OLLAMA_MODEL, 'gemma3:4b');
  assert.match(readFileSync(join(layout.stackDir, '.env'), 'utf8'), /SERPAPI_API_KEY=my-key/);
});

test('a keys file is created for the user to edit, with every variable named and empty', async () => {
  const { layout } = sandbox();
  await provisionStack({ layout, version: '1.0.0' });
  const text = readFileSync(layout.envFile, 'utf8');
  for (const name of [
    'SERPAPI_API_KEY',
    'ELEVENLABS_API_KEY',
    'MONGODB_URI',
    'SENTRY_DSN',
    'OLLAMA_MODEL',
  ]) {
    assert.match(text, new RegExp(`^${name}=$`, 'm'));
  }
});

test('an existing keys file is left alone', async () => {
  const { layout } = sandbox();
  mkdirSync(layout.envFile.slice(0, layout.envFile.lastIndexOf('keys.env')), { recursive: true });
  writeFileSync(layout.envFile, 'SERPAPI_API_KEY=keep\n');
  await provisionStack({ layout, version: '1.0.0' });
  assert.equal(readFileSync(layout.envFile, 'utf8'), 'SERPAPI_API_KEY=keep\n');
});

test('a new app version replaces the Supabase project, a same version does not touch it', async () => {
  const { layout } = sandbox();
  await provisionStack({ layout, version: '1.0.0' });
  const stale = join(layout.stackDir, 'supabase', 'stale.txt');
  writeFileSync(stale, 'old');
  await provisionStack({ layout, version: '1.0.0' });
  assert.ok(existsSync(stale), 'same version: untouched');
  await provisionStack({ layout, version: '1.1.0' });
  assert.ok(!existsSync(stale), 'new version: replaced');
  assert.ok(existsSync(join(layout.stackDir, 'supabase', 'migrations', '1.sql')));
});

/** Records every command and answers what the test says. */
class FakeSystem {
  calls = [];
  killed = [];
  results = {};
  health = true;
  webStarted = [];

  run = async (command, args, options = {}) => {
    this.calls.push(['run', command.split(/[\\/]/).pop(), args.join(' ')]);
    for (const line of this.results[args[0]]?.lines ?? []) options.onLine?.(line);
    return this.results[args[0]] ?? { code: 0, output: '' };
  };

  spawn = (command, args, options = {}) => {
    const name = command.split(/[\\/]/).pop();
    this.calls.push(['spawn', name, args.join(' '), options.env]);
    return { kill: () => this.killed.push(name) };
  };

  httpOk = async () => this.health;
  startWeb = async (port) => {
    this.webStarted.push(port);
    return { close: () => this.killed.push('web') };
  };
}

function stackWith(system, extras = {}) {
  const { layout } = sandbox();
  return new Stack({
    layout,
    version: '1.0.0',
    run: system.run,
    spawn: system.spawn,
    httpOk: system.httpOk,
    startWeb: system.startWeb,
    provision: async () => ({ env: { OLLAMA_MODEL: 'gemma3:4b', SERPAPI_API_KEY: 'k' } }),
    sleep: async () => undefined,
    ...extras,
  });
}

test('start runs each step in order and reports it', async () => {
  const system = new FakeSystem();
  const steps = [];
  await stackWith(system).start((step) => steps.push(step));
  assert.deepEqual(steps, [
    'docker',
    'provision',
    'database',
    'functions',
    'service',
    'web',
    'ready',
  ]);
  assert.deepEqual(
    system.calls.map(([kind, name, args]) => `${kind}:${name} ${args.split(' ')[0]}`),
    [
      'run:docker info',
      'run:supabase start',
      'spawn:supabase functions',
      'spawn:travelist-service serve',
    ],
  );
  assert.deepEqual(system.webStarted, [8081]);
});

test('the service is started on the local port with the database, the state folder and the keys', async () => {
  const system = new FakeSystem();
  const stack = stackWith(system);
  await stack.start();
  const [, , args, env] = system.calls.find(([, name]) => name === 'travelist-service');
  assert.match(args, /--host 127\.0\.0\.1/);
  assert.match(args, /--port 8787/);
  assert.match(args, /--db-url postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres/);
  assert.match(env.TRAVELIST_STATE_DIR, /state$/);
  assert.match(env.TRAVELIST_ENV_FILE, /keys\.env$/);
  assert.equal(env.OLLAMA_MODEL, 'gemma3:4b');
  assert.equal(env.SERPAPI_API_KEY, 'k');
});

test('with Docker not running nothing else is started, and the error says what to do', async () => {
  const system = new FakeSystem();
  system.results.info = { code: 1, output: 'Cannot connect to the Docker daemon' };
  await assert.rejects(stackWith(system).start(), (error) => {
    assert.ok(error instanceof StackError);
    assert.equal(error.step, 'docker');
    assert.match(error.message, /Docker/);
    return true;
  });
  assert.equal(system.calls.length, 1);
});

test('a database that does not start is reported with the end of its output', async () => {
  const system = new FakeSystem();
  system.results.start = {
    code: 1,
    output: 'pulling images\nError: port 54322 is already allocated',
  };
  await assert.rejects(stackWith(system).start(), (error) => {
    assert.equal(error.step, 'database');
    assert.match(error.message, /port 54322 is already allocated/);
    return true;
  });
  assert.ok(!system.calls.some(([, name]) => name === 'travelist-service'));
});

test('the lines the database prints while it starts are passed on', async () => {
  const system = new FakeSystem();
  system.results.start = { code: 0, output: '', lines: ['Pulling image 1/9', 'Started'] };
  const lines = [];
  await stackWith(system, { onLog: (line) => lines.push(line) }).start();
  assert.ok(lines.includes('Pulling image 1/9'));
});

test('a city service that never answers is an error naming it', async () => {
  const system = new FakeSystem();
  system.health = false;
  let clock = 0;
  const stack = stackWith(system, {
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    serviceTimeoutMs: 200,
  });
  await assert.rejects(stack.start(), (error) => {
    assert.equal(error.step, 'service');
    return true;
  });
});

test('stop kills what was started, stops the database and can be called twice', async () => {
  const system = new FakeSystem();
  const stack = stackWith(system);
  await stack.start();
  await stack.stop();
  await stack.stop();
  assert.deepEqual([...system.killed].sort(), ['supabase', 'travelist-service', 'web']);
  const stops = system.calls.filter(([kind, , args]) => kind === 'run' && args.startsWith('stop'));
  assert.equal(stops.length, 1);
});

test('stop after a failed start is safe', async () => {
  const system = new FakeSystem();
  system.results.info = { code: 1, output: 'no docker' };
  const stack = stackWith(system);
  await assert.rejects(stack.start());
  await stack.stop();
  assert.deepEqual(system.killed, []);
});
