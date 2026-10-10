import { env } from './env';

/**
 * Error reporting and analytics facade. Sentry / PostHog SDKs are wired in later milestones;
 * until then, and whenever the keys are missing, every call is a no-op.
 * Never pass personal data (names, emails, passport info) in `properties`.
 */
export const observability = {
  errorsEnabled: Boolean(env.sentryDsn),
  analyticsEnabled: Boolean(env.posthogKey),

  captureException(error: unknown, context?: Record<string, unknown>) {
    if (__DEV__) console.warn('[observability] exception', error, context);
  },

  track(_event: string, _properties?: Record<string, string | number | boolean>) {
    // no-op until PostHog is configured
  },
};
