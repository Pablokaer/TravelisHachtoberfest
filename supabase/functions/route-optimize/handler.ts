// POST /route-optimize — orders 2–20 stops into a walking route with legs and a geometry that
// follows the streets (D-046): ORS optimisation, else a local order walked with ORS directions;
// `keepOrder` walks the given order. Without a key the public OpenStreetMap foot router does the
// same. The rule (D-087): a route is never a straight line across the stops — when no street
// router answers, the answer is a 503, not a line through buildings.
import {
  CACHE_TTL,
  type RouteRequest,
  routeRequestSchema,
  type RouteResponse,
  routeResponseSchema,
} from '@wayfarer/shared';

import { type Cached, cacheKey } from '../_shared/cache.ts';
import {
  errorResponse,
  handleOptions,
  internalError,
  json,
  methodNotAllowed,
  parseJsonBody,
} from '../_shared/cors.ts';
import {
  fallbackRouting,
  ORS_ATTRIBUTION,
  type OrsRouting,
  OSM_ATTRIBUTION,
  type RoutingResult,
} from './routing.ts';

/**
 * A street path for a locally computed order (the optimiser was unavailable, e.g. over quota)
 * is kept a day, so the optimiser is asked again soon after.
 */
export const LOCAL_ORDER_TTL = 86_400;

export type RouteDeps = {
  /** OpenRouteService (optimisation + directions); null when ORS_API_KEY is not configured. */
  ors: OrsRouting | null;
  /** The keyless OpenStreetMap foot router; tried after ORS, or alone without a key. */
  osm?: OrsRouting | null;
  cached: Cached;
};

type StreetProvider = Exclude<RouteResponse['provider'], 'fallback'>;
type Stored = RoutingResult & { provider: StreetProvider };

/** No street router gave a route: the caller is told, and nothing is drawn (D-087). */
export class StreetRoutingUnavailable extends Error {
  constructor(readonly causes: unknown[]) {
    super('no street router answered; a route is never drawn as a straight line');
    this.name = 'StreetRoutingUnavailable';
  }
}

/** A street router and what it is called in cache keys and answers. */
type Router = { provider: StreetProvider; keyPrefix: 'ors' | 'osm'; routing: OrsRouting };

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

const withProvider = (provider: StreetProvider) => (r: RoutingResult): Stored => ({
  ...r,
  provider,
});

/** The router's optimisation; when it fails (e.g. quota), the local order walked on the streets. */
async function optimizedStreetRoute(
  router: Router,
  deps: RouteDeps,
  input: RouteRequest,
  n: Normalized,
): Promise<Stored> {
  const tag = withProvider(router.provider);
  try {
    return await deps.cached(
      await cacheKey(`route:${router.keyPrefix}`, n),
      CACHE_TTL.route,
      async () => tag(await router.routing.optimize(n.stops, input.keepFirst)),
    );
  } catch (err) {
    console.warn(`${router.provider} optimisation failed, walking the local order:`, err);
    // The straight-line order only decides which stop goes where; the path is still streets.
    const local = await fallbackRouting(n.stops, input.keepFirst);
    const ordered = local.order.map((id) => n.stops.find((s) => s.id === id)!);
    return await deps.cached(
      await cacheKey(`route:${router.keyPrefix}-local`, n),
      LOCAL_ORDER_TTL,
      async () => tag(await router.routing.directions(ordered)),
    );
  }
}

/** A route that follows the streets from one router, or throws when it gives no answer. */
async function streetRoute(
  router: Router,
  deps: RouteDeps,
  input: RouteRequest,
  n: Normalized,
): Promise<Stored> {
  if (!input.keepOrder) return await optimizedStreetRoute(router, deps, input, n);
  return await deps.cached(
    await cacheKey(`route:${router.keyPrefix}-path`, n),
    CACHE_TTL.route,
    async () => withProvider(router.provider)(await router.routing.directions(n.stops)),
  );
}

/** The configured routers in order of preference: ORS (with a key), then OpenStreetMap. */
function routersOf(deps: RouteDeps): Router[] {
  const routers: Router[] = [];
  if (deps.ors) routers.push({ provider: 'openrouteservice', keyPrefix: 'ors', routing: deps.ors });
  if (deps.osm) routers.push({ provider: 'osm-foot', keyPrefix: 'osm', routing: deps.osm });
  return routers;
}

/** The first router that answers; `StreetRoutingUnavailable` when none does. */
async function firstStreetRoute(
  deps: RouteDeps,
  input: RouteRequest,
  n: Normalized,
): Promise<Stored> {
  const causes: unknown[] = [];
  for (const router of routersOf(deps)) {
    try {
      return await streetRoute(router, deps, input, n);
    } catch (err) {
      console.warn(`${router.provider} routing failed, trying the next router:`, err);
      causes.push(err);
    }
  }
  throw new StreetRoutingUnavailable(causes);
}

function toResponse(input: RouteRequest, r: Stored): RouteResponse {
  return {
    order: r.order,
    legs: r.legs,
    geometry: r.geometry,
    distanceM: r.legs.reduce((a, l) => a + l.distanceM, 0),
    walkingSeconds: r.legs.reduce((a, l) => a + l.durationS, 0),
    visitMinutes: input.stops.reduce((a, s) => a + s.visitMinutes, 0),
    // Kept for saved trips and old clients: no route is a straight-line estimate any more.
    isFallback: false,
    provider: r.provider,
    attribution: r.provider === 'openrouteservice' ? ORS_ATTRIBUTION : OSM_ATTRIBUTION,
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
      const result = await firstStreetRoute(deps, input, normalizeRouteInput(input));
      return json(routeResponseSchema.parse(toResponse(input, result)));
    } catch (err) {
      if (err instanceof StreetRoutingUnavailable) {
        console.warn(err.message, err.causes);
        return errorResponse(
          503,
          'street_routing_unavailable',
          'No walking-route service answered, so no route was drawn. Try again in a moment.',
        );
      }
      return internalError(err);
    }
  };
}
