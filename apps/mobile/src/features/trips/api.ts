import type {
  AttractionCategory,
  LineString,
  RouteResponse,
  TripVisibility,
} from '@wayfarer/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AttractionSummary, PhotoCover } from '@/features/destinations/api';
import { walklistCoverFrom } from '@/features/trips/walklist-cover';
import { check, supabase, unwrap } from '@/lib/supabase';
import { subscriptionKeys } from '@/features/subscription/api';

export type TripSummary = {
  id: string;
  name: string;
  citySlug: string;
  tripDate: string | null;
  distanceM: number | null;
  walkingSeconds: number | null;
  visitMinutes: number | null;
  stopCount: number;
  createdAt: string;
  /** Who can open the trip by link (D-031). */
  visibility: TripVisibility;
  /** Photo of the starting point, for the card (D-038). */
  cover: PhotoCover | null;
};

// The detail page shows the stops' own photos, so it has no cover.
export type TripDetail = Omit<TripSummary, 'cover'> & {
  /** Marked official by a moderator (D-035). */
  isOfficial: boolean;
  /** Meetup start (D-041); null without a time. */
  startsAt: string | null;
  geometry: LineString | null;
  isFallback: boolean;
  provider: string | null;
  stops: AttractionSummary[];
};

export const tripKeys = {
  all: ['trips'] as const,
  detail: (id: string) => ['trips', id] as const,
};

export function useTrips() {
  return useQuery({
    queryKey: tripKeys.all,
    queryFn: async (): Promise<TripSummary[]> => {
      const rows = unwrap(
        await supabase
          .from('trips')
          .select(
            'id, name, city_slug, trip_date, distance_m, walking_seconds, visit_minutes, created_at, visibility, trip_stops(count), walklist_cover',
          )
          .order('created_at', { ascending: false }),
      );
      return rows.map(tripSummaryFromRow);
    },
  });
}

/** A My Trips row: the trip, its stop count and its cover (computed column, D-038). */
type TripSummaryRow = {
  id: string;
  name: string;
  city_slug: string;
  trip_date: string | null;
  distance_m: number | null;
  walking_seconds: number | null;
  visit_minutes: number | null;
  created_at: string;
  visibility: string;
  trip_stops: unknown;
  walklist_cover: unknown;
};

/**
 * @example tripSummaryFromRow({ ...row, trip_stops: [{ count: 4 }] }).stopCount // 4
 */
export function tripSummaryFromRow(r: TripSummaryRow): TripSummary {
  return {
    id: r.id,
    name: r.name,
    citySlug: r.city_slug,
    tripDate: r.trip_date,
    distanceM: r.distance_m,
    walkingSeconds: r.walking_seconds,
    visitMinutes: r.visit_minutes,
    createdAt: r.created_at,
    visibility: r.visibility as TripVisibility,
    stopCount: (r.trip_stops as { count: number }[])[0]?.count ?? 0,
    cover: walklistCoverFrom(r.walklist_cover),
  };
}

/**
 * The caller's own trip, for its editing page; null when it is not theirs (or does not exist):
 * `trips` is owner-only under RLS, whatever the visibility (D-040).
 * @example const trip = useTrip(id); if (trip.data === null) showReadOnlyView();
 */
export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: tripKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<TripDetail | null> => {
      // One request (D-057): the trip with its stops' places, embedded through trip_stops.
      const { data: trip, error } = await supabase
        .from('trips')
        .select(TRIP_WITH_STOP_PLACES)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!trip) return null;
      const stops = stopPlacesInOrder(trip.trip_stops);
      return tripDetailFromRow({ ...trip, visibility: trip.visibility as TripVisibility }, stops);
    },
  });
}

/** A trip's columns, as `trips` and `shared_trip` both return them. */
export type TripRow = {
  id: string;
  name: string;
  city_slug: string;
  trip_date: string | null;
  route_geometry: unknown;
  distance_m: number | null;
  walking_seconds: number | null;
  visit_minutes: number | null;
  is_fallback: boolean;
  provider: string | null;
  visibility: TripVisibility;
  is_official: boolean;
  starts_at: string | null;
  created_at: string;
};

/**
 * @example tripDetailFromRow(row, await fetchTripStops(ids)).stopCount // ids.length
 */
export function tripDetailFromRow(trip: TripRow, stops: AttractionSummary[]): TripDetail {
  return {
    id: trip.id,
    name: trip.name,
    citySlug: trip.city_slug,
    tripDate: trip.trip_date,
    distanceM: trip.distance_m,
    walkingSeconds: trip.walking_seconds,
    visitMinutes: trip.visit_minutes,
    createdAt: trip.created_at,
    stopCount: stops.length,
    visibility: trip.visibility,
    isOfficial: trip.is_official,
    startsAt: trip.starts_at,
    geometry: (trip.route_geometry as LineString | null) ?? null,
    isFallback: trip.is_fallback,
    provider: trip.provider,
    stops,
  };
}

