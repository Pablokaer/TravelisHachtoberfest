// The Before you go checklist of a city for the signed-in traveller: shared by the checklist page
// (dates chosen there) and the city page section (a trip starting today, D-033).
import type { ChecklistRequest, Language } from '@wayfarer/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useChecklist } from '@/features/checklist/api';
import { useProfile, type Profile } from '@/features/profile/api';

export type TripDates = { arrival: string; departure: string | null };

type Passports = Pick<Profile, 'nationalities' | 'homeCountry' | 'passportExpiry'>;

/**
 * The `checklist` Edge Function request, or null until the profile has a passport.
 * @example checklistRequest('lisbon', profile, { arrival: '2026-10-01', departure: null }, 'en')
 */
export function checklistRequest(
  citySlug: string | undefined,
  profile: Passports | undefined,
  dates: TripDates,
  language: string,
): ChecklistRequest | null {
  if (!citySlug || !profile || profile.nationalities.length === 0) return null;
  return {
    city: citySlug,
    nationalities: profile.nationalities,
    homeCountry: profile.homeCountry,
    passportExpiry: profile.passportExpiry,
    arrival: dates.arrival,
    departure: dates.departure,
    language: language as Language,
  };
}

/**
 * Profile + checklist of a city for the given dates; `needsNationality` when the profile has no
 * passport yet (the checklist is personal).
 * @example const { checklist, needsNationality } = useCityChecklist('lisbon', dates);
 */
export function useCityChecklist(citySlug: string | undefined, dates: TripDates) {
  const { i18n } = useTranslation();
  const profile = useProfile();
  const language = i18n.resolvedLanguage ?? 'en';
  const request = useMemo(
    () => checklistRequest(citySlug, profile.data, dates, language),
    [citySlug, profile.data, dates, language],
  );
  const checklist = useChecklist(request);
  const needsNationality = !!profile.data && profile.data.nationalities.length === 0;
  return { profile, checklist, needsNationality };
}
