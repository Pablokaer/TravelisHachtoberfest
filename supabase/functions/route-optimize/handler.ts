// POST /route-optimize — orders 2–20 stops into a walking route with legs and a geometry that
// follows the streets (D-046): ORS optimisation, else a local order walked with ORS directions;
// `keepOrder` walks the given order. Straight lines only when ORS gives no answer at all.
import {
  CACHE_TTL,
  type RouteRequest,
  routeRequestSchema,
  type RouteResponse,
  routeResponseSchema,
} from '@wayfarer/shared';

import { type Cached, cacheKey } from '../_shared/cache.ts';
import {
  handleOptions,
  internalError,
  json,
  methodNotAllowed,
  parseJsonBody,
} from '../_shared/cors.ts';
import {
  FALLBACK_ATTRIBUTION,
  fallbackRouting,
  ORS_ATTRIBUTION,
  type OrsRouting,
  type RoutingResult,
  straightLineRoute,
} from './routing.ts';

/** Fallback results are cached briefly, and only when no ORS key is configured. */
export const FALLBACK_TTL = 3600;
/**
 * A street path for a locally computed order (the optimiser was unavailable, e.g. over quota)
 * is kept a day, so the optimiser is asked again soon after.
 */
export const LOCAL_ORDER_TTL = 86_400;

export type RouteDeps = {
  /** OpenRouteService (optimisation + directions); null when ORS_API_KEY is not configured. */
  ors: OrsRouting | null;
  cached: Cached;
};

type Stored = RoutingResult & { provider: RouteResponse['provider'] };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Canonical form of a request, used as the cache key and sent to the provider: coordinates
 * rounded to ~0.1 m, and the stops that the optimiser may reorder sorted by id. The same set of
 * places then hits the cache in any order — e.g. "Optimise" again after the app applied the
 * optimised order, or after reordering by hand — and gets the same deterministic answer.
 * @example normalizeRouteInput({ stops: [a, c, b], keepFirst: true }).stops // [a, b, c]
 */
export function normalizeRouteInput(
  input: Omit<RouteRequest, 'keepOrder'> & { keepOrder?: boolean },
) {
  const stops = input.stops.map((s) => ({ id: s.id, lat: round6(s.lat), lng: round6(s.lng) }));
  // A kept order is the route itself: it stays as given (and so does its cache key).
  if (input.keepOrder) return { stops, keepFirst: input.keepFirst, keepOrder: true as const };
  const [first, ...rest] = stops;
  return {
    stops: input.keepFirst ? [first!, ...rest.sort(byId)] : stops.sort(byId),
    keepFirst: input.keepFirst,
  };
}

type Normalized = ReturnType<typeof normalizeRouteInput>;

const withProvider = (provider: Stored['provider']) => (r: RoutingResult): Stored => ({
  ...r,
  provider,
});

/** Straight lines: the given order when it is kept, else the shortest straight-line order. */
async function straightLines(input: RouteRequest, n: Normalized): Promise<Stored> {
  const route = input.keepOrder
    ? straightLineRoute(n.stops)
    : await fallbackRouting(n.stops, input.keepFirst);
  return withProvider('fallback')(route);
}

/** ORS optimisation; when it fails (e.g. quota), the local order walked on the streets. */
async function optimizedStreetRoute(
  ors: OrsRouting,
  deps: RouteDeps,
  input: RouteRequest,
  n: Normalized,
): Promise<Stored> {
  const ors_ = withProvider('openrouteservice');
  try {
    return await deps.cached(
      await cacheKey('route:ors', n),
      CACHE_TTL.route,
      async () => ors_(await ors.optimize(n.stops, input.keepFirst)),
    );
  } catch (err) {
    console.warn('ORS optimisation failed, walking the local order with directions:', err);
    const local = await fallbackRouting(n.stops, input.keepFirst);
    const ordered = local.order.map((id) => n.stops.find((s) => s.id === id)!);
    return await deps.cached(
      await cacheKey('route:ors-local', n),
      LOCAL_ORDER_TTL,
      async () => ors_(await ors.directions(ordered)),
    );
  }
}

/** A route that follows the streets, or throws when ORS gives no answer at all. */
async function streetRoute(
  ors: OrsRouting,
  deps: RouteDeps,
  input: RouteRequest,
  n: Normalized,
): Promise<Stored> {
  if (!input.keepOrder) return await optimizedStreetRoute(ors, deps, input, n);
  return await deps.cached(
    await cacheKey('route:ors-path', n),
    CACHE_TTL.route,
    async () => withProvider('openrouteservice')(await ors.directions(n.stops)),
  );
}

function toResponse(input: RouteRequest, r: Stored): RouteResponse {
  const fallback = r.provider === 'fallback';
  return {
    order: r.order,
    legs: r.legs,
    geometry: r.geometry,
    distanceM: r.legs.reduce((a, l) => a + l.distanceM, 0),
    walkingSeconds: r.legs.reduce((a, l) => a + l.durationS, 0),
    visitMinutes: input.stops.reduce((a, s) => a + s.visitMinutes, 0),
    isFallback: fallback,
    provider: r.provider,
    attribution: fallback ? FALLBACK_ATTRIBUTION : ORS_ATTRIBUTION,
  };
}

export function createHandler(deps: RouteDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;
    if (req.method !== 'POST') return methodNotAllowed();

    const body = await parseJsonBody(req, routeRequestSchema);
    if (!body.ok) return body.response;
    const input = body.data;

    try {
      const normalized = normalizeRouteInput(input);
      let result: Stored;
      if (deps.ors) {
        try {
          result = await streetRoute(deps.ors, deps, input, normalized);
        } catch (err) {
          // Neither ORS service answered (or both are cooling down after an outage, D-063): the
          // estimate, labelled in the app and not cached.
          console.warn('ORS routing failed, using straight lines:', err);
          result = await straightLines(input, normalized);
        }
      } else {
        result = await deps.cached(
          await cacheKey('route:fallback', normalized),
          FALLBACK_TTL,
          () => straightLines(input, normalized),
        );
      }
      return json(routeResponseSchema.parse(toResponse(input, result)));
    } catch (err) {
      return internalError(err);
    }
  };
}
