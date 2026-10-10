// Reads profiles.language with the service role, for the language of auth emails.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProfileLanguageReader } from './handler.ts';

/**
 * A reader of the saved language; null when the profile does not exist (yet).
 * @example await supabaseProfileLanguage(serviceClient())('<user id>') // 'pt'
 */
export function supabaseProfileLanguage(client: SupabaseClient): ProfileLanguageReader {
  return async (userId) => {
    const { data, error } = await client.from('profiles').select('language').eq('id', userId)
      .maybeSingle();
    if (error) {
      throw new Error(`profiles.language lookup failed for user ${userId}: ${error.message}`);
    }
    return (data as { language: string } | null)?.language ?? null;
  };
}
