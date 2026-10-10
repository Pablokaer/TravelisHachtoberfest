// Trip visibility and shared links (D-031): the owner sets who can open a trip; anyone opens a
// trip by link through `shared_trip`, which answers "ok", "not_found", "password_required" or
// "wrong_password".
import { sharedTripResultSchema, type SharedTrip, type TripVisibilityForm } from '@wayfarer/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AttractionSummary } from '@/features/destinations/api';
import type { RatingSummary } from '@/features/reviews/api';
import {
  fetchTripStops,
  placeFromDetailRow,
  tripDetailFromRow,
  tripKeys,
  type TripDetail,
} from '@/features/trips/api';
import { check, supabase } from '@/lib/supabase';

export type SharedTripDetail = TripDetail & {
  isOwner: boolean;
  authorName: string | null;
  rating: RatingSummary;
  /** The signed-in visitor saved it (D-035). */
  isSaved: boolean;
  /** Meetup (D-041): how many are going and whether the visitor is. */
  attendeeCount: number;
  isAttending: boolean;
};

export type SharedTripView =
  | { status: 'ok'; trip: SharedTripDetail }
  | { status: 'not_found' | 'password_required' | 'wrong_password' };

/**
 * @example sharedTripDetail(result.trip, await fetchTripStops(result.trip.stop_ids)).isOwner
 */
export function sharedTripDetail(trip: SharedTrip, stops: AttractionSummary[]): SharedTripDetail {
  return {
    ...tripDetailFromRow(trip, stops),
    isOwner: trip.is_owner,
    authorName: trip.author_name,
    rating: { count: trip.review_count, average: trip.rating_avg },
    isSaved: trip.is_saved,
    attendeeCount: trip.attendee_count,
    isAttending: trip.is_attending,
  };
}

async function fetchSharedTrip(id: string, password: string | null): Promise<SharedTripView> {
  const { data, error } = await supabase.rpc('shared_trip', {
    p_trip_id: id,
    p_password: password ?? undefined,
  });
  if (error) throw new Error(error.message);
  const result = sharedTripResultSchema.parse(data);
  if (result.status !== 'ok') return { status: result.status };
  // shared_trip brings the stops' places (D-057); a backend without them is asked separately.
  const stops = result.trip.stops
    ? result.trip.stops.map(placeFromDetailRow)
    : await fetchTripStops(result.trip.stop_ids);
  return { status: 'ok', trip: sharedTripDetail(result.trip, stops) };
}

/**
 * A trip opened by its link, signed in or not. `password` is what the visitor typed (or null).
 * @example const shared = useSharedTrip(id, password); shared.data?.status // 'password_required'
 */
export function useSharedTrip(id: string | undefined, password: string | null) {
  return useQuery({
    queryKey: ['sharedTrip', id ?? '', password] as const,
    enabled: !!id,
    // Keep the password prompt on screen while a typed password is checked.
    placeholderData: keepPreviousData,
    queryFn: () => fetchSharedTrip(id!, password),
  });
}

/**
 * Saves the owner's choice; a blank password keeps the current one of a protected trip.
 * @example setVisibility.mutate({ visibility: 'password', password: 'lisbon24' })
 */
export function useSetTripVisibility(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: TripVisibilityForm) => {
      check(
        await supabase.rpc('set_trip_visibility', {
          p_trip_id: tripId,
          p_visibility: form.visibility,
          p_password: form.visibility === 'password' && form.password ? form.password : undefined,
        }),
      );
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: tripKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['sharedTrip', tripId] }),
        // A list made private leaves the city pages and other people's saved lists.
        queryClient.invalidateQueries({ queryKey: ['walklists'] }),
      ]),
  });
}
