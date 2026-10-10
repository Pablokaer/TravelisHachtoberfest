// POST /auth-email — Supabase Auth's Send Email Hook (D-066). Auth calls it instead of its own
// SMTP mailer for every auth email; we verify the signature, choose the language and send through
// our Mailer. Failures answer the hook error shape so Auth reports them to the client.
import type { Language } from '@wayfarer/shared';

import { renderEmail, resolveEmailLanguage } from '../_shared/email-templates/index.ts';
import { logEvent, type LogSink } from '../_shared/log.ts';
import { type Mailer, mailFailureFields } from '../_shared/mailer.ts';
import { type AuthHookPayload, parseHookPayload, planAuthEmails } from './payload.ts';
import type { HookVerifier } from './signature.ts';

/** profiles.language for a user, or null (no profile yet: sign-up runs before it commits). */
export type ProfileLanguageReader = (userId: string) => Promise<string | null>;

export type AuthEmailDeps = {
  verify: HookVerifier;
  mailer: Mailer;
  profileLanguage: ProfileLanguageReader;
  /** Public Supabase URL the verify links point at (the browser must reach it). */
  authUrl: string;
  log?: LogSink;
};

/** The error body Supabase Auth expects from an HTTP hook. */
function hookError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The saved profile language wins (it follows later changes); then sign-up metadata; then en. */
async function chooseLanguage(payload: AuthHookPayload, deps: AuthEmailDeps): Promise<Language> {
  const saved = await deps.profileLanguage(payload.user.id).catch((err: unknown) => {
    logEvent(
      { level: 'warn', event: 'auth_email_language_lookup_failed', error: String(err) },
      deps.log,
    );
    return null;
  });
  return resolveEmailLanguage(saved ?? payload.user.user_metadata?.language);
}

async function sendPlanned(payload: AuthHookPayload, deps: AuthEmailDeps): Promise<void> {
  const language = await chooseLanguage(payload, deps);
  for (const planned of planAuthEmails(payload, deps.authUrl)) {
    const email = renderEmail(planned.kind, language, planned.vars);
    await deps.mailer.send({ to: planned.to, ...email });
  }
  const type = payload.email_data.email_action_type;
  logEvent(
    { level: 'info', event: 'auth_email_sent', type, language, userId: payload.user.id },
    deps.log,
  );
}

function verifiedPayload(body: string, req: Request, deps: AuthEmailDeps): unknown {
  return deps.verify(body, Object.fromEntries(req.headers));
}

/**
 * Builds the hook handler with its collaborators injected (real ones in index.ts).
 * @example Deno.serve(createAuthEmailHandler({ verify, mailer, profileLanguage, authUrl }))
 */
export function createAuthEmailHandler(deps: AuthEmailDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== 'POST') {
      return hookError(405, `method ${req.method} not allowed, expected POST`);
    }
    const body = await req.text();
    let raw: unknown;
    try {
      raw = verifiedPayload(body, req, deps);
    } catch (err) {
      logEvent(
        { level: 'warn', event: 'auth_email_signature_rejected', error: String(err) },
        deps.log,
      );
      return hookError(401, 'invalid hook signature');
    }
    return await handleVerified(raw, deps);
  };
}

async function handleVerified(raw: unknown, deps: AuthEmailDeps): Promise<Response> {
  let payload: AuthHookPayload;
  try {
    payload = parseHookPayload(raw);
  } catch (err) {
    return hookError(400, err instanceof Error ? err.message : String(err));
  }
  try {
    await sendPlanned(payload, deps);
  } catch (err) {
    const type = payload.email_data.email_action_type;
    logEvent(
      { level: 'error', event: 'auth_email_failed', type, ...mailFailureFields(err) },
      deps.log,
    );
    return hookError(500, 'the email could not be sent, try again in a moment');
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}
