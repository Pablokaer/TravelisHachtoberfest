import { ROUTE_MAX_STOPS } from '@wayfarer/shared';

import type { AttractionSummary } from '@/features/destinations/api';
import { useRouteStore } from '@/features/route/store';
import {
  routeTitle,
  suggestedRouteFromRow,
  type SuggestedRouteRow,
} from '@/features/suggested/api';
import { findUserPosition, type LocationSource } from '@/features/suggested/location';

function fakeStop(id: string, citySlug = 'lisbon'): AttractionSummary {
  return {
    id,
    citySlug,
    nameEn: `Place ${id}`,
    namePt: null,
    category: 'monument',
    lat: 38.7,
    lng: -9.1,
    popularity: 1,
    avgVisitMinutes: 30,
    imageUrl: null,
    isUnesco: false,
  };
}

const place = (id: string) => ({
  id,
  city_slug: 'lisbon',
  name_en: `Place ${id}`,
  name_pt: null,
  category: 'monument' as const,
  lat: 38.7,
  lng: -9.1,
  popularity: 10,
  avg_visit_minutes: 30,
  image_url: null,
  is_unesco: false,
});

const row = (stops: SuggestedRouteRow['suggested_route_stops']): SuggestedRouteRow => ({
  id: 'r1',
  city_slug: 'lisbon',
  slug: 'old-town',
  theme: 'medieval',
  title_en: 'Old town',
  title_pt: 'Cidade velha',
  generated_by: 'rules',
  distance_m: 2000,
  walking_seconds: 1600,
  visit_minutes: 90,
  suggested_route_stops: stops,
});

describe('suggestedRouteFromRow', () => {
  test('puts the stops in walking order, whatever order the server returned them', () => {
    const route = suggestedRouteFromRow(
      row([
        { position: 2, attraction_details: place('c') },
        { position: 0, attraction_details: place('a') },
        { position: 1, attraction_details: place('b') },
      ]),
    );
    expect(route.stops.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(route.citySlug).toBe('lisbon');
    expect(route.titlePt).toBe('Cidade velha');
  });

  test('skips a stop whose place is missing', () => {
    const route = suggestedRouteFromRow(
      row([
        { position: 0, attraction_details: place('a') },
        { position: 1, attraction_details: null },
      ]),
    );
    expect(route.stops.map((s) => s.id)).toEqual(['a']);
  });
});

describe('routeTitle', () => {
  const route = suggestedRouteFromRow(row([]));

  test('follows the language', () => {
    expect(routeTitle(route, 'en')).toBe('Old town');
    expect(routeTitle(route, 'pt')).toBe('Cidade velha');
  });
});

describe('route store startRoute', () => {
  beforeEach(() => useRouteStore.getState().clear());

  test('replaces the tray with the suggested route, first stop first', () => {
    useRouteStore.getState().toggle(fakeStop('old', 'porto'));
    useRouteStore.getState().startRoute([fakeStop('a'), fakeStop('b'), fakeStop('c')]);
    const state = useRouteStore.getState();
    expect(state.citySlug).toBe('lisbon');
    expect(state.stops.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(state.routes).toHaveLength(1);
  });

  test('keeps at most ROUTE_MAX_STOPS stops and ignores an empty route', () => {
    const many = Array.from({ length: ROUTE_MAX_STOPS + 3 }, (_, i) => fakeStop(`s${i}`));
    useRouteStore.getState().startRoute(many);
    expect(useRouteStore.getState().stops).toHaveLength(ROUTE_MAX_STOPS);
    useRouteStore.getState().startRoute([]);
    expect(useRouteStore.getState().stops).toHaveLength(ROUTE_MAX_STOPS);
  });
});

/** A fake of the device's location service: the answer is set by each test. */
class FakeLocationSource implements LocationSource {
  constructor(
    private readonly answer: 'granted' | 'denied' | 'throws',
    readonly asked: boolean[] = [],
  ) {}

  async requestPosition(askPermission: boolean) {
    this.asked.push(askPermission);
    if (this.answer === 'throws') throw new Error('GPS off');
    if (this.answer === 'denied') return null;
    return { lat: 38.71, lng: -9.14 };
  }
}

describe('findUserPosition', () => {
  test('returns the position of a granted source', async () => {
    expect(await findUserPosition(new FakeLocationSource('granted'), true)).toEqual({
      status: 'found',
      position: { lat: 38.71, lng: -9.14 },
    });
  });

  test('reports denied permission without a position', async () => {
    expect(await findUserPosition(new FakeLocationSource('denied'), true)).toEqual({
      status: 'denied',
    });
  });

  test('turns a failing source into an error state instead of throwing', async () => {
    expect(await findUserPosition(new FakeLocationSource('throws'), true)).toEqual({
      status: 'error',
      message: 'GPS off',
    });
  });

  test('passes on whether the user may be asked for permission', async () => {
    const source = new FakeLocationSource('granted');
    await findUserPosition(source, false);
    expect(source.asked).toEqual([false]);
  });
});
