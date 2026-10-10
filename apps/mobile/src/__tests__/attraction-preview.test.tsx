import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import AttractionScreen from '@/app/attraction/[id]';
import {
  destinationKeys,
  useAttraction,
  type AttractionSummary,
} from '@/features/destinations/api';
import '@/lib/i18n';

/** The attraction as the city page's list already has it (no description, hours or credit). */
const tower: AttractionSummary = {
  id: 'a1',
  citySlug: 'lisbon',
  nameEn: 'Belém Tower',
  namePt: 'Torre de Belém',
  category: 'monument',
  lat: 38.69,
  lng: -9.21,
  popularity: 90,
  avgVisitMinutes: 45,
  imageUrl: null,
  isUnesco: true,
};

/** Supabase whose `attraction_details` request never answers: the page stays loading. */
class MockPendingDetailsSupabase {
  static from = jest.fn((_table: string) => ({
    select: () => ({ eq: () => ({ single: () => new Promise(() => undefined) }) }),
  }));
}

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => MockPendingDetailsSupabase.from(table) },
  unwrap: (r: { data: unknown }) => r.data,
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'a1' }),
}));
jest.mock('@/features/reviews/api', () => {
  const idle = { isPending: false, error: null, mutate: jest.fn() };
  return {
    ...jest.requireActual('@/features/reviews/api'),
    useReviews: () => ({ data: [], isPending: true }),
    useRatingSummary: () => ({ data: undefined }),
    useSaveReview: () => idle,
    useDeleteReview: () => idle,
  };
});

/** A query cache holding Lisbon's places, as after the city page (or its prefetch). */
function cacheWithLisbon(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(destinationKeys.attractions('lisbon'), { items: [tower], cut: false });
  return client;
}

function withClient(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useAttraction', () => {
  test("starts from the city list's row while the details load", () => {
    const { result } = renderHook(() => useAttraction('a1'), {
      wrapper: withClient(cacheWithLisbon()),
    });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual({ summary: tower, detail: null });
  });

  test('a place no cached list has stays pending', () => {
    const { result } = renderHook(() => useAttraction('elsewhere'), {
      wrapper: withClient(cacheWithLisbon()),
    });
    expect(result.current.isPending).toBe(true);
  });
});

describe('AttractionScreen while the details load', () => {
  test('shows the header from the list row right away and a skeleton for the rest', () => {
    render(<AttractionScreen />, { wrapper: withClient(cacheWithLisbon()) });
    expect(screen.getByText('Belém Tower')).toBeTruthy();
    expect(screen.getByText('Monuments')).toBeTruthy();
    expect(screen.getByText('~45 min')).toBeTruthy();
    expect(screen.getByTestId('attraction-details-loading')).toBeTruthy();
    expect(screen.queryByText('Opening hours')).toBeNull();
  });
});
