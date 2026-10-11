// Visited attractions (D-085): the places the traveller marked "I've been here". Private rows
// (RLS) keyed by user and attraction; suggested routes read them to leave seen places out of the
// way. Nothing here is shown to other travellers.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import type { Tables } from '@/lib/database.types';
import { check, supabase, unwrap } from '@/lib/supabase';

export const visitedKeys = { all: ['visitedAttractions'] as const };

type VisitedRow = Pick<Tables<'visited_attractions'>, 'attraction_id'>;

/**
 * @example visitedIdsFromRows([{ attraction_id: 'a1' }]) // Set { 'a1' }
 */
export function visitedIdsFromRows(rows: readonly VisitedRow[]): ReadonlySet<string> {
  return new Set(rows.map((row) => row.attraction_id));
}

/** Ids of the attractions the signed-in traveller visited (empty without a session). */
export function useVisitedIds() {
  const { session } = useAuth();
  return useQuery({
    queryKey: visitedKeys.all,
    enabled: !!session,
    queryFn: async (): Promise<ReadonlySet<string>> =>
      visitedIdsFromRows(
        unwrap(await supabase.from('visited_attractions').select('attraction_id')),
      ),
  });
}

export type VisitedChange = { attractionId: string; visited: boolean };

/**
 * Marks an attraction as visited, or takes the mark off.
 * @example setVisited.mutate({ attractionId: 'a1', visited: true })
 */
export function useSetVisited() {
  const queryClient = useQueryClient();
  const userId = useAuth().session?.user.id;
  return useMutation({
    mutationFn: async ({ attractionId, visited }: VisitedChange): Promise<void> => {
      if (!userId) throw new Error('Sign-in needed to mark a place as visited: no session');
      const table = supabase.from('visited_attractions');
      if (!visited) return check(await table.delete().eq('attraction_id', attractionId));
      check(
        await table.upsert(
          { user_id: userId, attraction_id: attractionId },
          // DO NOTHING, not DO UPDATE: a mark is never edited, so the table grants no update.
          { onConflict: 'user_id,attraction_id', ignoreDuplicates: true },
        ),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: visitedKeys.all }),
  });
}
