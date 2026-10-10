#!/usr/bin/env node
// Copies packages/shared/src into supabase/functions/_shared/wayfarer so Edge Functions can
// import it: the Supabase edge runtime only sees files under supabase/functions (D-005).
//   node scripts/sync-shared.mjs          write the copy
//   node scripts/sync-shared.mjs --check  exit 1 when the copy is stale (CI)
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'packages/shared/src');
const dest = join(root, 'supabase/functions/_shared/wayfarer');
const skip = (p) => /\.test\.ts$/.test(p);

function list(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? list(p) : [p];
  });
}

function copyTo(target) {
  rmSync(target, { recursive: true, force: true });
  cpSync(src, target, { recursive: true, filter: (p) => !skip(p) });
}

if (process.argv.includes('--check')) {
  const tmp = mkdtempSync(join(tmpdir(), 'shared-'));
  copyTo(tmp);
  const a = list(tmp)
    .map((p) => relative(tmp, p))
    .sort();
  const b = list(dest)
    .map((p) => relative(dest, p))
    .sort();
  const stale =
    a.join() !== b.join() ||
    a.some((f) => readFileSync(join(tmp, f), 'utf8') !== readFileSync(join(dest, f), 'utf8'));
  rmSync(tmp, { recursive: true, force: true });
  if (stale) {
    console.error('supabase/functions/_shared/wayfarer is stale: run `pnpm sync:shared`.');
    process.exit(1);
  }
  console.log('shared copy is up to date');
} else {
  copyTo(dest);
  console.log(`copied ${relative(root, src)} → ${relative(root, dest)}`);
}