/** The `attraction_details` columns a stop's card shows. */
export const STOP_PLACE_COLUMNS =
  'id, city_slug, name_en, name_pt, category, lat, lng, popularity, avg_visit_minutes, image_url, is_unesco';
const TRIP_WITH_STOP_PLACES =
  `*, trip_stops(position, attraction_details(${STOP_PLACE_COLUMNS}))` as const;

/** A stop's place as `attraction_details` (columns nullable in a view) or `shared_trip` has it. */
export type StopPlaceRow = {
  id: string | null;
  city_slug: string | null;
  name_en: string | null;
  name_pt: string | null;
  category: AttractionCategory | null;
  lat: number | null;
  lng: number | null;
  popularity: number | null;
  avg_visit_minutes: number | null;
  image_url: string | null;
  is_unesco: boolean | null;
};

/**
 * @example placeFromDetailRow(row).nameEn // 'Belém Tower'
 */
export function placeFromDetailRow(d: StopPlaceRow): AttractionSummary {
  return {
    id: d.id!,
    citySlug: d.city_slug!,
    nameEn: d.name_en!,
    namePt: d.name_pt,
    category: d.category!,
    lat: d.lat!,
    lng: d.lng!,
    popularity: d.popularity ?? 0,
    avgVisitMinutes: d.avg_visit_minutes ?? 30,
    imageUrl: d.image_url,
    isUnesco: d.is_unesco ?? false,
  };
}

/** The places of embedded `trip_stops`, in walking order. */
function stopPlacesInOrder(
  stops: readonly { position: number; attraction_details: StopPlaceRow | null }[],
): AttractionSummary[] {
  return [...stops]
    .sort((a, b) => a.position - b.position)
    .flatMap((s) => (s.attraction_details ? [placeFromDetailRow(s.attraction_details)] : []));
}

/**
 * Loads the stops' attraction details (readable by everyone) and keeps the order of `ids`.
 * @example const stops = await fetchTripStops(['a2', 'a1']); // [a2, a1]
 */
export async function fetchTripStops(ids: string[]): Promise<AttractionSummary[]> {
  const details = unwrap(
    await supabase.from('attraction_details').select(STOP_PLACE_COLUMNS).in('id', ids),
  );
  const byId = new Map(details.map((d) => [d.id, d]));
  return ids
    .map((aid) => byId.get(aid))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map(placeFromDetailRow);
}

export type SaveTripInput = {
  name: string;
  tripDate: string | null;
  citySlug: string;
  stops: AttractionSummary[];
  route: RouteResponse | null;
  /** Meetup start (D-041), an ISO moment; null without a time. */
  startsAt: string | null;
};

/** Saves one trip through the `save_trip` RPC and returns its id. */
async function saveTrip(input: SaveTripInput): Promise<string> {
  const result = await supabase.rpc('save_trip', {
    p_city_slug: input.citySlug,
    p_name: input.name,
    p_attraction_ids: input.stops.map((s) => s.id),
    p_trip_date: input.tripDate ?? undefined,
    p_route_geometry: input.route?.geometry ?? undefined,
    p_distance_m: input.route ? Math.round(input.route.distanceM) : undefined,
    p_walking_seconds: input.route ? Math.round(input.route.walkingSeconds) : undefined,
    p_visit_minutes: input.stops.reduce((sum, s) => sum + s.avgVisitMinutes, 0),
    p_is_fallback: input.route?.isFallback ?? false,
    p_provider: input.route?.provider ?? undefined,
    p_starts_at: input.startsAt ?? undefined,
  });
  return unwrap(result);
}

/**
 * Saves each route of a split selection as its own trip, in order; returns the new ids.
 * @example saveTrips.mutate([{ name: 'Lisbon · Route 1', … }, { name: 'Lisbon · Route 2', … }])
 */
export function useSaveTrips() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: SaveTripInput[]) => {
      const ids: string[] = [];
      for (const input of inputs) ids.push(await saveTrip(input));
      return ids;
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: tripKeys.all }),
        queryClient.invalidateQueries({ queryKey: subscriptionKeys.mine }),
      ]),
  });
}

/**
 * Deletes the caller's list through `delete_trip`: only on a plan that allows it (D-047), and
 * only the caller's own list.
 * @example del.mutate(trip.id)
 */
export function useDeleteTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      check(await supabase.rpc('delete_trip', { p_trip_id: id }));
    },
    // My Trips (exact key) and the plan usage only: re-reading the deleted list's own page would
    // redirect it to "not available" (D-040) before the screen goes back.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: tripKeys.all, exact: true }),
        queryClient.invalidateQueries({ queryKey: subscriptionKeys.mine }),
      ]),
  });
}
