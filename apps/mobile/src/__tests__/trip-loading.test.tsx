import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useTrip } from '@/features/trips/api';
import { useSharedTrip } from '@/features/trips/sharing-api';
import { supabase } from '@/lib/supabase';
import { queryResult } from '@/testing/test-utils';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
  unwrap: (r: { data: unknown; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
  check: () => undefined,
}));

/** A stop's place as the database returns it (`attraction_details` columns). */
const place = (id: string, nameEn: string) => ({
  id,
  city_slug: 'lisbon',
  name_en: nameEn,
  name_pt: null,
  category: 'monument',
  lat: 38.69,
  lng: -9.21,
  popularity: 90,
  avg_visit_minutes: 45,
  image_url: null,
  is_unesco: false,
});

const tripRow = {
  id: 't1',
  name: 'Belém',
  city_slug: 'lisbon',
  trip_date: null,
  route_geometry: null,
  distance_m: 1200,
  walking_seconds: 900,
  visit_minutes: 20,
  is_fallback: false,
  provider: 'openrouteservice',
  visibility: 'public',
  is_official: false,
  starts_at: null,
  created_at: '2026-09-29T10:00:00+00:00',
};

const sharedRow = {
  ...tripRow,
  is_owner: false,
  author_name: 'Olga',
  review_count: 0,
  rating_avg: null,
  is_saved: false,
  attendee_count: 0,
  is_attending: false,
  stop_ids: ['a', 'b'],
};

/** Fake Supabase for trip pages: tables and `shared_trip`, recording which tables are read. */
class FakeTripBackend {
  static tablesRead: string[] = [];
  static sharedTrip: Record<string, unknown> = {};

  static reset(sharedTrip: Record<string, unknown>) {
    FakeTripBackend.tablesRead = [];
    FakeTripBackend.sharedTrip = sharedTrip;
  }

  static from = (table: string) => {
    FakeTripBackend.tablesRead.push(table);
    if (table === 'trips') {
      return queryResult({
        ...tripRow,
        trip_stops: [
          { position: 1, attraction_details: place('b', 'Belém Tower') },
          { position: 0, attraction_details: place('a', 'Jerónimos Monastery') },
        ],
      });
    }
    if (table === 'attraction_details') {
      return queryResult([place('b', 'Belém Tower'), place('a', 'Jerónimos Monastery')]);
    }
    throw new Error(`unexpected table ${table}`);
  };

  static rpc = async () => ({ data: FakeTripBackend.sharedTrip, error: null });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.mocked(supabase.from).mockImplementation(FakeTripBackend.from as never);
  jest.mocked(supabase.rpc).mockImplementation(FakeTripBackend.rpc as never);
});

const stopIds = (stops: { id: string }[] | undefined) => stops?.map((s) => s.id);

test("the owner's trip page loads in one request: the trip with its stops' places, in order", async () => {
  FakeTripBackend.reset({});
  const { result } = renderHook(() => useTrip('t1'), { wrapper });
  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(stopIds(result.current.data?.stops)).toEqual(['a', 'b']);
  expect(FakeTripBackend.tablesRead).toEqual(['trips']);
});

test('a shared link loads in one call: shared_trip brings the stops', async () => {
  FakeTripBackend.reset({
    status: 'ok',
    trip: { ...sharedRow, stops: [place('a', 'Jerónimos Monastery'), place('b', 'Belém Tower')] },
  });
  const { result } = renderHook(() => useSharedTrip('t1', null), { wrapper });
  await waitFor(() => expect(result.current.data?.status).toBe('ok'));
  const view = result.current.data;
  expect(stopIds(view?.status === 'ok' ? view.trip.stops : undefined)).toEqual(['a', 'b']);
  expect(FakeTripBackend.tablesRead).toEqual([]);
});

test('against a backend without stops in shared_trip, they are read separately', async () => {
  FakeTripBackend.reset({ status: 'ok', trip: sharedRow });
  const { result } = renderHook(() => useSharedTrip('t1', null), { wrapper });
  await waitFor(() => expect(result.current.data?.status).toBe('ok'));
  const view = result.current.data;
  expect(stopIds(view?.status === 'ok' ? view.trip.stops : undefined)).toEqual(['a', 'b']);
  expect(FakeTripBackend.tablesRead).toEqual(['attraction_details']);
});
