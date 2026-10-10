import { routeResponseSchema, type RouteRequest, type RouteResponse } from '@wayfarer/shared';
import { useMutation } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';

import type { AttractionSummary } from '@/features/destinations/api';
import { supabase } from '@/lib/supabase';

/**
 * The `route-optimize` request: the first stop is kept as the start; with `keepOrder` (an order
 * set by hand) the server keeps every stop where it is and only walks the streets (D-046).
 * @example routeRequestBody(route, { keepOrder: manualOrder })
 */
export function routeRequestBody(
  stops: AttractionSummary[],
  { keepOrder }: { keepOrder: boolean },
): RouteRequest {
  return {
    keepFirst: true,
    keepOrder,
    stops: stops.map((s) => ({
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      visitMinutes: s.avgVisitMinutes,
    })),
  };
}

export async function optimizeRoute(
  stops: AttractionSummary[],
  options: { keepOrder: boolean },
): Promise<RouteResponse> {
  const body = routeRequestBody(stops, options);
  const { data, error } = await supabase.functions.invoke('route-optimize', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.text().catch(() => '');
      throw new Error(detail || error.message);
    }
    throw error;
  }
  return routeResponseSchema.parse(data);
}

/**
 * Walking routes along the streets for every route of the selection (each keeps its first
 * stop). In automatic order the server orders the stops for the shortest walk; with `keepOrder`
 * (an order set by hand) it keeps them and computes only the path.
 * @example optimizeRoutes.mutate({ routes: [routeA, routeB], keepOrder: false })
 */
export function useOptimizeRoutes() {
  return useMutation({
    mutationFn: ({ routes, keepOrder }: { routes: AttractionSummary[][]; keepOrder: boolean }) =>
      Promise.all(routes.map((stops) => optimizeRoute(stops, { keepOrder }))),
  });
}

/**
 * Which routes "Optimise" should send: the ones without a result for their current order (a
 * changed route of a split keeps the others' answers). When every route is already optimised,
 * all of them — the server answers those from its cache.
 * @example routesToOptimize([resultA, null, resultC]) // [1]
 */
export function routesToOptimize(results: readonly (RouteResponse | null)[]): number[] {
  const all = results.map((_, i) => i);
  const pending = all.filter((i) => results[i] == null);
  return pending.length > 0 ? pending : all;
}
