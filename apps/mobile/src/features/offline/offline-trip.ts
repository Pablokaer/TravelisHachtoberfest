// A trip saved on the device (D-092): the trip itself (stops, street path, totals) and, for each
// stop, the full place (its Wikipedia text, opening hours, photo credit), so the trip, its places
// and the in-app navigation open with no connection.
import type { AttractionDetail } from '@/features/destinations/api';
import type { TripDetail, TripSummary } from '@/features/trips/api';
import type { OfflineStore } from './offline-store';

export const OFFLINE_VERSION = 1;
const FILE_PREFIX = 'trip-';
const FILE_SUFFIX = '.json';

export type OfflineTrip = {
  version: typeof OFFLINE_VERSION;
  /** ISO time the copy was made. */
  savedAt: string;
  trip: TripDetail;
  /** Every stop's full place, by id. */
  details: Record<string, AttractionDetail>;
  /** The downloaded map area of the route (native only), so it can be deleted with the copy. */
  mapPackId: string | null;
};

/**
 * @example buildOfflineTrip(trip, details, new Date().toISOString()).details['a']?.summaryEn
 */
export function buildOfflineTrip(
  trip: TripDetail,
  details: readonly AttractionDetail[],
  savedAt: string,
  mapPackId: string | null = null,
): OfflineTrip {
  const byId = Object.fromEntries(details.map((d) => [d.id, d]));
  for (const stop of trip.stops) {
    if (!byId[stop.id]) throw new Error(`stop '${stop.id}' of the trip has no details to save`);
  }
  const kept = Object.fromEntries(trip.stops.map((s) => [s.id, byId[s.id]!]));
  return { version: OFFLINE_VERSION, savedAt, trip, details: kept, mapPackId };
}

/** Each stop's photo once: what the image cache has to download. */
export function photoUrlsOf(offline: OfflineTrip): string[] {
  const urls = Object.values(offline.details).flatMap((d) => (d.imageUrl ? [d.imageUrl] : []));
  return [...new Set(urls)];
}

/** The My Trips row of a saved copy (no cover photo: it is not downloaded for the list). */
export function offlineSummaryOf(offline: OfflineTrip): TripSummary {
  const { trip } = offline;
  return {
    id: trip.id,
    name: trip.name,
    citySlug: trip.citySlug,
    tripDate: trip.tripDate,
    distanceM: trip.distanceM,
    walkingSeconds: trip.walkingSeconds,
    visitMinutes: trip.visitMinutes,
    stopCount: trip.stops.length,
    createdAt: trip.createdAt,
    visibility: trip.visibility,
    cover: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The copy a file holds, or null for damaged text or another version: never a crash. */
export function parseOfflineTrip(text: string): OfflineTrip | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== OFFLINE_VERSION) return null;
  const trip = value.trip;
  if (!isRecord(trip) || typeof trip.id !== 'string' || !Array.isArray(trip.stops)) return null;
  if (!isRecord(value.details)) return null;
  // The save date is formatted on screen: a damaged one must not crash it.
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) return null;
  return value as unknown as OfflineTrip;
}

const fileOf = (tripId: string) => `${FILE_PREFIX}${tripId}${FILE_SUFFIX}`;

/**
 * The trips saved on the device, over an OfflineStore.
 * @example const copy = await new OfflineTripLibrary(store).get(tripId);
 */
export class OfflineTripLibrary {
  constructor(private readonly store: OfflineStore) {}

  async save(offline: OfflineTrip): Promise<void> {
    await this.store.write(fileOf(offline.trip.id), JSON.stringify(offline));
  }

  async get(tripId: string): Promise<OfflineTrip | null> {
    const text = await this.store.read(fileOf(tripId));
    return text === null ? null : parseOfflineTrip(text);
  }

  async remove(tripId: string): Promise<void> {
    await this.store.remove(fileOf(tripId));
  }

  /** Every readable copy, newest first; a damaged file is skipped. */
  async list(): Promise<OfflineTrip[]> {
    const names = (await this.store.names()).filter(
      (n) => n.startsWith(FILE_PREFIX) && n.endsWith(FILE_SUFFIX),
    );
    const copies = await Promise.all(
      names.map(async (name) => {
        const text = await this.store.read(name);
        return text === null ? null : parseOfflineTrip(text);
      }),
    );
    return copies
      .filter((copy): copy is OfflineTrip => copy !== null)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  /** A place's full details from whichever saved trip holds it. */
  async detailOf(attractionId: string): Promise<AttractionDetail | null> {
    for (const copy of await this.list()) {
      const found = copy.details[attractionId];
      if (found) return found;
    }
    return null;
  }
}
