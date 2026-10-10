// Thin wrapper around the `standardwebhooks` package: Supabase Auth signs every hook request
// with the Standard Webhooks scheme, and only Auth may make us send email.
import { Webhook } from 'standardwebhooks';

/** Verifies a raw body against its headers and returns the parsed JSON, or throws. */
export type HookVerifier = (body: string, headers: Record<string, string>) => unknown;

export class HookSignatureError extends Error {
  constructor(cause: unknown) {
    super(`send-email hook signature rejected: ${cause instanceof Error ? cause.message : cause}`);
    this.name = 'HookSignatureError';
  }
}

const SECRET_PREFIX = 'v1,whsec_';

/**
 * A verifier for the hook secret as Supabase shows it ("v1,whsec_<base64>").
 * @example standardWebhookVerifier(Deno.env.get('SEND_EMAIL_HOOK_SECRET')!)(body, headers)
 */
export function standardWebhookVerifier(secret: string): HookVerifier {
  if (!secret.startsWith(SECRET_PREFIX)) {
    throw new Error(
      `SEND_EMAIL_HOOK_SECRET must look like "v1,whsec_<base64>", got "${secret.slice(0, 6)}…"`,
    );
  }
  const webhook = new Webhook(secret.slice(SECRET_PREFIX.length));
  return (body, headers) => {
    try {
      return webhook.verify(body, headers);
    } catch (err) {
      throw new HookSignatureError(err);
    }
  };
}
