// Community and official walk lists (D-035): other people's public trips, listed through the
// `list_walklists` RPC (author, stops and rating in one query, paged by offset); saved in
// `saved_trips` (a reference to the original list); marked official by moderators. Lists with a
// date and time are meetups others join (`walk_attendees`, D-041).
import {
  WALKLIST_PAGE_SIZE,
  WALKLIST_PREVIEW_COUNT,
  type TripVisibility,
  type WalklistSort,
} from '@wayfarer/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { PhotoCover } from '@/features/destinations/api';
import type { RatingSummary } from '@/features/reviews/api';
import { tripKeys } from '@/features/trips/api';
import { walklistCoverFrom } from '@/features/trips/walklist-cover';
import { check, supabase, unwrap } from '@/lib/supabase';

/** A walk list as its card shows it. */
export type WalklistCard = {
  id: string;
  name: string;
  citySlug: string;
  authorName: string | null;
  isOfficial: boolean;
  visibility: TripVisibility;
  stopCount: number;
  distanceM: number | null;
  walkingSeconds: number | null;
  visitMinutes: number | null;
  rating: RatingSummary;
  createdAt: string;
  /** The caller saved it (My Trips → Saved). */
  isSaved: boolean;
  /** The caller made it (it is in My Trips already; it cannot be saved or rated). */
  isOwn: boolean;
  /** Photo of the starting point (D-038). */
  cover: PhotoCover | null;
  /** Meetup (D-041): when it starts (null: no time), how many are going, whether the caller is. */
  startsAt: string | null;
  attendeeCount: number;
  isAttending: boolean;
  /** Opens the author's public profile (D-045). */
  authorPublicId: string | null;
};

/** Which lists to show: a city's public lists (official or not, by name), or the saved ones. */
export type WalklistQuery = {
  citySlug?: string;
  official?: boolean;
  saved?: boolean;
  search?: string;
  sort?: WalklistSort | 'soonest';
  /** Only lists whose start is still to come (meetups, D-041). */
  upcoming?: boolean;
  /** Only the public lists of one traveller (their public profile, D-045). */
  authorPublicId?: string;
};

/** A `list_walklists` row. The generated type misses that several columns can be null. */
type WalklistRow = {
  id: string;
  name: string;
  city_slug: string;
  author_name: string | null;
  is_official: boolean;
  visibility: string;
  stop_count: number;
  distance_m: number | null;
  walking_seconds: number | null;
  visit_minutes: number | null;
  review_count: number;
  rating_avg: number | null;
  created_at: string;
  is_saved: boolean;
  is_own: boolean;
  cover: unknown;
  starts_at: string | null;
  attendee_count: number;
  is_attending: boolean;
  author_public_id?: string | null;
};

export const walklistKeys = {
  all: ['walklists'] as const,
  list: (query: WalklistQuery, limit: number) => ['walklists', query, limit] as const,
  pages: (query: WalklistQuery) => ['walklists', query, 'pages'] as const,
  moderator: ['moderator'] as const,
};

/**
 * @example walklistFromRow(row).rating // { count: 8, average: 4.9 }
 */
export function walklistFromRow(r: WalklistRow): WalklistCard {
  return {
    id: r.id,
    name: r.name,
    citySlug: r.city_slug,
    authorName: r.author_name,
    isOfficial: r.is_official,
    visibility: r.visibility as TripVisibility,
    stopCount: r.stop_count,
    distanceM: r.distance_m,
    walkingSeconds: r.walking_seconds,
    visitMinutes: r.visit_minutes,
    rating: { count: r.review_count, average: r.rating_avg },
    createdAt: r.created_at,
    isSaved: r.is_saved,
    isOwn: r.is_own,
    cover: walklistCoverFrom(r.cover),
    startsAt: r.starts_at,
    attendeeCount: r.attendee_count,
    isAttending: r.is_attending,
    authorPublicId: r.author_public_id ?? null,
  };
}

/**
 * `list_walklists` parameters; unset filters are left out, the search is trimmed.
 * @example walklistParams({ citySlug: 'lisbon', official: true }, 6, 0).p_official // true
 */
export function walklistParams(query: WalklistQuery, limit: number, offset: number) {
  const search = query.search?.trim();
  return {
    ...(query.citySlug ? { p_city_slug: query.citySlug } : {}),
    ...(query.official !== undefined ? { p_official: query.official } : {}),
    ...(query.saved ? { p_saved: true } : {}),
    ...(search ? { p_search: search } : {}),
    ...(query.upcoming ? { p_upcoming: true } : {}),
    ...(query.authorPublicId ? { p_author: query.authorPublicId } : {}),
    p_sort: query.sort ?? 'top',
    p_limit: limit,
    p_offset: offset,
  };
}

