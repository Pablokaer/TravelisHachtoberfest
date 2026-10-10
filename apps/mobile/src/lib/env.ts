import { z } from 'zod';

/**
 * Public, client-side configuration. Only EXPO_PUBLIC_* variables are inlined by Expo.
 * Values must be read with static `process.env.EXPO_PUBLIC_X` access so Metro can inline them.
 */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const envSchema = z.object({
  supabaseUrl: z.preprocess(emptyToUndefined, z.url().optional()),
  supabaseAnonKey: z.preprocess(emptyToUndefined, z.string().optional()),
  mapStyleUrl: z.preprocess(
    emptyToUndefined,
    z.url().default('https://tiles.openfreemap.org/styles/liberty'),
  ),
  /** Public web address of the app (e.g. https://wayfarer.app); shared trip links use it (D-031). */
  webUrl: z.preprocess(emptyToUndefined, z.url().optional()),
  /** Local city-builder service (D-079), e.g. http://127.0.0.1:8787; "my city" needs it for cities the app lacks. */
  cityBuilderUrl: z.preprocess(emptyToUndefined, z.url().optional()),
  sentryDsn: z.preprocess(emptyToUndefined, z.string().optional()),
  posthogKey: z.preprocess(emptyToUndefined, z.string().optional()),
  posthogHost: z.preprocess(emptyToUndefined, z.url().default('https://eu.i.posthog.com')),
  /** OAuth providers enabled in Supabase Auth, e.g. "google,apple". Hidden in the UI otherwise. */
  authProviders: z.preprocess(
    (v) =>
      typeof v === 'string'
        ? v
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        : [],
    z.array(z.enum(['google', 'apple'])),
  ),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(
  raw: Omit<
    Record<keyof AppEnv, string | undefined>,
    'authProviders' | 'webUrl' | 'cityBuilderUrl'
  > & {
    authProviders?: string;
    webUrl?: string;
    cityBuilderUrl?: string;
  },
): AppEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid EXPO_PUBLIC_* configuration: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env: AppEnv = parseEnv({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL,
  webUrl: process.env.EXPO_PUBLIC_WEB_URL,
  cityBuilderUrl: process.env.EXPO_PUBLIC_CITY_BUILDER_URL,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  authProviders: process.env.EXPO_PUBLIC_AUTH_PROVIDERS,
});
