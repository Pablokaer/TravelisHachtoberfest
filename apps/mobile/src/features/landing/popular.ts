import type { City } from '@/features/destinations/api';

/**
 * Cities shown under "Popular destinations", in this order (D-072). Only slugs the pipeline
 * covers (docs/CITIES.md); one the database lacks is skipped, never faked.
 */
export const POPULAR_CITY_SLUGS: readonly string[] = [
  'paris',
  'rome',
  'tokyo',
  'barcelona',
  'london',
  'lisbon',
];

/**
 * The curated cities found in `cities`, in the curated order.
 * @example popularCities(cities).map((c) => c.slug) // ['paris', 'rome', …]
 */
export function popularCities(
  cities: readonly City[],
  slugs: readonly string[] = POPULAR_CITY_SLUGS,
): City[] {
  const bySlug = new Map(cities.map((city) => [city.slug, city]));
  return slugs.flatMap((slug) => bySlug.get(slug) ?? []);
}
