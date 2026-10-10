// POST /welcome-email — sends the signed-in user's welcome email once (D-066). The app calls it
// when onboarding finishes and, as a retry, on start while the profile is not yet welcomed. The
// store's claim makes repeated or concurrent calls send a single email.
import type { AuthUser } from '../_shared/auth.ts';
import {
  errorResponse,
  handleOptions,
  internalError,
  json,
  methodNotAllowed,
} from '../_shared/cors.ts';
import { renderEmail, resolveEmailLanguage } from '../_shared/email-templates/index.ts';
import { logEvent, type LogSink } from '../_shared/log.ts';
import { type Mailer, mailFailureFields } from '../_shared/mailer.ts';

/** What the email needs, returned by a successful claim. */
export type WelcomeClaim = { email: string; language: string; displayName: string | null };

/** claim_welcome_email / release_welcome_email (service role only). */
export interface WelcomeStore {
  /** Stamps the profile and returns its details, or null (already welcomed / not onboarded). */
  claim(userId: string): Promise<WelcomeClaim | null>;
  /** Clears the stamp after a failed send. */
  release(userId: string): Promise<void>;
}

export type WelcomeDeps = { store: WelcomeStore; mailer: Mailer; appUrl?: string; log?: LogSink };

async function sendWelcome(claim: WelcomeClaim, deps: WelcomeDeps): Promise<string> {
  const language = resolveEmailLanguage(claim.language);
  const vars = { name: claim.displayName ?? undefined, appUrl: deps.appUrl };
  await deps.mailer.send({ to: claim.email, ...renderEmail('welcome', language, vars) });
  return language;
}

async function sendOrRelease(userId: string, claim: WelcomeClaim, deps: WelcomeDeps) {
  try {
    const language = await sendWelcome(claim, deps);
    logEvent({ level: 'info', event: 'welcome_email_sent', userId, language }, deps.log);
    return json({ status: 'sent' });
  } catch (err) {
    logEvent(
      { level: 'error', event: 'welcome_email_failed', userId, ...mailFailureFields(err) },
      deps.log,
    );
    await deps.store.release(userId);
    return errorResponse(502, 'email_failed', 'the welcome email could not be sent, retry later');
  }
}

/**
 * The handler for a verified user (wrap it with requireUser).
 * @example requireUser(verify, createWelcomeHandler({ store, mailer, appUrl }))
 */
export function createWelcomeHandler(
  deps: WelcomeDeps,
): (req: Request, user: AuthUser) => Promise<Response> {
  return async (req, user) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;
    if (req.method !== 'POST') return methodNotAllowed();
    let claim: WelcomeClaim | null;
    try {
      claim = await deps.store.claim(user.id);
    } catch (err) {
      return internalError(err);
    }
    if (!claim) return json({ status: 'not_needed' });
    return await sendOrRelease(user.id, claim, deps);
  };
}
