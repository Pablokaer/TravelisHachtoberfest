// The real outside effects the Stack needs (D-093): running programs and one HTTP check.
import { spawn as nodeSpawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const OUTPUT_KEPT = 8000;
// The Python service prints non-ASCII text (its help has arrows); a piped Windows console is cp1252
// and would crash it (found by `--smoke`).
const childEnv = (env) => ({ ...process.env, PYTHONUTF8: '1', ...env });

/**
 * Runs a program to the end, passing each output line to `onLine`.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string>, onLine?: (line: string) => void }} [options]
 * @returns {Promise<{ code: number, output: string }>} code 127 when the program is missing
 * @example await runToEnd('docker', ['info'])
 */
export function runToEnd(command, args, { cwd, env, onLine } = {}) {
  return new Promise((resolve) => {
    let output = '';
    const child = nodeSpawn(command, args, { cwd, env: childEnv(env), windowsHide: true });
    const collect = (stream) =>
      createInterface({ input: stream }).on('line', (line) => {
        output = (output + line + '\n').slice(-OUTPUT_KEPT);
        onLine?.(line);
      });
    collect(child.stdout);
    collect(child.stderr);
    child.on('error', (error) => resolve({ code: 127, output: `${command}: ${error.message}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

/**
 * Starts a long-running program whose output goes to a log file.
 * @param {string} logsDir
 * @returns {(command: string, args: string[], options?: { cwd?: string, env?: Record<string, string> }) => { kill: () => void }}
 * @example const spawn = spawnLogged(layout.logsDir)
 */
export function spawnLogged(logsDir) {
  return (command, args, { cwd, env } = {}) => {
    const name = command
      .split(/[\\/]/)
      .pop()
      .replace(/\.exe$/, '');
    const log = createWriteStream(join(logsDir, `${name}.log`), { flags: 'a' });
    const child = nodeSpawn(command, args, { cwd, env: childEnv(env), windowsHide: true });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('error', (error) => log.write(`${command}: ${error.message}\n`));
    return { kill: () => child.kill() };
  };
}

/** True when the URL answers 2xx; a server that is not up is `false`, not an error. */
export async function httpOk(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}
