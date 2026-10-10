// City page filter by average rating (D-032): "3+", "4+" or "5+" stars, on top of the
// category tabs and the search.
import type { RatingSummary } from './api';

/** The minimum averages the rating tabs offer. */
export const RATING_FILTER_OPTIONS = [3, 4, 5] as const;

/**
 * The places whose average rating is at least `minRating`; without a minimum, every place.
 * A minimum hides the places nobody has reviewed yet (they have no average to compare).
 * @example withMinRating(places, ratings, 4) // only places rated 4.0 ★ or more
 */
export function withMinRating<T extends { id: string }>(
  items: readonly T[],
  ratings: ReadonlyMap<string, RatingSummary> | undefined,
  minRating: number | null,
): T[] {
  if (minRating === null) return [...items];
  return items.filter((item) => (ratings?.get(item.id)?.average ?? 0) >= minRating);
}
