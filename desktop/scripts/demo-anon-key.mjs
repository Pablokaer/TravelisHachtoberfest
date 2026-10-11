// Prints the anon key of a local Supabase stack. The CLI signs it with a fixed, public secret
// (the "supabase-demo" key), so it can be rebuilt without a running stack (D-093).
import { createHmac } from 'node:crypto';

const LOCAL_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** @returns {string} the anon JWT of a local stack @example demoAnonKey() */
export function demoAnonKey() {
  const body = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: 'supabase-demo', role: 'anon', exp: 1983812996 })}`;
  return `${body}.${createHmac('sha256', LOCAL_JWT_SECRET).update(body).digest('base64url')}`;
}

if (process.argv[1]?.endsWith('demo-anon-key.mjs')) process.stdout.write(demoAnonKey());
