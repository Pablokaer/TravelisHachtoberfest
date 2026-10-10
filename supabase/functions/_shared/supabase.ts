import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from './env.ts';

let client: SupabaseClient | undefined;

/** Service-role client (bypasses RLS). Only for server-side reads and the api_cache table. */
export function serviceClient(): SupabaseClient {
  client ??= createClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
