import type { Language, ProfileForm, Theme, Units } from '@wayfarer/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { nicknameAvailable } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-provider';
import { check, supabase, unwrap } from '@/lib/supabase';

export type Country = {
  code: string;
  name_en: string;
  name_pt: string;
};

export type Profile = {
  id: string;
  displayName: string | null;
  /** Sign-in handle shown in walk chats (D-048); null until chosen. */
  nickname: string | null;
  homeCountry: string | null;
  language: Language;
  units: Units;
  theme: Theme;
  passportExpiry: string | null;
  onboardedAt: string | null;
  nationalities: string[];
  /** Profile photo in the avatars bucket (D-039); null shows the initials. */
  avatarPath: string | null;
  /** Whether the welcome email went out (D-066); the app asks for it until it has. */
  welcomeEmailSent: boolean;
};

export const profileKeys = {
  countries: ['countries'] as const,
  profile: (userId: string) => ['profile', userId] as const,
};

export function useCountries() {
  return useQuery({
    queryKey: profileKeys.countries,
    staleTime: 24 * 3600_000,
    queryFn: async () =>
      unwrap(
        await supabase.from('countries').select('code, name_en, name_pt').order('name_en'),
      ) as Country[],
  });
}

export function countryName(country: Country | undefined, language: string) {
  if (!country) return '';
  return language === 'pt' ? country.name_pt : country.name_en;
}

async function fetchProfile(userId: string): Promise<Profile> {
  const row = unwrap(
    await supabase
      .from('profiles')
      .select(
        'id, display_name, nickname, home_country, language, units, theme, passport_expiry, onboarded_at, avatar_path, welcome_email_sent_at, profile_nationalities(country_code)',
      )
      .eq('id', userId)
      .single(),
  );
  return {
    id: row.id,
    displayName: row.display_name,
    nickname: row.nickname,
    homeCountry: row.home_country,
    language: row.language as Language,
    units: row.units as Units,
    theme: row.theme as Theme,
    passportExpiry: row.passport_expiry,
    onboardedAt: row.onboarded_at,
    nationalities: (row.profile_nationalities ?? []).map((n) => n.country_code).sort(),
    avatarPath: row.avatar_path,
    // Only an explicit null means "not yet": a row without the column never triggers a send.
    welcomeEmailSent: row.welcome_email_sent_at !== null,
  };
}

export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: profileKeys.profile(userId ?? 'anonymous'),
    enabled: !!userId,
    queryFn: () => fetchProfile(userId!),
  });
}

/** Someone else has the nickname (D-048). */
export class NicknameTakenError extends Error {
  constructor(nickname: string) {
    super(`nickname ${nickname} is taken (expected a free one)`);
    this.name = 'NicknameTakenError';
  }
}

/**
 * The message under a profile form when saving failed.
 * @example profileSaveError(save.error, t) // 'This nickname is taken. Try another.'
 */
export function profileSaveError(error: Error | null, t: TFunction): string | null {
  if (!error) return null;
  return error instanceof NicknameTakenError ? t('validation.nicknameTaken') : error.message;
}

export function useSaveProfile() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: ProfileForm) => {
      const userId = session!.user.id;
      // Your own nickname counts as available, so an unchanged one passes.
      if (!(await nicknameAvailable(form.nickname))) throw new NicknameTakenError(form.nickname);
      check(
        await supabase
          .from('profiles')
          .update({
            display_name: form.displayName,
            nickname: form.nickname,
            home_country: form.homeCountry,
            language: form.language,
            units: form.units,
            passport_expiry: form.passportExpiry,
            onboarded_at: new Date().toISOString(),
          })
          .eq('id', userId),
      );
      check(await supabase.rpc('set_nationalities', { codes: form.nationalities }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export type PreferencesPatch = { language?: Language; units?: Units; theme?: Theme };

/**
 * Lightweight update for single preferences (language, units, theme). The cached profile is
 * patched first so the change shows at once (a theme switch shouldn't wait for the network),
 * and rolled back if the save fails.
 * @example useUpdatePreferences().mutate({ theme: 'dark' })
 */
export function useUpdatePreferences() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = profileKeys.profile(session?.user.id ?? 'anonymous');
  return useMutation({
    mutationFn: async (patch: PreferencesPatch) => {
      check(await supabase.from('profiles').update(patch).eq('id', session!.user.id));
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Profile>(key);
      if (previous) queryClient.setQueryData<Profile>(key, { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
}
