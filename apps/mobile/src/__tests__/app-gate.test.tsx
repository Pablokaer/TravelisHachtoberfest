import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { canEnterApp } from '@/features/auth/app-gate';
import { useProfile } from '@/features/profile/api';

/** How many times the profile was asked of the backend, and what it answered. */
class MockBackend {
  static profileCalls = 0;
}

jest.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } }, isLoading: false }),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'single']) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => {
        MockBackend.profileCalls += 1;
        return resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } });
      };
      return chain;
    },
  },
  unwrap: (r: { data: unknown; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
  check: () => undefined,
}));

describe('canEnterApp (D-092)', () => {
  const base = { localMode: false, signedIn: true, onboarded: true, profileFailed: false };

  test('a signed-in, onboarded traveller enters', () => {
    expect(canEnterApp(base)).toBe(true);
  });

  test('local mode always enters', () => {
    expect(canEnterApp({ ...base, localMode: true, signedIn: false, onboarded: false })).toBe(true);
  });

  test('a signed-in traveller who still has to onboard does not enter', () => {
    expect(canEnterApp({ ...base, onboarded: false })).toBe(false);
  });

  test('when the profile cannot be loaded (no connection) a signed-in traveller still enters', () => {
    expect(canEnterApp({ ...base, onboarded: false, profileFailed: true })).toBe(true);
  });

  test('nobody enters without a session, whatever the profile says', () => {
    expect(canEnterApp({ ...base, signedIn: false, profileFailed: true })).toBe(false);
  });
});

describe('useProfile with no connection (D-092)', () => {
  const wrapper = (client: QueryClient) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };

  test('settles as an error and a screen mounting later does not start the requests again', async () => {
    MockBackend.profileCalls = 0;
    const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 1 } } });
    const first = renderHook(() => useProfile(), { wrapper: wrapper(client) });
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    const afterFirst = MockBackend.profileCalls;
    // Every screen calls useProfile: each one mounting must not flip the query back to loading,
    // or the root screen swaps to "Loading" again and again and no screen can open.
    const second = renderHook(() => useProfile(), { wrapper: wrapper(client) });
    const third = renderHook(() => useProfile(), { wrapper: wrapper(client) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(MockBackend.profileCalls).toBe(afterFirst);
    expect(second.result.current.isPending).toBe(false);
    expect(third.result.current.isError).toBe(true);
  });
});
