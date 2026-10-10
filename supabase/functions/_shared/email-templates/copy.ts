// The kinds of email Travelist sends and the values their copy may interpolate.
import type { EmailContent } from './layout.ts';

/** Auth emails (sent by the Send Email Hook) plus the welcome email. */
export const EMAIL_KINDS = [
  'welcome',
  'signup',
  'recovery',
  'magiclink',
  'invite',
  'email_change',
  'reauthentication',
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export type EmailVars = {
  /** The link the main button opens (verify link, or none for code-only emails). */
  actionUrl?: string;
  /** The 6-digit one-time code. */
  code?: string;
  /** The person's display name, when known. */
  name?: string;
  /** The address an email change moves to. */
  newEmail?: string;
  /** Public web address of the app (welcome email button). */
  appUrl?: string;
};

/** One language's copy: a builder per kind. */
export type CopyBook = Record<EmailKind, (vars: EmailVars) => EmailContent>;

/** The button, only when there is a link to open. */
export function optionalAction(label: string, url: string | undefined): EmailContent['action'] {
  return url ? { label, url } : undefined;
}

/** The code line, only when there is a code to show. */
export function optionalCode(label: string, value: string | undefined): EmailContent['code'] {
  return value ? { label, value } : undefined;
}
