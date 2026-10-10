// Password recovery (D-066): request a reset email, open the link, set a new password.
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

/** Where the reset email sends users: web origin on web, wayfarer:// in the native app. */
export function passwordResetRedirectUrl(): string {
  return Linking.createURL('/auth/reset-password');
}

function throwAuthError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * Emails a reset link. Auth answers the same for unknown addresses, so this never reveals
 * whether an account exists; only real failures (rate limit, network) reject.
 * @example await requestPasswordReset('nina@example.com')
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: passwordResetRedirectUrl(),
  });
  throwAuthError(error);
}

/** The reset page's query: our emails carry `token_hash` + `type`; Auth's default ones `code`. */
export type RecoveryLinkParams = {
  token_hash?: string;
  type?: string;
  code?: string;
  error_description?: string;
};

async function verifyRecoveryLink(params: RecoveryLinkParams): Promise<void> {
  if (params.error_description) throw new Error(params.error_description);
  if (params.token_hash) {
    // Always a recovery token here, whatever `type` the URL claims: this page only resets passwords.
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: 'recovery',
    });
    return throwAuthError(error);
  }
  if (params.code)
    return throwAuthError((await supabase.auth.exchangeCodeForSession(params.code)).error);
  throw new Error(`reset link has no token, expected ?token_hash=…&type=recovery or ?code=…`);
}

// One verification per link: the root layout briefly swaps the navigator for a loading state when
// the session appears, which remounts the reset screen, and a token works only once.
const verifications = new Map<string, Promise<void>>();

/**
 * Signs in with the reset link (once per link, however often it is called).
 * @example await startRecoverySession({ token_hash: 'pkce_…', type: 'recovery' })
 */
export function startRecoverySession(params: RecoveryLinkParams): Promise<void> {
  const key = JSON.stringify(params);
  const known = verifications.get(key);
  if (known) return known;
  const started = verifyRecoveryLink(params);
  verifications.set(key, started);
  return started;
}

/** Test helper: forget verified links between tests. */
export function forgetRecoveryLinks(): void {
  verifications.clear();
}

/**
 * Sets the signed-in user's new password (after the reset link signed them in).
 * @example await updatePassword('a-new-password')
 */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  throwAuthError(error);
}
