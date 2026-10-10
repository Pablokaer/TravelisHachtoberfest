import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';
import { env } from './env';
import { secureStorage } from './secure-storage';

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

const isServer = Platform.OS === 'web' && typeof window === 'undefined';

/**
 * Single Supabase client. Native: session in SecureStore, PKCE for deep-link callbacks.
 * Web: default localStorage persistence; the session is read from the URL on callbacks.
 * During static web rendering (no window) persistence is disabled.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl ?? 'http://127.0.0.1:54321',
  env.supabaseAnonKey ?? 'missing-anon-key',
  {
    auth: {
      flowType: 'pkce',
      storage: Platform.OS === 'web' ? undefined : secureStorage,
      persistSession: !isServer,
      autoRefreshToken: !isServer,
      detectSessionInUrl: false,
    },
  },
);

// Refresh tokens only while the app is in the foreground (Supabase React Native guidance).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

/** Throws the Supabase error so TanStack Query surfaces it. */
export function unwrap<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error('Empty response');
  return result.data as NonNullable<T>;
}

/** For mutations that return no rows. */
export function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}
