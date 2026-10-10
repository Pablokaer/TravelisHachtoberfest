// Typed access to Edge Function environment variables. Empty strings count as unset, so a
// blank `ORS_API_KEY=` in .env behaves exactly like a missing key.
import type { MailerConfig } from './mailer.ts';

function optional(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`missing environment variable ${name}`);
  return value;
}

export const env = {
  /** Injected by the Supabase edge runtime. */
  supabaseUrl: (): string => required('SUPABASE_URL'),
  /** Injected by the Supabase edge runtime. */
  serviceRoleKey: (): string => required('SUPABASE_SERVICE_ROLE_KEY'),
  orsApiKey: (): string | undefined => optional('ORS_API_KEY'),
  /** Frankfurter-compatible base URL overriding the public Frankfurter instance. */
  exchangeRatesBaseUrl: (): string | undefined => optional('EXCHANGE_RATES_BASE_URL'),
  /** Email provider settings (D-066): Resend in production, Mailpit locally. */
  mailerConfig: (): MailerConfig => ({
    resendApiKey: optional('RESEND_API_KEY'),
    mailpitUrl: optional('MAILPIT_URL'),
    from: optional('EMAIL_FROM'),
  }),
  /** "v1,whsec_<base64>": the secret Supabase Auth signs Send Email Hook calls with. */
  sendEmailHookSecret: (): string => required('SEND_EMAIL_HOOK_SECRET'),
  /**
   * Public Supabase URL for links in emails. Hosted, SUPABASE_URL already is public; locally the
   * runtime's SUPABASE_URL is the Docker-internal http://kong:8000, which a browser cannot open.
   */
  authPublicUrl: (): string => optional('AUTH_PUBLIC_URL') ?? required('SUPABASE_URL'),
  /** Public web address of the app, for the welcome email's button. */
  appUrl: (): string | undefined => optional('APP_URL'),
};
