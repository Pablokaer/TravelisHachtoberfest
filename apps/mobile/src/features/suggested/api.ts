// Suggested routes (D-077): themed walks per city proposed by a local language model in the data
// pipeline, read by the "Routes" tab. Reference data, readable by everyone.
import { useQuery } from '@tanstack/react-query';

import type { AttractionSummary } from '@/features/destinations/api';
import { placeFromDetailRow, STOP_PLACE_COLUMNS, type StopPlaceRow } from '@/features/trips/api';
import { supabase, unwrap } from '@/lib/supabase';

export type SuggestedRoute = {
  id: string;
  citySlug: string;
  slug: string;
  theme: string;
  titleEn: string;
  titlePt: string;
  /** Who proposed it: a model tag, or 'rules' for the model-free planner. */
  generatedBy: string;
  /** Places in the pipeline's walking order; the screen re-orders them from the traveller. */
  stops: AttractionSummary[];
};

/** A `suggested_routes` row with its stops embedded through `suggested_route_stops`. */
export type SuggestedRouteRow = {
  id: string;
  city_slug: string;
  slug: string;
  theme: string;
  title_en: string;
  title_pt: string;
  generated_by: string;
  distance_m: number;
  walking_seconds: number;
  visit_minutes: number;
  suggested_route_stops: { position: number; attraction_details: StopPlaceRow | null }[];
};

/**
 * @example suggestedRouteFromRow(row).stops.map((s) => s.nameEn) // ['Sé', 'Castelo']
 */
export function suggestedRouteFromRow(r: SuggestedRouteRow): SuggestedRoute {
  const stops = [...r.suggested_route_stops]
    .sort((a, b) => a.position - b.position)
    .flatMap((s) => (s.attraction_details ? [placeFromDetailRow(s.attraction_details)] : []));
  return {
    id: r.id,
    citySlug: r.city_slug,
    slug: r.slug,
    theme: r.theme,
    titleEn: r.title_en,
    titlePt: r.title_pt,
    generatedBy: r.generated_by,
    stops,
  };
}

/**
 * The route's title in the UI language.
 * @example routeTitle(route, 'pt') // 'Cidade velha'
 */
export function routeTitle(route: Pick<SuggestedRoute, 'titleEn' | 'titlePt'>, language: string) {
  return language === 'pt' ? route.titlePt : route.titleEn;
}

const ROUTES_WITH_STOPS =
  `*, suggested_route_stops(position, attraction_details(${STOP_PLACE_COLUMNS}))` as const;

/** A city's suggested routes; nothing is requested without a city. */
export function useSuggestedRoutes(citySlug: string | null) {
  return useQuery({
    queryKey: ['suggestedRoutes', citySlug],
    enabled: !!citySlug,
    staleTime: 3600_000,
    queryFn: async (): Promise<SuggestedRoute[]> => {
      const rows = unwrap(
        await supabase
          .from('suggested_routes')
          .select(ROUTES_WITH_STOPS)
          .eq('city_slug', citySlug!)
          .order('slug'),
      );
      return rows.map((r) => suggestedRouteFromRow(r as unknown as SuggestedRouteRow));
    },
  });
}