/**
 * Offset of the next page, or undefined after a short (last) page.
 * @example nextWalklistOffset(page2, [page1, page2]) // 40 when both pages are full
 */
export function nextWalklistOffset(
  lastPage: readonly WalklistCard[],
  pages: readonly (readonly WalklistCard[])[],
): number | undefined {
  return lastPage.length < WALKLIST_PAGE_SIZE ? undefined : pages.length * WALKLIST_PAGE_SIZE;
}

async function fetchWalklists(query: WalklistQuery, limit: number, offset: number) {
  const rows = unwrap(await supabase.rpc('list_walklists', walklistParams(query, limit, offset)));
  return (rows as WalklistRow[]).map(walklistFromRow);
}

/**
 * The first few lists for a city page section, plus whether there are more (one extra row is
 * fetched to know it, not a count).
 * @example useWalklistPreview({ citySlug: 'lisbon', official: false }).data?.hasMore
 */
export function useWalklistPreview(query: WalklistQuery, count: number = WALKLIST_PREVIEW_COUNT) {
  return useQuery({
    queryKey: walklistKeys.list(query, count),
    queryFn: async () => {
      const rows = await fetchWalklists(query, count + 1, 0);
      return { items: rows.slice(0, count), hasMore: rows.length > count };
    },
  });
}

/** Every matching list, a page (`WALKLIST_PAGE_SIZE`) at a time: "View all" and Saved. */
export function useWalklistPages(query: WalklistQuery) {
  return useInfiniteQuery({
    queryKey: walklistKeys.pages(query),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchWalklists(query, WALKLIST_PAGE_SIZE, pageParam),
    getNextPageParam: nextWalklistOffset,
    // Keep the current cards on screen while a new search or sort loads.
    placeholderData: keepPreviousData,
  });
}

/** Refetches every walk list listing, the owner's trips and the shared trip pages. */
function useInvalidateWalklists() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: walklistKeys.all }),
      queryClient.invalidateQueries({ queryKey: tripKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['sharedTrip'] }),
    ]);
}

/**
 * Saves another traveller's shared list, or removes it from the saved ones.
 * @example toggle.mutate({ id: list.id, saved: !list.isSaved })
 */
export function useToggleSavedWalklist() {
  const invalidate = useInvalidateWalklists();
  return useMutation({
    mutationFn: async ({ id, saved }: { id: string; saved: boolean }) => {
      const table = supabase.from('saved_trips');
      check(await (saved ? table.insert({ trip_id: id }) : table.delete().eq('trip_id', id)));
    },
    onSuccess: invalidate,
  });
}

/** True when the signed-in user is a platform moderator (shows the official list toggle). */
export function useIsModerator() {
  return useQuery({
    queryKey: walklistKeys.moderator,
    staleTime: 3600_000,
    queryFn: async (): Promise<boolean> => unwrap(await supabase.rpc('is_moderator')),
  });
}

/**
 * Marks a public list official or removes the badge (moderators only; RLS-checked in SQL).
 * @example setOfficial.mutate(true)
 */
export function useSetTripOfficial(tripId: string) {
  const invalidate = useInvalidateWalklists();
  return useMutation({
    mutationFn: async (official: boolean) => {
      check(await supabase.rpc('set_trip_official', { p_trip_id: tripId, p_official: official }));
    },
    onSuccess: invalidate,
  });
}

/**
 * Joins a public walk list of someone else, or leaves it (D-044), through the idempotent
 * `set_walk_attendance`: repeating it never fails or duplicates. Whatever the outcome — success
 * or a lost request — the screens are refreshed from the server, so they never show a
 * participation that did not happen (or hide one that did).
 * @example toggle.mutate({ id: list.id, attending: !list.isAttending })
 */
export function useToggleAttendance() {
  const invalidate = useInvalidateWalklists();
  return useMutation({
    mutationFn: async ({ id, attending }: { id: string; attending: boolean }) => {
      unwrap(await supabase.rpc('set_walk_attendance', { p_trip_id: id, p_attending: attending }));
    },
    onSettled: invalidate,
  });
}

/**
 * Sets, moves or (null) removes the start of the owner's list; it must be in the future.
 * @example setSchedule.mutate('2026-10-04T09:00:00.000Z')
 */
export function useSetTripSchedule(tripId: string) {
  const invalidate = useInvalidateWalklists();
  return useMutation({
    mutationFn: async (startsAt: string | null) => {
      check(
        await supabase.rpc('set_trip_schedule', {
          p_trip_id: tripId,
          p_starts_at: startsAt as string,
        }),
      );
    },
    onSuccess: invalidate,
  });
}
