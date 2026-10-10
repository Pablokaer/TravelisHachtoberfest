// The welcome store on Postgres: claim_welcome_email / release_welcome_email (service role only,
// migration 20261006000200_welcome_email.sql).
import type { SupabaseClient } from '@supabase/supabase-js';

import type { WelcomeClaim, WelcomeStore } from './handler.ts';

type ClaimRow = { email: string; language: string; display_name: string | null };

function rpcFailure(fn: string, userId: string, message: string): Error {
  return new Error(`${fn} failed for user ${userId}: ${message}`);
}

/**
 * @example const claim = await supabaseWelcomeStore(serviceClient()).claim('<user id>');
 */
export function supabaseWelcomeStore(client: SupabaseClient): WelcomeStore {
  return {
    async claim(userId: string): Promise<WelcomeClaim | null> {
      const { data, error } = await client.rpc('claim_welcome_email', { p_user: userId });
      if (error) throw rpcFailure('claim_welcome_email', userId, error.message);
      const row = (data as ClaimRow[] | null)?.[0];
      return row
        ? { email: row.email, language: row.language, displayName: row.display_name }
        : null;
    },
    async release(userId: string): Promise<void> {
      const { error } = await client.rpc('release_welcome_email', { p_user: userId });
      if (error) throw rpcFailure('release_welcome_email', userId, error.message);
    },
  };
}
