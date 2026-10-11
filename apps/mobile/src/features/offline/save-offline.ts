// "Save for offline" (D-092): download what a trip needs, in the order that matters most. The
// places and their texts come first and are saved at once, so the trip works offline even if the
// photos or the map area then fail; those two are best effort and reported, not fatal.
import type { AttractionDetail } from '@/features/destinations/api';
import type { TripDetail } from '@/features/trips/api';
import { routeBounds } from './map-bounds';
import {
  buildOfflineTrip,
  photoUrlsOf,
  type OfflineTrip,
  type OfflineTripLibrary,
} from './offline-trip';

export type SaveStage = 'details' | 'photos' | 'map' | 'done';

export type MapPackRequest = {
  tripId: string;
  bounds: [number, number, number, number];
  styleUrl: string;
};

/** The map area store: native packs on a phone, nothing on the web. */
export interface MapPacks {
  /** Downloads the area and resolves with the pack's id once it is complete. */
  download(request: MapPackRequest, onPercent?: (percent: number) => void): Promise<string | null>;
  remove(packId: string): Promise<void>;
}

export interface ImageCache {
  prefetch(urls: string[]): Promise<void>;
}

export type SaveDeps = {
  library: OfflineTripLibrary;
  fetchDetails: (ids: string[]) => Promise<AttractionDetail[]>;
  images: ImageCache;
  mapPacks: MapPacks;
  styleUrl: string;
  now: () => string;
};

export type SaveResult = { offline: OfflineTrip; photosSaved: boolean; mapSaved: boolean };

async function bestEffort(work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves `trip` on the device. Fails only when the places cannot be fetched.
 * @example const { mapSaved } = await saveTripOffline(trip, deps, (stage) => setStage(stage));
 */
export async function saveTripOffline(
  trip: TripDetail,
  deps: SaveDeps,
  onStage: (stage: SaveStage) => void = () => undefined,
  onMapPercent?: (percent: number) => void,
): Promise<SaveResult> {
  onStage('details');
  const details = await deps.fetchDetails(trip.stops.map((s) => s.id));
  const previous = await deps.library.get(trip.id);
  let offline = buildOfflineTrip(trip, details, deps.now());
  await deps.library.save(offline);
  if (previous?.mapPackId) await bestEffort(() => deps.mapPacks.remove(previous.mapPackId!));

  onStage('photos');
  const photosSaved = await bestEffort(() => deps.images.prefetch(photoUrlsOf(offline)));

  onStage('map');
  let packId: string | null = null;
  const bounds = routeBounds(trip.stops);
  const mapSaved = await bestEffort(async () => {
    packId = await deps.mapPacks.download(
      { tripId: trip.id, bounds, styleUrl: deps.styleUrl },
      onMapPercent,
    );
  });
  if (packId) {
    offline = { ...offline, mapPackId: packId };
    await deps.library.save(offline);
  }
  onStage('done');
  return { offline, photosSaved, mapSaved: mapSaved && packId !== null };
}

/** Forgets a saved trip and deletes its map area; a map area that cannot be deleted is skipped. */
export async function removeTripOffline(tripId: string, deps: SaveDeps): Promise<void> {
  const copy = await deps.library.get(tripId);
  if (copy?.mapPackId) await bestEffort(() => deps.mapPacks.remove(copy.mapPackId!));
  await deps.library.remove(tripId);
}
