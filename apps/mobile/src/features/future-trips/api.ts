// Future trips (D-081): the destinations a traveller picked from the trip planner's proposals.
// Private rows (RLS), keyed by user and city; the city itself comes from the cities the app loads.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '@/lib/database.types';
import { useAuth } from '@/features/auth/auth-provider';
import { check, supabase, unwrap } from '@/lib/supabase';

export type FutureTrip = {
  citySlug: string;
  /** Why the planner proposed the city; null when it was added without one. */
  reason: string | null;
  /** The day the traveller wants to go, as YYYY-MM-DD. */
  plannedFor: string | null;
};

export const futureTripKeys = { all: ['futureTrips'] as const };

type FutureTripRow = Tables<'future_trips'>;

/**
 * @example futureTripFromRow(row) // { citySlug: 'lisbon', reason: 'Sunny', plannedFor: null }
 */
export function futureTripFromRow(row: FutureTripRow): FutureTrip {
  return { citySlug: row.city_slug, reason: row.reason, plannedFor: row.planned_for };
}

/** The signed-in traveller's saved destinations, newest first. */
export function useFutureTrips() {
  const { session } = useAuth();
  return useQuery({
    queryKey: futureTripKeys.all,
    enabled: !!session,
    queryFn: async (): Promise<FutureTrip[]> => {
      const rows = unwrap(
        await supabase.from('future_trips').select('*').order('created_at', { ascending: false }),
      );
      return rows.map(futureTripFromRow);
    },
  });
}

/**
 * Saves destinations (one row per city; saving a city again updates its reason and day).
 * @example save.mutate([{ citySlug: 'lisbon', reason: 'Sunny in December', plannedFor: null }])
 */
export function useSaveFutureTrips() {
  const queryClient = useQueryClient();
  const userId = useAuth().session?.user.id;
  return useMutation({
    mutationFn: async (trips: FutureTrip[]): Promise<void> => {
      if (!userId) throw new Error('Sign-in needed to save future trips: there is no session');
      const rows = trips.map((t) => ({
        user_id: userId,
        city_slug: t.citySlug,
        reason: t.reason,
        planned_for: t.plannedFor,
      }));
      check(await supabase.from('future_trips').upsert(rows, { onConflict: 'user_id,city_slug' }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: futureTripKeys.all }),
  });
}

/** Takes one city off the list. */
export function useRemoveFutureTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (citySlug: string): Promise<void> => {
      check(await supabase.from('future_trips').delete().eq('city_slug', citySlug));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: futureTripKeys.all }),
  });
}
