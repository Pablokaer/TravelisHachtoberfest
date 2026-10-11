import type { AttractionDetail } from '@/features/destinations/api';
import { MemoryOfflineStore } from '@/features/offline/offline-store';
import { buildOfflineTrip, OfflineTripLibrary } from '@/features/offline/offline-trip';
import {
  removeTripOffline,
  saveTripOffline,
  type MapPacks,
  type SaveDeps,
  type SaveStage,
} from '@/features/offline/save-offline';
import type { TripDetail } from '@/features/trips/api';

const detail = (id: string, imageUrl: string | null = `https://img.example/${id}.jpg`) =>
  ({
    id,
    citySlug: 'lisbon',
    nameEn: `Place ${id}`,
    namePt: null,
    category: 'monument',
    lat: 38.7 + (id === 'b' ? 0.01 : 0),
    lng: -9.2,
    popularity: 1,
    avgVisitMinutes: 30,
    imageUrl,
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
  }) satisfies AttractionDetail;

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

/** Records what was asked of the network-bound parts, and can be told to fail. */
class FakeDownloads {
  fetched: string[][] = [];
  prefetched: string[][] = [];
  packs: { tripId: string; bounds: number[] }[] = [];
  removedPacks: string[] = [];
  failDetails = false;
  failImages = false;
  failMap = false;

  deps(library: OfflineTripLibrary): SaveDeps {
    const mapPacks: MapPacks = {
      download: async (request) => {
        if (this.failMap) throw new Error('tiles unreachable');
        this.packs.push({ tripId: request.tripId, bounds: [...request.bounds] });
        return `pack-${request.tripId}`;
      },
      remove: async (id) => void this.removedPacks.push(id),
    };
    return {
      library,
      styleUrl: 'https://tiles.example/style.json',
      now: () => '2026-10-12T09:00:00Z',
      fetchDetails: async (ids) => {
        this.fetched.push([...ids]);
        if (this.failDetails) throw new Error('offline');
        return ids.map((id) => detail(id));
      },
      images: {
        prefetch: async (urls) => {
          if (this.failImages) throw new Error('images unreachable');
          this.prefetched.push([...urls]);
        },
      },
      mapPacks,
    };
  }
}

describe('saveTripOffline (D-092)', () => {
  test('keeps the places with their texts, the photos and the map of the route', async () => {
    const downloads = new FakeDownloads();
    const library = new OfflineTripLibrary(new MemoryOfflineStore());
    const result = await saveTripOffline(TRIP, downloads.deps(library));
    expect(downloads.fetched).toEqual([['a', 'b']]);
    expect(downloads.prefetched).toEqual([
      ['https://img.example/a.jpg', 'https://img.example/b.jpg'],
    ]);
    expect(downloads.packs).toHaveLength(1);
    expect(result).toMatchObject({ photosSaved: true, mapSaved: true });
    const saved = await library.get('t1');
    expect(saved?.details['a']?.summaryEn).toBe('About a');
    expect(saved?.mapPackId).toBe('pack-t1');
  });

  test('downloads a map area that holds every stop with a margin', async () => {
    const downloads = new FakeDownloads();
    await saveTripOffline(TRIP, downloads.deps(new OfflineTripLibrary(new MemoryOfflineStore())));
    const [west, south, east, north] = downloads.packs[0]!.bounds as [
      number,
      number,
      number,
      number,
    ];
    expect(south).toBeLessThan(38.7);
    expect(north).toBeGreaterThan(38.71);
    expect(west).toBeLessThan(-9.2);
    expect(east).toBeGreaterThan(-9.2);
  });

  test('reports each stage in order', async () => {
    const stages: SaveStage[] = [];
    await saveTripOffline(
      TRIP,
      new FakeDownloads().deps(new OfflineTripLibrary(new MemoryOfflineStore())),
      (stage) => stages.push(stage),
    );
    expect(stages).toEqual(['details', 'photos', 'map', 'done']);
  });

  test('the trip is usable offline even when the photos or the map cannot be saved', async () => {
    const downloads = new FakeDownloads();
    downloads.failImages = true;
    downloads.failMap = true;
    const library = new OfflineTripLibrary(new MemoryOfflineStore());
    const result = await saveTripOffline(TRIP, downloads.deps(library));
    expect(result).toMatchObject({ photosSaved: false, mapSaved: false });
    const saved = await library.get('t1');
    expect(saved).not.toBeNull();
    expect(saved?.mapPackId).toBeNull();
  });

  test('without the details of the places nothing is saved', async () => {
    const downloads = new FakeDownloads();
    downloads.failDetails = true;
    const library = new OfflineTripLibrary(new MemoryOfflineStore());
    await expect(saveTripOffline(TRIP, downloads.deps(library))).rejects.toThrow('offline');
    expect(await library.list()).toEqual([]);
  });

  test('saving the same trip again replaces the copy and its old map pack', async () => {
    const downloads = new FakeDownloads();
    const library = new OfflineTripLibrary(new MemoryOfflineStore());
    await saveTripOffline(TRIP, downloads.deps(library));
    await saveTripOffline(TRIP, downloads.deps(library));
    expect(await library.list()).toHaveLength(1);
    expect(downloads.removedPacks).toEqual(['pack-t1']);
  });
});

describe('removeTripOffline', () => {
  test('forgets the copy and deletes its map pack', async () => {
    const downloads = new FakeDownloads();
    const library = new OfflineTripLibrary(new MemoryOfflineStore());
    await saveTripOffline(TRIP, downloads.deps(library));
    await removeTripOffline('t1', downloads.deps(library));
    expect(await library.get('t1')).toBeNull();
    expect(downloads.removedPacks).toEqual(['pack-t1']);
  });

  test('a trip that was never saved is fine to remove', async () => {
    const downloads = new FakeDownloads();
    const library = new OfflineTripLibrary(new MemoryOfflineStore());
    await expect(removeTripOffline('nope', downloads.deps(library))).resolves.toBeUndefined();
    expect(downloads.removedPacks).toEqual([]);
  });

  test('a map pack that cannot be deleted does not keep the copy', async () => {
    const downloads = new FakeDownloads();
    const library = new OfflineTripLibrary(new MemoryOfflineStore());
    await library.save(
      buildOfflineTrip(TRIP, [detail('a'), detail('b')], '2026-10-12T09:00:00Z', 'pack-x'),
    );
    const deps = downloads.deps(library);
    deps.mapPacks.remove = async () => {
      throw new Error('native error');
    };
    await removeTripOffline('t1', deps);
    expect(await library.get('t1')).toBeNull();
  });
});
