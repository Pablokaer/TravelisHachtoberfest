import { userEvent } from '@testing-library/react-native';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

import RootLayout from '../app/_layout';
import OnboardingScreen from '../app/onboarding';

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
  display_name: null,
  home_country: null,
  language: 'en',
  units: 'metric',
  passport_expiry: null,
  onboarded_at: null,
  profile_nationalities: [],
  nickname: null as string | null,
};
const countries = [
  { code: 'BR', name_en: 'Brazil', name_pt: 'Brasil' },
  { code: 'PT', name_en: 'Portugal', name_pt: 'Portugal' },
];

beforeEach(() => {
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: fakeSession }, error: null } as never);
  jest
    .mocked(supabase.from)
    .mockImplementation(((table: string) =>
      queryResult(table === 'countries' ? countries : profileRow)) as never);
});

afterEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

const routes = { _layout: RootLayout, onboarding: OnboardingScreen };

describe('onboarding', () => {
  it('sends new users to onboarding and validates each step', async () => {
    renderRouter(routes, { initialUrl: '/onboarding' });
    expect(await screen.findByText('Step 1 of 2')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('This field is required')).toBeOnTheScreen();

    await userEvent.type(screen.getByTestId('displayName'), 'Ana');
    await userEvent.press(screen.getByRole('button', { name: 'Next' }));
    // The nickname is required too (D-048): OAuth and magic-link sign-ups choose it here.
    expect(await screen.findByText('Use 3–20 lowercase letters, numbers or _')).toBeOnTheScreen();
    await userEvent.type(screen.getByTestId('nickname'), 'ana_walks');
    await userEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 2 of 2')).toBeOnTheScreen();

    // Nationality is mandatory (step 2 is the last one: the passport expiry step was removed).
    await userEvent.press(screen.getByRole('button', { name: 'Start exploring' }));
    expect(await screen.findByText('Add at least one nationality')).toBeOnTheScreen();
  });

  it('does not ask for the passport expiry date', async () => {
    renderRouter(routes, { initialUrl: '/onboarding' });
    await userEvent.type(await screen.findByTestId('displayName'), 'Ana');
    await userEvent.type(screen.getByTestId('nickname'), 'ana_walks');
    await userEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('button', { name: 'Start exploring' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByTestId('passportExpiry')).toBeNull();
  });

  it('keeps the nickname chosen at sign-up', async () => {
    profileRow.nickname = 'ana_walks';
    renderRouter(routes, { initialUrl: '/onboarding' });
    expect(await screen.findByDisplayValue('ana_walks')).toBeOnTheScreen();
    profileRow.nickname = null;
  });

  it('says so when the nickname was taken meanwhile', async () => {
    jest
      .mocked(supabase.rpc)
      .mockImplementation((async (fn: string) =>
        fn === 'nickname_available'
          ? { data: false, error: null }
          : { data: null, error: null }) as never);
    renderRouter(routes, { initialUrl: '/onboarding' });
    await userEvent.type(await screen.findByTestId('displayName'), 'Ana');
    await userEvent.type(screen.getByTestId('nickname'), 'ana_walks');
    await userEvent.press(screen.getByRole('button', { name: 'Next' }));
    const [addNationality] = await screen.findAllByRole('button', { name: 'Choose a country' });
    await userEvent.press(addNationality!);
    await userEvent.type(await screen.findByLabelText('Search countries'), 'bras');
    await userEvent.press(await screen.findByRole('checkbox', { name: 'Brazil' }));
    await userEvent.press(screen.getByRole('button', { name: 'Done' }));
    await userEvent.press(screen.getByRole('button', { name: 'Choose a country' }));
    await userEvent.type(await screen.findByLabelText('Search countries'), 'bras');
    await userEvent.press(await screen.findByRole('radio', { name: 'Brazil' }));
    await userEvent.press(await screen.findByRole('button', { name: 'Start exploring' }));
    expect(await screen.findByText('This nickname is taken. Try another.')).toBeOnTheScreen();
  });

  it('adds a nationality from the searchable picker', async () => {
    renderRouter(routes, { initialUrl: '/onboarding' });
    await userEvent.type(await screen.findByTestId('displayName'), 'Ana');
    await userEvent.type(screen.getByTestId('nickname'), 'ana_walks');
    await userEvent.press(screen.getByRole('button', { name: 'Next' }));
    const [addNationality] = await screen.findAllByRole('button', { name: 'Choose a country' });
    await userEvent.press(addNationality!);
    await userEvent.type(await screen.findByLabelText('Search countries'), 'bras');
    await userEvent.press(await screen.findByRole('checkbox', { name: 'Brazil' }));
    await userEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'Brazil' })).toBeOnTheScreen();
  });
});
