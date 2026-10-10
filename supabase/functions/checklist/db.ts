import type { SupabaseClient } from '@supabase/supabase-js';
import type { VisaOption, VisaRequirement } from '@wayfarer/shared';

import type { ChecklistDb, Place } from './types.ts';

type VisaRow = { passport: string; requirement: VisaRequirement; max_stay_days: number | null };

/**
 * The checklist's reads, two RPCs started together (D-054): `checklist_place` (city, its country
 * and the home country) and `visa_options_for_city`; before, city → countries → visa were three
 * round trips one after another.
 * @example const place = await supabaseChecklistDb(serviceClient()).getPlace('lisbon', 'BR');
 */
export function supabaseChecklistDb(client: SupabaseClient): ChecklistDb {
  return {
    async getPlace(citySlug, homeCountry) {
      const { data, error } = await client.rpc('checklist_place', {
        p_city: citySlug,
        p_home: homeCountry,
      });
      if (error) throw error;
      return (data as Place | null) ?? null;
    },
    async getVisaOptions(citySlug, passports) {
      const { data, error } = await client.rpc('visa_options_for_city', {
        p_city: citySlug,
        p_passports: passports,
      });
      if (error) throw error;
      return ((data ?? []) as VisaRow[]).map((r) => ({
        nationality: r.passport,
        requirement: r.requirement,
        maxStayDays: r.max_stay_days,
      } satisfies VisaOption));
    },
  };
}
