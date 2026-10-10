// Outgoing email behind one small interface (D-066): Resend in production, Mailpit's HTTP API in
// local development. Callers never see which provider sends; tests use a fake transport.
import { type FetchJson, HttpError } from './http.ts';

export type EmailMessage = { to: string; subject: string; html: string; text: string };

/** Sends one email; rejects (with the provider's HTTP status when there is one) on failure. */
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/** Mail providers answer within a few seconds; Auth waits for the hook, so keep it short. */
const MAIL_TIMEOUT_MS = 10_000;
const RESEND_URL = 'https://api.resend.com/emails';

/** Thrown at start-up when the environment names no usable provider or sender. */
export class MailerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailerConfigError';
  }
}

/** Production provider: https://resend.com/docs/api-reference/emails/send-email */
export class ResendMailer implements Mailer {
  constructor(
    private readonly config: { apiKey: string; from: string },
    private readonly fetchJson: FetchJson,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await this.fetchJson(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: { from: this.config.from, to: [message.to], ...bodyParts(message) },
      timeoutMs: MAIL_TIMEOUT_MS,
    });
  }
}

/** Local provider: Mailpit (the `supabase start` mail catcher), POST /api/v1/send (v1.30). */
export class MailpitMailer implements Mailer {
  constructor(
    private readonly config: { url: string; from: string },
    private readonly fetchJson: FetchJson,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const { subject, html, text } = bodyParts(message);
    await this.fetchJson(`${this.config.url.replace(/\/+$/, '')}/api/v1/send`, {
      method: 'POST',
      body: {
        From: parseAddress(this.config.from),
        To: [{ Email: message.to }],
        Subject: subject,
        HTML: html,
        Text: text,
      },
      timeoutMs: MAIL_TIMEOUT_MS,
    });
  }
}

function bodyParts(message: EmailMessage): Omit<EmailMessage, 'to'> {
  return { subject: message.subject, html: message.html, text: message.text };
}

/**
 * Splits an RFC 5322 "Name <email>" sender into Mailpit's `{ Email, Name }`.
 * @example parseAddress('Travelist <hi@x.app>') // { Email: 'hi@x.app', Name: 'Travelist' }
 */
export function parseAddress(address: string): { Email: string; Name?: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(address);
  if (!match) return { Email: address.trim() };
  const name = match[1]!.replace(/^"|"$/g, '');
  return name ? { Email: match[2]!, Name: name } : { Email: match[2]! };
}

export type MailerConfig = { resendApiKey?: string; mailpitUrl?: string; from?: string };

/**
 * Chooses the provider from configuration: Resend when `RESEND_API_KEY` is set, else Mailpit when
 * `MAILPIT_URL` is set. Neither is a deployment mistake, so it throws instead of dropping mail.
 * @example const mailer = mailerFromConfig(env.mailerConfig(), fetchJson);
 */
export function mailerFromConfig(config: MailerConfig, fetchJson: FetchJson): Mailer {
  const from = config.from;
  if (!from) throw new MailerConfigError('EMAIL_FROM is not set, expected "Name <address>"');
  if (config.resendApiKey) {
    return new ResendMailer({ apiKey: config.resendApiKey, from }, fetchJson);
  }
  if (config.mailpitUrl) return new MailpitMailer({ url: config.mailpitUrl, from }, fetchJson);
  throw new MailerConfigError(
    'no email provider configured: set RESEND_API_KEY (production) or MAILPIT_URL (local)',
  );
}

/**
 * Log fields for a failed send: the provider's HTTP status and body when it answered.
 * @example mailFailureFields(err) // { error: 'HTTP 403 from api.resend.com', status: 403, body }
 */
export function mailFailureFields(err: unknown): Record<string, unknown> {
  const error = err instanceof Error ? err.message : String(err);
  if (!(err instanceof HttpError)) return { error };
  return { error, status: err.status, body: err.body };
}
