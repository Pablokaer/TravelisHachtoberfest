import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { profileKeys, useSaveAvoidedCountries, type Profile } from '@/features/profile/api';

/** The updates the profile table received in each test. */
class MockProfiles {
  static updates: { patch: unknown; column: string; value: string }[] = [];
}

jest.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => ({
        eq: async (column: string, value: string) => {
          MockProfiles.updates.push({ patch, column, value });
          return { data: null, error: null };
        },
      }),
    }),
  },
  check: () => undefined,
  unwrap: (r: { data: unknown }) => r.data,
}));

const profile: Profile = {
  id: 'u1',
  displayName: null,
  nickname: null,
  homeCountry: null,
  language: 'en',
  units: 'metric',
  theme: 'light',
  passportExpiry: null,
  onboardedAt: null,
  nationalities: [],
  avatarPath: null,
  welcomeEmailSent: false,
  avoidCountries: [],
};

describe('useSaveAvoidedCountries (D-082)', () => {
  test('saves the codes on the profile and shows them at once', async () => {
    MockProfiles.updates = [];
    const client = new QueryClient();
    client.setQueryData(profileKeys.profile('u1'), profile);
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSaveAvoidedCountries(), { wrapper });
    act(() => result.current.mutate(['MT', 'IT']));
    await waitFor(() => expect(MockProfiles.updates).toHaveLength(1));
    expect(MockProfiles.updates[0]).toEqual({
      patch: { avoid_countries: ['MT', 'IT'] },
      column: 'id',
      value: 'u1',
    });
    expect(client.getQueryData<Profile>(profileKeys.profile('u1'))?.avoidCountries).toEqual([
      'MT',
      'IT',
    ]);
  });
});
