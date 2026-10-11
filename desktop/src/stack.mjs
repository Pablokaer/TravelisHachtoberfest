// Starts and stops everything Travelist needs on the user's machine (D-093): the database
// (Supabase on Docker), the route functions, the city and trip-planner service and the web app.
// Every outside effect (running a program, an HTTP check, the web server) is injected, so the order
// and the failures are tested without Docker.
import { join } from 'node:path';

import { waitUntil } from './health.mjs';

/** A step that failed, with a message that tells the person what to do. */
export class StackError extends Error {
  /** @param {string} step @param {string} message */
  constructor(step, message) {
    super(message);
    this.name = 'StackError';
    this.step = step;
  }
}

const LAST_LINES = 6;
const tail = (output) => output.trim().split(/\r?\n/).slice(-LAST_LINES).join('\n');

/**
 * @typedef {object} Deps
 * @property {import('./layout.mjs').Layout} layout
 * @property {string} version
 * @property {(command: string, args: string[], options?: object) => Promise<{ code: number, output: string }>} run
 * @property {(command: string, args: string[], options?: object) => { kill: () => void }} spawn
 * @property {(url: string) => Promise<boolean>} httpOk
 * @property {(port: number) => Promise<{ close: () => void }>} startWeb
 * @property {() => Promise<{ env: Record<string, string> }>} provision
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {() => number} [now]
 * @property {(line: string) => void} [onLog]
 * @property {number} [serviceTimeoutMs]
 */

export class Stack {
  /** @param {Deps} deps */
  constructor(deps) {
    this.deps = deps;
    /** @type {{ kill: () => void }[]} */
    this.children = [];
    this.databaseStarted = false;
    this.stopped = false;
  }

  /** Runs every step; `onStep` hears each one (docker, provision, database, functions, service, web, ready). */
  async start(onStep = () => undefined) {
    onStep('docker');
    await this.#checkDocker();
    onStep('provision');
    const { env } = await this.deps.provision();
    onStep('database');
    await this.#startDatabase(env);
    onStep('functions');
    this.#startFunctions(env);
    onStep('service');
    await this.#startService(env);
    onStep('web');
    this.children.push(await this.deps.startWeb(this.deps.layout.ports.web));
    onStep('ready');
  }

  async #checkDocker() {
    const { code } = await this.deps.run('docker', ['info']);
    if (code !== 0) {
      throw new StackError(
        'docker',
        'Docker is not running. Start Docker (Docker Desktop on Windows) and try again.',
      );
    }
  }

  async #startDatabase(env) {
    const { layout, run, onLog } = this.deps;
    const { code, output } = await run(
      layout.supabaseExe,
      ['start', '--workdir', layout.stackDir],
      {
        cwd: layout.stackDir,
        env,
        onLine: onLog,
      },
    );
    if (code !== 0)
      throw new StackError('database', `The database did not start:\n${tail(output)}`);
    this.databaseStarted = true;
  }

  #startFunctions(env) {
    const { layout, spawn } = this.deps;
    const args = [
      'functions',
      'serve',
      '--env-file',
      join(layout.stackDir, '.env'),
      '--workdir',
      layout.stackDir,
    ];
    this.children.push(spawn(layout.supabaseExe, args, { cwd: layout.stackDir, env }));
  }

  async #startService(env) {
    const { layout, spawn, httpOk, sleep, now, serviceTimeoutMs = 60_000 } = this.deps;
    const args = [
      'serve',
      '--host',
      '127.0.0.1',
      '--port',
      String(layout.ports.service),
      '--db-url',
      layout.dbUrl,
    ];
    const serviceEnv = {
      ...env,
      TRAVELIST_STATE_DIR: layout.stateDir,
      TRAVELIST_ENV_FILE: layout.envFile,
    };
    this.children.push(spawn(layout.serviceExe, args, { cwd: layout.stateDir, env: serviceEnv }));
    try {
      await waitUntil(() => httpOk(`http://127.0.0.1:${layout.ports.service}/health`), {
        timeoutMs: serviceTimeoutMs,
        intervalMs: 500,
        label: 'the city service',
        sleep,
        now,
      });
    } catch (error) {
      throw new StackError('service', error.message);
    }
  }

  /** Stops the programs and the database; safe to call twice and after a failed start. */
  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    // Processes are killed, the web server is closed.
    for (const child of this.children.splice(0)) (child.kill ?? child.close).call(child);
    if (this.databaseStarted) {
      const { layout, run } = this.deps;
      await run(layout.supabaseExe, ['stop', '--workdir', layout.stackDir], {
        cwd: layout.stackDir,
      }).catch(() => undefined);
    }
  }
}
