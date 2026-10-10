import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { forgetWelcomeRequests, requestWelcomeEmail } from '@/features/auth/welcome-email';
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

import RootLayout from '../app/_layout';

import { fakeSession, queryResult } from '@/testing/test-utils';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(),
    rpc: jest.fn(async () => ({ data: null, error: null })),
    functions: { invoke: jest.fn(async () => ({ data: { status: 'sent' }, error: null })) },
  },
  unwrap: (r: { data: unknown }) => r.data,
  check: () => undefined,
}));

/** The profiles row the root layout loads, with the welcome stamp under test. */
function profileRow(over: { onboarded_at?: string | null; welcome_email_sent_at?: string | null }) {
  return {
    id: 'user-1',
    display_name: 'Ana',
    nickname: 'ana_walks',
    home_country: 'PT',
    language: 'pt',
    units: 'metric',
    theme: 'light',
    passport_expiry: null,
    onboarded_at: '2026-10-03T10:00:00Z',
    welcome_email_sent_at: null,
    avatar_path: null,
    profile_nationalities: [],
    ...over,
  };
}

const invoke = jest.mocked(supabase.functions.invoke);
const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': () => null,
  '(tabs)/index': () => null,
  onboarding: () => <Text>Onboarding</Text>,
};

function signedInWith(row: ReturnType<typeof profileRow>) {
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: fakeSession }, error: null } as never);
  jest.mocked(supabase.from).mockImplementation((() => queryResult(row)) as never);
}

afterEach(async () => {
  jest.clearAllMocks();
  forgetWelcomeRequests();
  // The Portuguese profile switched the app language.
  await act(() => i18n.changeLanguage('en'));
});

describe('welcome email (D-066)', () => {
  it('asks the server to send it once the account is onboarded and not yet welcomed', async () => {
    signedInWith(profileRow({}));
    renderRouter(routes, { initialUrl: '/' });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('welcome-email', { method: 'POST' }));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('asks only once per app session, even when the app remounts', async () => {
    signedInWith(profileRow({}));
    const first = renderRouter(routes, { initialUrl: '/' });
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    first.unmount();
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('app-menu');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('does nothing once the email was sent', async () => {
    signedInWith(profileRow({ welcome_email_sent_at: '2026-10-03T10:01:00Z' }));
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('app-menu');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('waits until onboarding is finished (the language is known then)', async () => {
    signedInWith(profileRow({ onboarded_at: null }));
    renderRouter(routes, { initialUrl: '/onboarding' });
    await screen.findByText('Onboarding');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a failed request rejects with the server message, for the caller to ignore', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('email_failed') } as never);
    await expect(requestWelcomeEmail()).rejects.toThrow('email_failed');
  });

  it('a failure in the background does not break the app', async () => {
    invoke.mockRejectedValueOnce(new Error('offline'));
    signedInWith(profileRow({}));
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('app-menu')).toBeOnTheScreen();
  });
});
