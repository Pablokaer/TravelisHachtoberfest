import { userEvent } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import {
  forgetRecoveryLinks,
  passwordResetRedirectUrl,
  requestPasswordReset,
  startRecoverySession,
} from '@/features/auth/recovery-api';
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

import RootLayout from '../app/_layout';
import AuthLayout from '../app/(auth)/_layout';
import ForgotPasswordScreen from '../app/(auth)/forgot-password';
import SignInScreen from '../app/(auth)/sign-in';
import ResetPasswordScreen from '../app/auth/reset-password';

import { fakeSession, queryResult } from '@/testing/test-utils';

jest.mock('@/lib/supabase', () => {
  const ok = async () => ({ data: {}, error: null });
  return {
    supabase: {
      auth: {
        getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
        resetPasswordForEmail: jest.fn(ok),
        verifyOtp: jest.fn(ok),
        exchangeCodeForSession: jest.fn(ok),
        updateUser: jest.fn(ok),
      },
      from: jest.fn(),
      rpc: jest.fn(),
    },
    unwrap: (r: { data: unknown }) => r.data,
    check: () => undefined,
  };
});

/** An Auth error as supabase-js returns it, with the message users would see. */
class FakeAuthError {
  constructor(readonly message: string) {}
}

/** Supabase's auth event stream: the provider subscribes, the test emits. */
class FakeAuthEvents {
  private listener: ((event: string, session: Session | null) => void) | null = null;
  subscribe = (listener: (event: string, session: Session | null) => void) => {
    this.listener = listener;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  };
  async emit(event: string, session: Session | null): Promise<void> {
    await act(async () => this.listener?.(event, session));
  }
}

const onboardedProfile = {
  id: 'user-1',
  display_name: 'Emma',
  nickname: 'emma',
  home_country: 'GB',
  language: 'en',
  units: 'metric',
  theme: 'light',
  passport_expiry: null,
  onboarded_at: '2026-06-02T09:14:00Z',
  welcome_email_sent_at: '2026-06-02T09:14:00Z',
  avatar_path: null,
  profile_nationalities: [],
};

const auth = jest.mocked(supabase.auth);
const Home = () => <Text>Home screen</Text>;

afterEach(async () => {
  jest.clearAllMocks();
  forgetRecoveryLinks();
  await act(() => i18n.changeLanguage('en'));
});

describe('recovery api', () => {
  it('sends the reset email back to the reset page', async () => {
    await requestPasswordReset(' nina@example.com ');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('nina@example.com', {
      redirectTo: passwordResetRedirectUrl(),
    });
    expect(passwordResetRedirectUrl()).toMatch(/\/auth\/reset-password$/);
  });

  it('surfaces Auth errors such as rate limits', async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: new FakeAuthError('email rate limit exceeded'),
    } as never);
    await expect(requestPasswordReset('nina@example.com')).rejects.toThrow(
      'email rate limit exceeded',
    );
  });

  it('verifies a token hash link once, even when the screen mounts twice', async () => {
    const link = { token_hash: 'pkce_1', type: 'recovery' };
    await Promise.all([startRecoverySession(link), startRecoverySession(link)]);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'pkce_1', type: 'recovery' });
  });

  it('exchanges a PKCE code link once', async () => {
    await startRecoverySession({ code: 'abc' });
    await startRecoverySession({ code: 'abc' });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('rejects a link that carries an error or no token, with the reason', async () => {
    await expect(
      startRecoverySession({ error_description: 'Email link is invalid or has expired' }),
    ).rejects.toThrow('Email link is invalid or has expired');
    await expect(startRecoverySession({})).rejects.toThrow('token_hash');
  });
});

describe('forgot password', () => {
  const routes = {
    '(auth)/_layout': AuthLayout,
    '(auth)/sign-in': SignInScreen,
    '(auth)/forgot-password': ForgotPasswordScreen,
  };

  it('is linked from sign-in', async () => {
    renderRouter(routes, { initialUrl: '/sign-in' });
    await userEvent.press(await screen.findByText('Forgot password?'));
    expect(await screen.findByRole('header', { name: 'Reset your password' })).toBeOnTheScreen();
  });

  it('validates the email, then always confirms the same way', async () => {
    renderRouter(routes, { initialUrl: '/forgot-password' });
    await userEvent.type(await screen.findByTestId('email'), 'nina');
    await userEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Enter a valid email address')).toBeOnTheScreen();
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByTestId('email'));
    await userEvent.type(screen.getByTestId('email'), 'nina@example.com');
    await userEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    // Never says whether the account exists (no account enumeration).
    expect(
      await screen.findByText(/If an account exists for nina@example.com, we've sent it a link/),
    ).toBeOnTheScreen();
  });

  it('shows Auth errors instead of the confirmation', async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: new FakeAuthError('email rate limit exceeded'),
    } as never);
    renderRouter(routes, { initialUrl: '/forgot-password' });
    await userEvent.type(await screen.findByTestId('email'), 'nina@example.com');
    await userEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('email rate limit exceeded')).toBeOnTheScreen();
  });

  it('speaks Portuguese', async () => {
    await act(() => i18n.changeLanguage('pt'));
    renderRouter(routes, { initialUrl: '/forgot-password' });
    expect(
      await screen.findByRole('header', { name: 'Redefinir a palavra-passe' }),
    ).toBeOnTheScreen();
  });
});

