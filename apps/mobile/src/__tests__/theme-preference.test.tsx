import { userEvent } from '@testing-library/react-native';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import { supabase } from '@/lib/supabase';
import { palette } from '@/theme/colors';

import RootLayout from '../app/_layout';
import ProfileScreen from '../app/(tabs)/profile';

import { fakeSession, queryResult } from '@/testing/test-utils';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(),
    rpc: jest.fn(async () => ({ data: null, error: null })),
  },
  unwrap: (r: { data: unknown }) => r.data,
  check: () => undefined,
}));

const profileRow = {
  id: 'user-1',
  display_name: 'Ana',
  home_country: 'PT',
  language: 'en',
  units: 'metric',
  theme: 'light',
  passport_expiry: null,
  onboarded_at: '2026-09-28T00:00:00Z',
  profile_nationalities: [{ country_code: 'BR' }],
};

/** In-memory `profiles` table: records updates and serves the updated row afterwards. */
class FakeProfilesTable {
  updates: Record<string, unknown>[] = [];
  row: Record<string, unknown> = { ...profileRow };
  query() {
    const builder = queryResult(this.row) as Record<string, unknown>;
    builder.update = jest.fn((patch: Record<string, unknown>) => {
      this.updates.push(patch);
      this.row = { ...this.row, ...patch };
      return builder;
    });
    return builder;
  }
}

let profiles: FakeProfilesTable;

beforeEach(() => {
  profiles = new FakeProfilesTable();
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: fakeSession }, error: null } as never);
  jest
    .mocked(supabase.from)
    .mockImplementation(((table: string) =>
      table === 'profiles' ? profiles.query() : queryResult([])) as never);
});

const routes = { _layout: RootLayout, '(tabs)/profile': ProfileScreen };

test('choosing Dark in Preferences saves it and switches the app at once', async () => {
  renderRouter(routes, { initialUrl: '/profile' });
  const dark = await screen.findByRole('radio', { name: 'Dark' });
  expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();

  await userEvent.press(dark);

  expect(profiles.updates).toContainEqual({ theme: 'dark' });
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked());
  const title = screen.getByRole('header', { name: 'Profile' });
  expect(StyleSheet.flatten(title.props.style).color).toBe(palette.dark.text);
});
