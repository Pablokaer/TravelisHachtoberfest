// What `--smoke` checks (D-093): the install holds every part and the two programs run. It does
// not need Docker, so CI runners without it can still prove the package is sound.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {import('./layout.mjs').Layout} layout
 * @param {(command: string, args: string[]) => Promise<{ code: number, output: string }>} run
 * @returns {Promise<string[]>} the problems found; empty when the package is sound
 * @example const problems = await checkPackage(layout, runToEnd)
 */
export async function checkPackage(layout, run) {
  const parts = [
    join(layout.webDir, 'index.html'),
    join(layout.stackTemplate, 'supabase', 'config.toml'),
    layout.serviceExe,
    layout.supabaseExe,
  ];
  const problems = parts.filter((part) => !existsSync(part)).map((part) => `missing: ${part}`);
  if (problems.length > 0) return problems;
  const probes = [
    [layout.serviceExe, ['--help']],
    [layout.supabaseExe, ['--version']],
  ];
  for (const [command, args] of probes) {
    const { code, output } = await run(command, args);
    if (code !== 0)
      problems.push(`${command} ${args.join(' ')} exited ${code}: ${output.trim().slice(-300)}`);
  }
  return problems;
}
