// Entry point: wires the real collaborators. Logic lives in handler.ts (tested with fakes).
//   POST /functions/v1/welcome-email   (signed-in user; sends their welcome email once, D-066)
import { requireUser, supabaseUserVerifier } from '../_shared/auth.ts';
import { env } from '../_shared/env.ts';
import { fetchJson } from '../_shared/http.ts';
import { mailerFromConfig } from '../_shared/mailer.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { createWelcomeHandler } from './handler.ts';
import { supabaseWelcomeStore } from './store.ts';

export function defaultHandler(): (req: Request) => Promise<Response> {
  const client = serviceClient();
  return requireUser(
    supabaseUserVerifier(client),
    createWelcomeHandler({
      store: supabaseWelcomeStore(client),
      mailer: mailerFromConfig(env.mailerConfig(), fetchJson),
      appUrl: env.appUrl(),
    }),
  );
}

if (import.meta.main) {
  Deno.serve(defaultHandler());
}
