// The keys file of the desktop app (D-093): `KEY=value` lines, read the way the pipeline's own
// `.env` reader does (wayfarer_pipeline/dotenv.py).

/**
 * @param {string} text
 * @returns {Record<string, string>}
 * @example parseEnv('SERPAPI_API_KEY=abc\n').SERPAPI_API_KEY // 'abc'
 */
export function parseEnv(text) {
  /** @type {Record<string, string>} */
  const variables = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const at = line.indexOf('=');
    if (at <= 0 || line.startsWith('#')) continue;
    const key = line.slice(0, at);
    if (key.includes(' ')) continue;
    variables[key] = unquote(line.slice(at + 1).trim());
  }
  return variables;
}

function unquote(value) {
  const quoted = value.length >= 2 && value[0] === value.at(-1) && '"\''.includes(value[0]);
  return quoted ? value.slice(1, -1) : value;
}
