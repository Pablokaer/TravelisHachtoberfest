// Gathers what the installer carries into desktop/resources (D-093):
//   node scripts/prepare.mjs --web <export dir> --service <PyInstaller dir> --supabase-bin <file>
// The Supabase project template is taken from the repository (tests and local state left out).
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const repo = resolve(desktop, '..');
const out = join(desktop, 'resources');

function argument(name) {
  const at = process.argv.indexOf(`--${name}`);
  const value = at === -1 ? undefined : process.argv[at + 1];
  if (!value || !existsSync(value)) {
    throw new Error(`--${name} must be an existing path, got ${JSON.stringify(value)}`);
  }
  return resolve(value);
}

function copyInto(from, to, filter) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, filter });
}

const SKIPPED_IN_TEMPLATE = ['tests', '.temp', '.branches'];
const keepInTemplate = (path) => !SKIPPED_IN_TEMPLATE.includes(basename(path));

rmSync(out, { recursive: true, force: true });
copyInto(argument('web'), join(out, 'web'));
copyInto(argument('service'), join(out, 'service'));
const binary = argument('supabase-bin');
copyInto(binary, join(out, 'bin', basename(binary)));
if (process.platform !== 'win32') chmodSync(join(out, 'bin', basename(binary)), 0o755);
copyInto(join(repo, 'supabase'), join(out, 'stack', 'supabase'), keepInTemplate);
copyInto(join(repo, '.env.example'), join(out, 'stack', '.env.example'));
console.log(`resources ready in ${out}`);
