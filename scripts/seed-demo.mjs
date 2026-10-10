#!/usr/bin/env node
// Loads the demo community (accounts, reviews, walk lists) of one city into the LOCAL Supabase
// database, then runs that city's self-check. Local only by construction: it pipes the SQL into
// the `supabase start` Postgres container, so it can never reach a hosted project.
// `supabase db query` is not used because it rejects multi-statement files.
//   node scripts/seed-demo.mjs amsterdam
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const demoDir = join(root, 'supabase/demo');

function localDbContainer() {
  const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (!projectId) throw new Error('supabase/config.toml has no project_id = "<name>" line');
  return `supabase_db_${projectId}`;
}

function demoFiles(city) {
  const files = ['accounts.sql', `${city}.sql`, `${city}.check.sql`].map((f) => join(demoDir, f));
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length > 0) {
    throw new Error(`no demo data for city "${city}": missing ${missing.join(', ')}`);
  }
  return files;
}

function runSql(container, file) {
  execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1'],
    { input: readFileSync(file), stdio: ['pipe', 'inherit', 'inherit'] },
  );
}

const city = process.argv[2];
if (!city || !/^[a-z0-9-]+$/.test(city)) {
  console.error(`usage: pnpm db:demo <city-slug>   (got "${city ?? ''}")`);
  process.exit(1);
}
const container = localDbContainer();
for (const file of demoFiles(city)) runSql(container, file);
console.log(
  `Demo community for ${city} loaded. Sign in as emma@demo-wayfarer.example.com / wayfarer-demo.`,
);