describe('reset password', () => {
  const routes = { index: Home, 'auth/reset-password': ResetPasswordScreen };
  const link = '/auth/reset-password?token_hash=pkce_1&type=recovery';

  it('verifies the link, takes a confirmed new password and goes into the app', async () => {
    renderRouter(routes, { initialUrl: link });
    await userEvent.type(await screen.findByTestId('password'), 'new-password-1');
    await userEvent.type(screen.getByTestId('confirm'), 'new-password-2');
    await userEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByText("The passwords don't match")).toBeOnTheScreen();
    expect(auth.updateUser).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByTestId('confirm'));
    await userEvent.type(screen.getByTestId('confirm'), 'new-password-1');
    await userEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'pkce_1', type: 'recovery' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-1' });
    expect(await screen.findByText('Home screen')).toBeOnTheScreen();
  });

  it('requires at least 8 characters, like sign-up', async () => {
    renderRouter(routes, { initialUrl: link });
    await userEvent.type(await screen.findByTestId('password'), 'short');
    await userEvent.type(screen.getByTestId('confirm'), 'short');
    await userEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByText('Use at least 8 characters')).toBeOnTheScreen();
  });

  it('an expired link explains itself and offers a new one', async () => {
    auth.verifyOtp.mockResolvedValueOnce({
      data: null,
      error: new FakeAuthError('Email link is invalid or has expired'),
    } as never);
    renderRouter(
      { ...routes, '(auth)/forgot-password': ForgotPasswordScreen },
      { initialUrl: link },
    );
    expect(
      await screen.findByText('This link is invalid or has expired. Request a new one.'),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Request a new link' }));
    expect(await screen.findByRole('header', { name: 'Reset your password' })).toBeOnTheScreen();
  });

  it('a link without a token is invalid', async () => {
    renderRouter(routes, { initialUrl: '/auth/reset-password' });
    expect(
      await screen.findByText('This link is invalid or has expired. Request a new one.'),
    ).toBeOnTheScreen();
  });

  it('stays reachable for signed-out users instead of redirecting to sign-in', async () => {
    renderRouter(
      {
        _layout: RootLayout,
        '(auth)/_layout': AuthLayout,
        '(auth)/sign-in': SignInScreen,
        'auth/reset-password': ResetPasswordScreen,
      },
      { initialUrl: link },
    );
    expect(await screen.findByRole('header', { name: 'Choose a new password' })).toBeOnTheScreen();
  });

  it('keeps the form when the link signs an onboarded user in (regression: E2E landed on Explore)', async () => {
    // The verified link fires SIGNED_IN; while the profile loads the root layout used to swap the
    // navigator for a loading state, and the remounted navigator opened the app instead.
    const authEvents = new FakeAuthEvents();
    auth.onAuthStateChange.mockImplementation(authEvents.subscribe as never);
    auth.verifyOtp.mockImplementationOnce((async () => {
      await authEvents.emit('SIGNED_IN', fakeSession);
      return { data: {}, error: null };
    }) as never);
    jest.mocked(supabase.from).mockImplementation((() => queryResult(onboardedProfile)) as never);
    renderRouter(
      {
        _layout: RootLayout,
        '(tabs)/_layout': () => null,
        '(tabs)/index': Home,
        '(auth)/_layout': AuthLayout,
        '(auth)/sign-in': SignInScreen,
        'auth/reset-password': ResetPasswordScreen,
      },
      { initialUrl: link },
    );
    expect(await screen.findByTestId('confirm')).toBeOnTheScreen();
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('profiles'));
    expect(await screen.findByRole('header', { name: 'Choose a new password' })).toBeOnTheScreen();
    expect(screen.queryByText('Home screen')).toBeNull();
  });
});
