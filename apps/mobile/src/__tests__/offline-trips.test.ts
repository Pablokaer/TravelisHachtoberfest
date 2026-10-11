import type { AttractionDetail } from '@/features/destinations/api';
import {
  buildOfflineTrip,
  offlineSummaryOf,
  OfflineTripLibrary,
  parseOfflineTrip,
  photoUrlsOf,
} from '@/features/offline/offline-trip';
import { MemoryOfflineStore } from '@/features/offline/offline-store';
import type { TripDetail } from '@/features/trips/api';

const stop = (id: string, over: Partial<AttractionDetail> = {}): AttractionDetail => ({
  id,
  citySlug: 'lisbon',
  nameEn: `Place ${id}`,
  namePt: null,
  category: 'monument',
  lat: 38.7,
  lng: -9.2,
  popularity: 10,
  avgVisitMinutes: 30,
  imageUrl: `https://img.example/${id}.jpg`,
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
  ...over,
});

const tripOf = (id: string, ids: string[], name = 'Old town'): TripDetail => ({
  id,
  name,
  citySlug: 'lisbon',
  tripDate: null,
  distanceM: 2400,
  walkingSeconds: 1800,
  visitMinutes: 120,
  stopCount: ids.length,
  createdAt: '2026-10-01T10:00:00Z',
  visibility: 'private',
  isOfficial: false,
  startsAt: null,
  geometry: {
    type: 'LineString',
    coordinates: [
      [-9.2, 38.7],
      [-9.19, 38.71],
    ],
  },
  isFallback: false,
  provider: 'osm-foot',
  stops: ids.map((i) => stop(i)),
});

const library = () => new OfflineTripLibrary(new MemoryOfflineStore());

describe('buildOfflineTrip (D-092)', () => {
  test('keeps the trip, one detail per stop and when it was saved', () => {
    const offline = buildOfflineTrip(
      tripOf('t1', ['a', 'b']),
      [stop('a'), stop('b')],
      '2026-10-12T09:00:00Z',
    );
    expect(offline.version).toBe(1);
    expect(offline.savedAt).toBe('2026-10-12T09:00:00Z');
    expect(Object.keys(offline.details)).toEqual(['a', 'b']);
    expect(offline.trip.geometry?.coordinates).toHaveLength(2);
    expect(offline.mapPackId).toBeNull();
  });

  test('a stop without its details is an error naming it', () => {
    expect(() =>
      buildOfflineTrip(tripOf('t1', ['a', 'b']), [stop('a')], '2026-10-12T09:00:00Z'),
    ).toThrow(/'b'/);
  });
});

describe('photoUrlsOf', () => {
  test('lists each stop photo once and skips places without one', () => {
    const offline = buildOfflineTrip(
      tripOf('t1', ['a', 'b', 'c']),
      [
        stop('a'),
        stop('b', { imageUrl: null }),
        stop('c', { imageUrl: 'https://img.example/a.jpg' }),
      ],
      '2026-10-12T09:00:00Z',
    );
    expect(photoUrlsOf(offline)).toEqual(['https://img.example/a.jpg']);
  });
});

describe('parseOfflineTrip', () => {
  test('reads back what was written', () => {
    const offline = buildOfflineTrip(tripOf('t1', ['a']), [stop('a')], '2026-10-12T09:00:00Z');
    expect(parseOfflineTrip(JSON.stringify(offline))).toEqual(offline);
  });

  test.each([
    ['text that is not JSON', '{oops'],
    ['an unknown version', JSON.stringify({ version: 99 })],
    ['a copy without stops', JSON.stringify({ version: 1, trip: { id: 't' }, details: {} })],
    ['null', 'null'],
    [
      'a save date that is not a date',
      JSON.stringify({
        version: 1,
        savedAt: 'yesterday',
        trip: { id: 't', stops: [] },
        details: {},
      }),
    ],
  ])('%s is no copy: null, not a crash', (_name, text) => {
    expect(parseOfflineTrip(text)).toBeNull();
  });
});

describe('OfflineTripLibrary', () => {
  test('saves and returns a trip by id', async () => {
    const lib = library();
    const offline = buildOfflineTrip(tripOf('t1', ['a']), [stop('a')], '2026-10-12T09:00:00Z');
    await lib.save(offline);
    expect(await lib.get('t1')).toEqual(offline);
    expect(await lib.get('missing')).toBeNull();
  });

  test('lists the newest copy first', async () => {
    const lib = library();
    await lib.save(buildOfflineTrip(tripOf('old', ['a']), [stop('a')], '2026-10-01T00:00:00Z'));
    await lib.save(buildOfflineTrip(tripOf('new', ['a']), [stop('a')], '2026-10-09T00:00:00Z'));
    expect((await lib.list()).map((o) => o.trip.id)).toEqual(['new', 'old']);
  });

  test('saving a trip again replaces its copy', async () => {
    const lib = library();
    await lib.save(
      buildOfflineTrip(tripOf('t1', ['a'], 'First'), [stop('a')], '2026-10-01T00:00:00Z'),
    );
    await lib.save(
      buildOfflineTrip(tripOf('t1', ['a'], 'Second'), [stop('a')], '2026-10-02T00:00:00Z'),
    );
    const all = await lib.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.trip.name).toBe('Second');
  });

  test('removes a copy', async () => {
    const lib = library();
    await lib.save(buildOfflineTrip(tripOf('t1', ['a']), [stop('a')], '2026-10-12T09:00:00Z'));
    await lib.remove('t1');
    expect(await lib.get('t1')).toBeNull();
    expect(await lib.list()).toEqual([]);
  });

  test('a damaged file is skipped by the list and reads as no copy', async () => {
    const store = new MemoryOfflineStore();
    await store.write('trip-bad.json', '{oops');
    const lib = new OfflineTripLibrary(store);
    await lib.save(buildOfflineTrip(tripOf('t1', ['a']), [stop('a')], '2026-10-12T09:00:00Z'));
    expect((await lib.list()).map((o) => o.trip.id)).toEqual(['t1']);
    expect(await lib.get('bad')).toBeNull();
  });

  test('finds the details of a place in whichever saved trip holds it', async () => {
    const lib = library();
    await lib.save(buildOfflineTrip(tripOf('t1', ['a']), [stop('a')], '2026-10-12T09:00:00Z'));
    await lib.save(
      buildOfflineTrip(
        tripOf('t2', ['b']),
        [stop('b', { summaryEn: 'About b!' })],
        '2026-10-12T09:00:00Z',
      ),
    );
    expect((await lib.detailOf('b'))?.summaryEn).toBe('About b!');
    expect(await lib.detailOf('zzz')).toBeNull();
  });
});

describe('offlineSummaryOf', () => {
  test('is the My Trips row of a saved copy', () => {
    const offline = buildOfflineTrip(
      tripOf('t1', ['a', 'b']),
      [stop('a'), stop('b')],
      '2026-10-12T09:00:00Z',
    );
    expect(offlineSummaryOf(offline)).toMatchObject({
      id: 't1',
      name: 'Old town',
      citySlug: 'lisbon',
      stopCount: 2,
      distanceM: 2400,
    });
  });
});
