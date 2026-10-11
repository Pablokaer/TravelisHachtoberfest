// Gets the user's data folder ready before the stack starts (D-093): a writable copy of the
// Supabase project (the install folder is read-only), the `.env` that project reads, and the
// keys file the user can edit. The copy is replaced when the app is updated.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseEnv } from './env-file.mjs';

const KEYS_TEMPLATE = `# Optional keys of Travelist (the file is read each time the app starts).
# Fill in the ones you have; an empty one keeps that feature off.
# Local AI model of the trip planner (ollama pull gemma3:4b first). Empty: qwen2.5:7b.
OLLAMA_MODEL=
SERPAPI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
MONGODB_URI=
MONGODB_USER=
MONGODB_PASSWORD=
SENTRY_DSN=
`;

const VERSION_MARK = '.template-version';

function readIfThere(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function serialize(variables) {
  return (
    Object.entries(variables)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'
  );
}

/**
 * @param {{ layout: import('./layout.mjs').Layout, version: string }} options
 * @returns {Promise<{ env: Record<string, string> }>} the variables the programs run with
 * @example const { env } = await provisionStack({ layout, version: app.getVersion() })
 */
export async function provisionStack({ layout, version }) {
  for (const folder of [layout.stackDir, layout.stateDir, layout.logsDir]) {
    mkdirSync(folder, { recursive: true });
  }
  const mark = join(layout.stackDir, VERSION_MARK);
  if (readIfThere(mark) !== version) {
    rmSync(join(layout.stackDir, 'supabase'), { recursive: true, force: true });
    cpSync(join(layout.stackTemplate, 'supabase'), join(layout.stackDir, 'supabase'), {
      recursive: true,
    });
    writeFileSync(mark, version);
  }
  if (!existsSync(layout.envFile)) writeFileSync(layout.envFile, KEYS_TEMPLATE);
  const defaults = parseEnv(readIfThere(join(layout.stackTemplate, '.env.example')));
  const typed = parseEnv(readIfThere(layout.envFile));
  // An empty value in the keys file does not erase a default: it just leaves the feature off.
  const given = Object.fromEntries(Object.entries(typed).filter(([, value]) => value !== ''));
  const env = { ...defaults, ...given };
  writeFileSync(join(layout.stackDir, '.env'), serialize(env));
  return { env };
}
