// The Send Email Hook payload (https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
// and the pure planning step: which addresses get which email, with which link and code.
import { z } from 'zod';

import type { EmailKind, EmailVars } from '../_shared/email-templates/index.ts';

const hookPayloadSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    new_email: z.string().optional().nullable(),
    user_metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  }),
  email_data: z.object({
    token: z.string().default(''),
    token_hash: z.string().default(''),
    redirect_to: z.string().default(''),
    email_action_type: z.string(),
    site_url: z.string().default(''),
    token_new: z.string().default(''),
    token_hash_new: z.string().default(''),
  }),
});
export type AuthHookPayload = z.infer<typeof hookPayloadSchema>;

/** One email to send: who, which template, and what it interpolates. */
export type PlannedEmail = { to: string; kind: EmailKind; vars: EmailVars };

/**
 * Validates the verified hook body. Throws naming the bad fields (e.g. `user.email`).
 * @example parseHookPayload(JSON.parse(body)).email_data.email_action_type // 'recovery'
 */
export function parseHookPayload(raw: unknown): AuthHookPayload {
  const parsed = hookPayloadSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new Error(
    `invalid send-email hook payload, expected { user, email_data }: ${
      z.prettifyError(parsed.error)
    }`,
  );
}

/**
 * Auth's verify endpoint: checks the token, then redirects (with `?code=` under PKCE).
 * @example verifyLink('https://x.supabase.co', 'pkce_1', 'recovery', 'https://app/auth/reset-password')
 */
export function verifyLink(authUrl: string, tokenHash: string, type: string, redirectTo: string) {
  const params = new URLSearchParams({ token: tokenHash, type, redirect_to: redirectTo });
  return `${authUrl.replace(/\/+$/, '')}/auth/v1/verify?${params}`;
}

/** Hook action types → our templates. "email" is the OTP sign-in of an existing user. */
const KIND_BY_ACTION: Record<string, EmailKind> = {
  signup: 'signup',
  recovery: 'recovery',
  magiclink: 'magiclink',
  email: 'magiclink',
  invite: 'invite',
  email_change: 'email_change',
  reauthentication: 'reauthentication',
};

function displayName(payload: AuthHookPayload): string | undefined {
  const name = payload.user.user_metadata?.display_name;
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

/**
 * A link straight to an app page that verifies the token hash itself (`verifyOtp`).
 * @example appLink('https://app/auth/reset-password', 'pkce_1', 'recovery')
 * // 'https://app/auth/reset-password?token_hash=pkce_1&type=recovery'
 */
export function appLink(pageUrl: string, tokenHash: string, type: string): string {
  const url = new URL(pageUrl);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  return url.toString();
}

type LinkPlanner = (tokenHash: string) => string;

/**
 * Recovery links open the app's reset page with the token hash: it works on any device (a PKCE
 * `?code=` only on the browser that asked, which holds the code verifier), and mail scanners that
 * prefetch links cannot use the token up. Other emails keep Auth's verify endpoint.
 */
function linkPlanner(payload: AuthHookPayload, authUrl: string): LinkPlanner {
  const data = payload.email_data;
  const redirectTo = data.redirect_to || data.site_url;
  const type = data.email_action_type;
  if (type === 'recovery') return (tokenHash) => appLink(redirectTo, tokenHash, type);
  return (tokenHash) => verifyLink(authUrl, tokenHash, type, redirectTo);
}

/**
 * Secure email change mails both addresses. Supabase's names are reversed for backward
 * compatibility: `token` + `token_hash_new` belong to the current address, `token_new` +
 * `token_hash` to the new one. Without secure change only the new address gets one email.
 */
function planEmailChange(payload: AuthHookPayload, link: LinkPlanner): PlannedEmail[] {
  const { user, email_data: d } = payload;
  const base = { kind: 'email_change' as const, name: displayName(payload) };
  const newEmail = user.new_email ?? undefined;
  const vars = (code: string, hash: string): EmailVars => ({
    actionUrl: link(hash),
    code: code || undefined,
    name: base.name,
    newEmail,
  });
  if (d.token_hash && d.token_hash_new) {
    return [
      { to: user.email, kind: base.kind, vars: vars(d.token, d.token_hash_new) },
      { to: newEmail ?? user.email, kind: base.kind, vars: vars(d.token_new, d.token_hash) },
    ];
  }
  const hash = d.token_hash || d.token_hash_new;
  return [{
    to: newEmail ?? user.email,
    kind: base.kind,
    vars: vars(d.token || d.token_new, hash),
  }];
}

/**
 * The emails one hook call must send (none for notification types this app has not enabled).
 * @example planAuthEmails(payload, 'https://x.supabase.co') // [{ to, kind: 'recovery', vars }]
 */
export function planAuthEmails(payload: AuthHookPayload, authUrl: string): PlannedEmail[] {
  const kind = KIND_BY_ACTION[payload.email_data.email_action_type];
  if (!kind) return [];
  const link = linkPlanner(payload, authUrl);
  if (kind === 'email_change') return planEmailChange(payload, link);
  const { token, token_hash } = payload.email_data;
  const name = displayName(payload);
  if (kind === 'reauthentication') {
    return [{ to: payload.user.email, kind, vars: { code: token, name } }];
  }
  const vars: EmailVars = { actionUrl: link(token_hash), code: token || undefined, name };
  return [{ to: payload.user.email, kind, vars }];
}
