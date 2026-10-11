// Suggested routes (D-077): the pipeline stores each route in walking order, but the traveller
// should start at the stop nearest to them, and see the routes nearest to them first.
import type { LatLng } from '../schemas/common.ts';
import { estimateWalkingMeters, haversineMeters } from './geo.ts';
import { orderFromStart } from './route-plan.ts';
import { pathLength, type RoutePoint } from './route.ts';

/**
 * Farthest a traveller can be from a covered city's centre and still get that city's routes. A
 * larger metropolitan area is still "in" the city; farther than this the app offers the city
 * picker instead of routes the traveller cannot walk to.
 */
export const SUGGESTED_ROUTES_MAX_CITY_DISTANCE_M = 50_000;

export type CityPoint = LatLng & { slug: string };

export type RankedRoute<R extends { stops: readonly RoutePoint[] }> = Omit<R, 'stops'> & {
  /** The route's stops, starting at the one nearest to the traveller. */
  stops: R['stops'][number][];
  /** Straight-line metres from the traveller to the first stop. */
  startDistanceM: number;
  /** Estimated street walk of the re-ordered route, in metres. */
  walkingMeters: number;
  /** How many of its stops the traveller already visited (D-085). */
  visitedStops: number;
};

/** Ids of the places the traveller already visited; they are never a route's priority. */
export type VisitedIds = ReadonlySet<string>;

/** The nearest stop that is not visited; the nearest of all when every stop is visited. */
function nearestStopIndex(
  stops: readonly RoutePoint[],
  from: LatLng,
  visited: VisitedIds | undefined,
): number {
  const fresh = stops.map((_, i) => i).filter((i) => !visited?.has(stops[i]!.id));
  const candidates = fresh.length > 0 ? fresh : stops.map((_, i) => i);
  return candidates.reduce((best, i) =>
    haversineMeters(from, stops[i]!) < haversineMeters(from, stops[best]!) ? i : best,
  );
}

/**
 * The route re-ordered so the stop nearest to `from` comes first and the rest follow the shortest
 * walk. Routes of 0–1 stops are returned as they are; the input is never changed. A stop in
 * `visited` is not chosen as the start while a new one exists (D-085).
 * @example startFromNearest([a, b, c], userNextToC).map((s) => s.id) // ['c', 'b', 'a']
 */
export function startFromNearest<T extends RoutePoint>(
  stops: readonly T[],
  from: LatLng,
  visited?: VisitedIds,
): T[] {
  if (stops.length < 2) return [...stops];
  const first = stops[nearestStopIndex(stops, from, visited)]!;
  return orderFromStart([first, ...stops.filter((s) => s !== first)]);
}

/**
 * Every route started at its nearest stop that is not visited, nearest route first (ties by id,
 * so the list does not jump around between renders). A place already visited is not a priority
 * however close it is (D-085): it never decides where a route starts, and a route with nothing
 * left to see goes last.
 * @example rankByProximity(routes, here, new Set(['museum-id']))[0].startDistanceM // 420
 */
export function rankByProximity<R extends { id: string; stops: readonly RoutePoint[] }>(
  routes: readonly R[],
  from: LatLng,
  visited?: VisitedIds,
): RankedRoute<R>[] {
  return routes
    .map((route) => {
      const stops = startFromNearest(route.stops, from, visited);
      const first = stops[0];
      return {
        ...route,
        stops,
        startDistanceM: first ? haversineMeters(from, first) : Infinity,
        walkingMeters: Math.round(estimateWalkingMeters(pathLength(stops))),
        visitedStops: stops.filter((s) => visited?.has(s.id)).length,
      };
    })
    .sort(
      (a, b) =>
        Number(isAllVisited(a)) - Number(isAllVisited(b)) ||
        a.startDistanceM - b.startDistanceM ||
        a.id.localeCompare(b.id),
    );
}

/** A route with nothing left to see: it has stops and the traveller visited them all. */
function isAllVisited(route: { stops: readonly unknown[]; visitedStops: number }): boolean {
  return route.stops.length > 0 && route.visitedStops === route.stops.length;
}

/**
 * The covered city closest to `from`, with its distance; null when none is within
 * SUGGESTED_ROUTES_MAX_CITY_DISTANCE_M.
 * @example nearestCity(cities, gps)?.city.slug // 'lisbon'
 */
export function nearestCity<C extends CityPoint>(
  cities: readonly C[],
  from: LatLng,
): { city: C; distanceM: number } | null {
  let best: { city: C; distanceM: number } | null = null;
  for (const city of cities) {
    const distanceM = haversineMeters(from, city);
    if (!best || distanceM < best.distanceM) best = { city, distanceM };
  }
  return best && best.distanceM <= SUGGESTED_ROUTES_MAX_CITY_DISTANCE_M ? best : null;
}
