// Reviews (D-028, any target since D-034): an attraction, a city or a walk list. Read through
// `list_reviews` and the `rating_summary` view (city page cards: `attraction_rating_summary`),
// written through `save_review` (create or edit) and a plain delete. RLS lets each user change
// only their own review.
import type { ReviewForm } from '@wayfarer/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { avatarUrl } from '@/features/profile/avatar-api';
import { check, supabase, unwrap } from '@/lib/supabase';

/** What a review is about; `id` is the attraction or trip id, or the city slug. */
export type ReviewTarget = { kind: 'attraction' | 'city' | 'trip'; id: string };

export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  /** The author's public display name; null when they never set one. */
  authorName: string | null;
  /** True for the signed-in user's own review. */
  isOwn: boolean;
  /** The author's profile photo (D-039); null shows their initials. */
  authorAvatarUrl: string | null;
  /** Opens the author's public profile (D-045); null for an author without one. */
  authorPublicId: string | null;
};

export type RatingSummary = {
  count: number;
  average: number | null;
  /** Reviews per star, index 0 = 1 star … 4 = 5 stars (when the source has it). */
  distribution?: number[];
};

/** A `list_reviews` row. The generated type misses that name and comment can be null. */
type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  is_own: boolean;
  author_avatar_path: string | null;
  author_public_id?: string | null;
};

type SummaryRow = {
  review_count: number | null;
  rating_avg: number | null;
  rating_counts?: number[] | null;
};
type CitySummaryRow = SummaryRow & { attraction_id: string | null };

/** The `reviews` / `rating_summary` column and the RPC parameter of each target. */
const TARGET_COLUMN = {
  attraction: 'attraction_id',
  city: 'city_slug',
  trip: 'trip_id',
} as const;

export const reviewKeys = {
  list: (target: ReviewTarget) => ['reviews', target.kind, target.id] as const,
  summary: (target: ReviewTarget) => ['reviews', target.kind, target.id, 'summary'] as const,
  /** Every place's rating on a city page's cards. */
  cards: (citySlug: string) => ['reviews', 'cards', citySlug] as const,
};

/**
 * The RPC parameter naming a review target.
 * @example targetParams({ kind: 'city', id: 'lisbon' }) // { p_city_slug: 'lisbon' }
 */
export function targetParams(target: ReviewTarget): Record<string, string> {
  return { [`p_${TARGET_COLUMN[target.kind]}`]: target.id };
}

/**
 * Maps a `list_reviews` row.
 * @example reviewFromRow(row).authorName // 'Carla'
 */
export function reviewFromRow(r: ReviewRow): Review {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    authorName: r.author_name,
    isOwn: r.is_own,
    authorAvatarUrl: avatarUrl(r.author_avatar_path),
    authorPublicId: r.author_public_id ?? null,
  };
}

/**
 * Maps a rating summary row; no row means no reviews.
 * @example summaryFromRow(null) // { count: 0, average: null }
 */
export function summaryFromRow(r: SummaryRow | null): RatingSummary {
  const summary: RatingSummary = { count: r?.review_count ?? 0, average: r?.rating_avg ?? null };
  return r?.rating_counts ? { ...summary, distribution: r.rating_counts } : summary;
}

/**
 * Indexes a city's rated places by attraction id (places without reviews have no entry).
 * @example ratingsByAttraction(rows).get(id) // { count: 2, average: 3.5 }
 */
export function ratingsByAttraction(rows: readonly CitySummaryRow[]): Map<string, RatingSummary> {
  return new Map(
    rows.filter((r) => r.attraction_id).map((r) => [r.attraction_id!, summaryFromRow(r)]),
  );
}

/**
 * The query of a city's attraction ratings: one definition for the city page and the hub's
 * prefetch.
 * @example queryClient.prefetchQuery(cityRatingsQueryOptions('lisbon'))
 */
export function cityRatingsQueryOptions(citySlug: string | undefined) {
  return queryOptions({
    queryKey: reviewKeys.cards(citySlug ?? ''),
    enabled: !!citySlug,
    queryFn: async (): Promise<Map<string, RatingSummary>> => {
      const rows = unwrap(
        await supabase
          .from('attraction_rating_summary')
          .select('attraction_id, review_count, rating_avg')
          .eq('city_slug', citySlug!)
          .gt('review_count', 0),
      );
      return ratingsByAttraction(rows);
    },
  });
}

/** Average rating and review count of every rated place of a city, for the city page cards. */
export function useCityRatings(citySlug: string | undefined) {
  return useQuery(cityRatingsQueryOptions(citySlug));
}

/** The reviews of an attraction, a city or a walk list, newest first (up to 50). */
export function useReviews(target: ReviewTarget) {
  return useQuery({
    queryKey: reviewKeys.list(target),
    queryFn: async (): Promise<Review[]> => {
      const rows = unwrap(await supabase.rpc('list_reviews', targetParams(target)));
      return (rows as ReviewRow[]).map(reviewFromRow);
    },
  });
}

/** Average rating, number of reviews and reviews per star of a target. */
export function useRatingSummary(target: ReviewTarget) {
  return useQuery({
    queryKey: reviewKeys.summary(target),
    queryFn: async (): Promise<RatingSummary> => {
      const { data, error } = await supabase
        .from('rating_summary')
        .select('review_count, rating_avg, rating_counts')
        .eq(TARGET_COLUMN[target.kind], target.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return summaryFromRow(data);
    },
  });
}

/**
 * Refetches the target's list and summary (both prefix `reviewKeys.list`), the city cards'
 * ratings and the walk list cards (their averages).
 */
function useInvalidateReviews(target: ReviewTarget) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewKeys.list(target) }),
      queryClient.invalidateQueries({ queryKey: ['reviews', 'cards'] }),
      queryClient.invalidateQueries({ queryKey: ['walklists'] }),
    ]);
}

/**
 * Publishes the caller's review of a target, or updates it when there is one.
 * @example useSaveReview({ kind: 'city', id: 'lisbon' }).mutate({ rating: 5, comment: '' })
 */
export function useSaveReview(target: ReviewTarget) {
  const invalidate = useInvalidateReviews(target);
  return useMutation({
    mutationFn: async (form: ReviewForm) => {
      unwrap(
        await supabase.rpc('save_review', {
          ...targetParams(target),
          p_rating: form.rating,
          p_comment: form.comment.trim() || undefined,
        }),
      );
    },
    onSuccess: invalidate,
  });
}

/** Deletes the caller's review (RLS: only their own row can match). */
export function useDeleteReview(target: ReviewTarget) {
  const invalidate = useInvalidateReviews(target);
  return useMutation({
    mutationFn: async (reviewId: string) => {
      check(await supabase.from('reviews').delete().eq('id', reviewId));
    },
    onSuccess: invalidate,
  });
}
