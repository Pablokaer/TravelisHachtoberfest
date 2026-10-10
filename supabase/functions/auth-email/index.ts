// Entry point: wires the real collaborators. Logic lives in handler.ts (tested with fakes).
//   POST /functions/v1/auth-email   (called by Supabase Auth's Send Email Hook, D-066)
import { env } from '../_shared/env.ts';
import { fetchJson } from '../_shared/http.ts';
import { mailerFromConfig } from '../_shared/mailer.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { createAuthEmailHandler } from './handler.ts';
import { supabaseProfileLanguage } from './profile-language.ts';
import { standardWebhookVerifier } from './signature.ts';

export function defaultHandler(): (req: Request) => Promise<Response> {
  return createAuthEmailHandler({
    verify: standardWebhookVerifier(env.sendEmailHookSecret()),
    mailer: mailerFromConfig(env.mailerConfig(), fetchJson),
    profileLanguage: supabaseProfileLanguage(serviceClient()),
    authUrl: env.authPublicUrl(),
  });
}

if (import.meta.main) {
  Deno.serve(defaultHandler());
}
