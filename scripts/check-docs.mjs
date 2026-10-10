#!/usr/bin/env node
// Every change to the product must be recorded. Compares the branch (plus uncommitted and
// untracked files) against a base ref and:
//   - fails when code, data or config changed but CHANGELOG.md did not;
//   - warns when user-facing code changed but README.md did not (README = feature reference).
// City coverage (docs/CITIES.md) is checked separately by `wayfarer_pipeline cities-doc --check`.
//   node scripts/check-docs.mjs [base]    base defaults to origin/dev (CI passes the PR base)
import { execFileSync } from 'node:child_process';

const base = process.argv[2] ?? 'origin/dev';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const lines = (s) => s.split('\n').filter(Boolean);

const mergeBase = git('merge-base', base, 'HEAD');
const changed = [
  ...new Set([
    ...lines(git('diff', '--name-only', mergeBase)),
    ...lines(git('ls-files', '--others', '--exclude-standard')),
  ]),
];

/** Anything that changes what ships: app, shared logic, backend, data, pipeline, tooling. */
const RECORDED =
  /^(apps\/|packages\/|supabase\/|data-pipeline\/|scripts\/|\.github\/|package\.json$|pnpm-workspace\.yaml$|turbo\.json$|\.env\.example$)/;
/** Files whose changes usually alter documented behaviour (README → Features / Backend / Limits). */
const USER_FACING =
  /^(apps\/mobile\/src\/app\/|apps\/mobile\/src\/features\/|packages\/shared\/src\/(constants|schemas|domain|i18n)\/|supabase\/functions\/(?!_shared\/wayfarer\/)|supabase\/migrations\/|\.env\.example$)/;
const isTest = (f) => /(\.test\.|__tests__\/|\/tests\/|\/e2e\/)/.test(f);

const recorded = changed.filter((f) => RECORDED.test(f));
const userFacing = changed.filter((f) => USER_FACING.test(f) && !isTest(f));
const has = (f) => changed.includes(f);

let failed = false;
if (recorded.length && !has('CHANGELOG.md')) {
  failed = true;
  console.error(
    `::error file=CHANGELOG.md::${recorded.length} changed file(s) but CHANGELOG.md was not ` +
      'updated. Add an entry under "Unreleased" (see CLAUDE.md).',
  );
  for (const f of recorded.slice(0, 20)) console.error(`  - ${f}`);
}
if (userFacing.length && !has('README.md')) {
  console.warn(
    '::warning file=README.md::user-facing code changed but README.md did not. ' +
      'If behaviour, screens, functions or limits changed, update README → Features.',
  );
  for (const f of userFacing.slice(0, 20)) console.warn(`  - ${f}`);
}

if (failed) process.exit(1);
console.log(`OK: ${changed.length} changed file(s) vs ${base}; changes are recorded.`);
