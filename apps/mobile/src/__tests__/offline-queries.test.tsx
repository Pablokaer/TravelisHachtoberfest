import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useAttraction, type AttractionDetail } from '@/features/destinations/api';
import { MemoryOfflineStore } from '@/features/offline/offline-store';
import { buildOfflineTrip, OfflineTripLibrary } from '@/features/offline/offline-trip';
import { useTrip, useTrips, type TripDetail } from '@/features/trips/api';

/** The library the hooks read, and whether the backend answers, in each test. */
class MockDevice {
  static library = new OfflineTripLibrary(new MemoryOfflineStore());
  static networkDown = true;
}

jest.mock('@/features/offline/library', () => ({
  offlineLibrary: {
    get: (id: string) => MockDevice.library.get(id),
    list: () => MockDevice.library.list(),
    save: (copy: never) => MockDevice.library.save(copy),
    remove: (id: string) => MockDevice.library.remove(id),
    detailOf: (id: string) => MockDevice.library.detailOf(id),
  },
}));

/** A Supabase client whose every query fails like a phone with no signal. */
jest.mock('@/lib/supabase', () => {
  const failure = { data: null, error: { message: 'TypeError: Failed to fetch' } };
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'single', 'maybeSingle', 'limit']) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve(failure);
  return {
    supabase: { from: () => chain, rpc: async () => failure },
    unwrap: (result: { data: unknown; error: { message: string } | null }) => {
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    check: () => undefined,
  };
});

const detail = (id: string): AttractionDetail => ({
  id,
  citySlug: 'lisbon',
  nameEn: `Place ${id}`,
  namePt: null,
  category: 'monument',
  lat: 38.7,
  lng: -9.2,
  popularity: 1,
  avgVisitMinutes: 30,
  imageUrl: null,
  isUnesco: false,
  descriptionEn: null,
  descriptionPt: null,
  imageAuthor: null,
  imageLicense: null,
  imageLicenseUrl: null,
  imagePageUrl: null,
  website: null,
  wikipediaEn: null,
  wikipediaPt: null,
  openingHours: null,
  fee: null,
  wikidataId: `Q${id}`,
  summaryEn: `About ${id}`,
  summaryPt: null,
  historyEn: null,
  historyPt: null,
});

const TRIP: TripDetail = {
  id: 't1',
  name: 'Old town',
  citySlug: 'lisbon',
  tripDate: null,
  distanceM: 1000,
  walkingSeconds: 800,
  visitMinutes: 60,
  stopCount: 2,
  createdAt: '2026-10-01T10:00:00Z',
  visibility: 'private',
  isOfficial: false,
  startsAt: null,
  geometry: null,
  isFallback: false,
  provider: 'osm-foot',
  stops: [detail('a'), detail('b')],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  MockDevice.library = new OfflineTripLibrary(new MemoryOfflineStore());
});

describe('with no connection, the screens read the saved copies (D-092)', () => {
  test('a trip opens from its copy, marked as one', async () => {
    await MockDevice.library.save(
      buildOfflineTrip(TRIP, [detail('a'), detail('b')], '2026-10-12T09:00:00Z'),
    );
    const { result } = renderHook(() => useTrip('t1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe('Old town');
    expect(result.current.data?.fromOffline).toBe(true);
    expect(result.current.data?.stops).toHaveLength(2);
  });

  test('a trip with no copy is an error, as before', async () => {
    const { result } = renderHook(() => useTrip('nothing'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/Failed to fetch/);
  });

  test('My Trips lists the copies', async () => {
    await MockDevice.library.save(
      buildOfflineTrip(TRIP, [detail('a'), detail('b')], '2026-10-12T09:00:00Z'),
    );
    const { result } = renderHook(() => useTrips(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((t) => t.name)).toEqual(['Old town']);
  });

  test('My Trips with no copies is an error, as before', async () => {
    const { result } = renderHook(() => useTrips(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  test('a place opens with the text that was saved', async () => {
    await MockDevice.library.save(
      buildOfflineTrip(TRIP, [detail('a'), detail('b')], '2026-10-12T09:00:00Z'),
    );
    const { result } = renderHook(() => useAttraction('a'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.detail?.summaryEn).toBe('About a');
  });

  test('a place that was not saved is an error, as before', async () => {
    const { result } = renderHook(() => useAttraction('zzz'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
