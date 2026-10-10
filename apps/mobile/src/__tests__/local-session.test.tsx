import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import { Text } from 'react-native';

import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { featuresWrapper } from '@/testing/features';
import { fakeSession } from '@/testing/test-utils';

/** What the Supabase Auth client answers in each test. */
class MockAuth {
  static stored: Session | null = null;
  static anonymous: { session: Session | null; error: Error | null } = {
    session: fakeSession,
    error: null,
  };
  static anonymousCalls = 0;
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: MockAuth.stored }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signInAnonymously: async () => {
        MockAuth.anonymousCalls += 1;
        return {
          data: { session: MockAuth.anonymous.session },
          error: MockAuth.anonymous.error,
        };
      },
    },
  },
}));

function SessionProbe() {
  const { session, isLoading } = useAuth();
  return <Text testID="auth">{isLoading ? 'loading' : (session?.user.id ?? 'none')}</Text>;
}

function renderProvider(localMode: boolean) {
  const Features = featuresWrapper({ localMode });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Features>
        <AuthProvider>
          <SessionProbe />
        </AuthProvider>
      </Features>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  MockAuth.stored = null;
  MockAuth.anonymous = { session: fakeSession, error: null };
  MockAuth.anonymousCalls = 0;
});

describe('local mode session (D-078)', () => {
  test('without a session, local mode starts a silent anonymous one so trips can be saved', async () => {
    renderProvider(true);
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('user-1'));
    expect(MockAuth.anonymousCalls).toBe(1);
  });

  test('an existing session is kept: nobody is signed in twice', async () => {
    MockAuth.stored = { ...fakeSession, user: { ...fakeSession.user, id: 'user-9' } };
    renderProvider(true);
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('user-9'));
    expect(MockAuth.anonymousCalls).toBe(0);
  });

  test('outside local mode nothing is signed in on its own', async () => {
    renderProvider(false);
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('none'));
    expect(MockAuth.anonymousCalls).toBe(0);
  });

  test('when Supabase refuses anonymous sign-ins the app still opens, without an account', async () => {
    MockAuth.anonymous = { session: null, error: new Error('Anonymous sign-ins are disabled') };
    renderProvider(true);
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('none'));
  });
});
