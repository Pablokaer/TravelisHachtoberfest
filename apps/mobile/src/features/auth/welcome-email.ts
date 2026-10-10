// The welcome email (D-066) is sent by the welcome-email Edge Function, which writes it in the
// profile's language and sends it once (server-side claim). The app only asks: when onboarding
// finishes, and again on a later start if the profile is still not welcomed (a failed send).
import { useEffect } from 'react';

import type { Profile } from '@/features/profile/api';
import { supabase } from '@/lib/supabase';

/**
 * Asks the server to send the signed-in user's welcome email ("sent" or "not_needed").
 * @example await requestWelcomeEmail() // { status: 'sent' }
 */
export async function requestWelcomeEmail(): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('welcome-email', { method: 'POST' });
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return data;
}

// Users already asked for in this app session: one request per launch, never a retry loop.
const requested = new Set<string>();

/** Test helper: start a fresh app session. */
export function forgetWelcomeRequests(): void {
  requested.clear();
}

function needsWelcome(profile: Profile | undefined): profile is Profile {
  return !!profile?.onboardedAt && !profile.welcomeEmailSent && !requested.has(profile.id);
}

/**
 * Requests the welcome email once the profile is onboarded and not yet welcomed. Failures are
 * left for the next app start: the server released its claim, so that request sends.
 * @example useWelcomeEmail(signedIn ? profile.data : undefined)
 */
export function useWelcomeEmail(profile: Profile | undefined): void {
  const pending = needsWelcome(profile) ? profile.id : null;
  useEffect(() => {
    if (!pending || requested.has(pending)) return;
    requested.add(pending);
    requestWelcomeEmail().catch((error: unknown) =>
      console.warn(JSON.stringify({ event: 'welcome_email_request_failed', error: String(error) })),
    );
  }, [pending]);
}
