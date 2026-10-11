// Routing providers for route-optimize: OpenRouteService — VROOM optimisation on the walking
// network, and the foot-walking directions that follow the streets for an order already known
// (D-046) — and the keyless OpenStreetMap foot router (D-087). Straight lines from @wayfarer/shared
// are only used to pick which stop goes first, never as a route.
import {
  estimateLegs,
  type LineString,
  optimizeOrder,
  optimizeOrderAnyStart,
  type RouteLeg,
  type RoutePoint,
} from '@wayfarer/shared';

import { CircuitBreaker, isUpstreamOutage } from '../_shared/breaker.ts';
import type { FetchJson } from '../_shared/http.ts';
import { decodePolyline } from './polyline.ts';

export type RoutingResult = { order: string[]; legs: RouteLeg[]; geometry: LineString };

/**
 * Orders `stops` into an open walking path. With `fixedStart` the first stop stays first;
 * otherwise the provider may start anywhere.
 */
export type RoutingProvider = (
  stops: readonly RoutePoint[],
  fixedStart: boolean,
) => Promise<RoutingResult>;

/** The street path and legs of stops already in walking order. */
export type PathProvider = (ordered: readonly RoutePoint[]) => Promise<RoutingResult>;

/** Both OpenRouteService services: ordering on the network, and the path for a given order. */
export type OrsRouting = { optimize: RoutingProvider; directions: PathProvider };

export const ORS_BASE_URL = 'https://api.openrouteservice.org';
/** ORS foot-walking directions, answered as GeoJSON (geometry + one segment per leg). */
export const ORS_DIRECTIONS_PATH = '/v2/directions/foot-walking/geojson';
export const ORS_TIMEOUT_MS = 8000;
/**
 * After a 429, 5xx or timeout, that ORS service is skipped for this long (D-063): during an
 * outage every request would otherwise wait up to 8 s for the optimiser and 8 s more for the
 * directions before the straight-line fallback. ORS rate limits are per minute, so a 429 has
 * cleared by the time it is tried again.
 */
export const ORS_COOL_DOWN_SECONDS = 60;
export const ORS_ATTRIBUTION =
  '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors';

const lngLat = (p: RoutePoint): [number, number] => [p.lng, p.lat];

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

/** Straight-line legs and geometry for stops already in walking order. */
export function straightLineRoute(ordered: readonly RoutePoint[]): RoutingResult {
  return {
    order: ordered.map((p) => p.id),
    legs: estimateLegs(ordered),
    geometry: { type: 'LineString', coordinates: ordered.map(lngLat) },
  };
}

/** Shortest straight-line open path from whichever stop makes it shortest (exact). */
export function bestStartFallback(stops: readonly RoutePoint[]): RoutingResult {
  return straightLineRoute(optimizeOrderAnyStart(stops));
}

export const fallbackRouting: RoutingProvider = (stops, fixedStart) =>
  Promise.resolve(fixedStart ? straightLineRoute(optimizeOrder(stops)) : bestStartFallback(stops));

// ---------------------------------------------------------------------------
// OpenRouteService
// ---------------------------------------------------------------------------

/** Step of a VROOM route; `distance` (m) and `duration` (s) are cumulative from the start. */
type VroomStep = { type: string; id?: number; job?: number; distance?: number; duration?: number };
type VroomResponse = {
  code: number;
  error?: string;
  /** `geometry` is an encoded polyline, present when the request sets `options.g`. */
  routes?: { vehicle: number; steps: VroomStep[]; geometry?: string }[];
  unassigned?: { id: number }[];
};

/** Pure: the job steps of a VROOM solution as stops, after checking every stop is visited once. */
function visitedJobs(
  jobs: readonly RoutePoint[],
  res: VroomResponse,
): { stop: RoutePoint; step: VroomStep }[] {
  if (res.code !== 0) throw new Error(`ORS optimization error ${res.code}: ${res.error ?? ''}`);
  if (res.unassigned?.length) {
    throw new Error(`ORS optimization left jobs unassigned: ${res.unassigned.map((u) => u.id)}`);
  }
  const visited = (res.routes?.[0]?.steps ?? []).filter((s) => s.type === 'job').map((step) => {
    const idx = step.id ?? step.job;
    const stop = idx === undefined ? undefined : jobs[idx];
    if (!stop) {
      throw new Error(
        `ORS optimization returned unknown job ${idx}, expected 0–${jobs.length - 1}`,
      );
    }
    return { stop, step };
  });
  if (visited.length !== jobs.length || new Set(visited.map((v) => v.stop)).size !== jobs.length) {
    throw new Error(
      `ORS optimization visited ${visited.length} jobs, expected each of ${jobs.length} once`,
    );
  }
  return visited;
}

/** Pure: per-leg distance and duration from the cumulative totals VROOM puts on each step. */
function legsFromSteps(ordered: readonly RoutePoint[], steps: readonly VroomStep[]): RouteLeg[] {
  return steps.map((step, i) => {
    const before = steps[i - 1];
    const distanceM = (step.distance ?? NaN) - (before?.distance ?? 0);
    const durationS = (step.duration ?? NaN) - (before?.duration ?? 0);
    if (!(distanceM >= 0 && durationS >= 0)) {
      throw new Error(
        `ORS optimization step ${i} has no cumulative distance/duration: ${JSON.stringify(step)}`,
      );
    }
    return {
      fromId: ordered[i]!.id,
      toId: ordered[i + 1]!.id,
      distanceM: Math.round(distanceM),
      durationS: Math.round(durationS),
    };
  });
}

/**
 * Pure: order, walking legs and street geometry from one VROOM solution requested with
 * `options.g` — no separate directions call is needed (the totals match ORS directions).
 * @example routeFromVroom(start, jobs, await orsOptimization(...)).order // ['start', …]
 */
export function routeFromVroom(
  start: RoutePoint,
  jobs: readonly RoutePoint[],
  res: VroomResponse,
): RoutingResult {
  const visited = visitedJobs(jobs, res);
  const ordered = [start, ...visited.map((v) => v.stop)];
  const encoded = res.routes?.[0]?.geometry;
  const coordinates = encoded ? decodePolyline(encoded) : [];
  if (coordinates.length < 2) throw new Error('ORS optimization returned no route geometry');
  return {
    order: ordered.map((p) => p.id),
    legs: legsFromSteps(ordered, visited.map((v) => v.step)),
    geometry: { type: 'LineString', coordinates },
  };
}

type OrsDeps = { apiKey: string; fetchJson: FetchJson; baseUrl?: string; timeoutMs?: number };

/** The part of an ORS directions GeoJSON answer we read. */
type DirectionsResponse = {
  features?: {
    geometry?: { coordinates?: number[][] };
    properties?: { segments?: { distance?: number; duration?: number }[] };
  }[];
};

/**
 * Pure: the street path and per-leg totals of an ORS directions answer for `ordered` stops.
 * Throws when the answer has no route or not one segment per leg.
 * @example parseDirections([a, b, c], answer).legs.length // 2
 */
export function parseDirections(
  ordered: readonly RoutePoint[],
  res: DirectionsResponse,
): RoutingResult {
  const feature = res.features?.[0];
  const coordinates = (feature?.geometry?.coordinates ?? []).map(
    (c) => [c[0]!, c[1]!] as [number, number],
  );
  if (coordinates.length < 2) throw new Error('ORS directions returned no route');
  const segments = feature?.properties?.segments ?? [];
  if (segments.length !== ordered.length - 1) {
    throw new Error(
      `ORS directions returned ${segments.length} segments for ${ordered.length} stops, expected ${
        ordered.length - 1
      }`,
    );
  }
  return {
    order: ordered.map((p) => p.id),
    legs: segments.map((seg, i) => ({
      fromId: ordered[i]!.id,
      toId: ordered[i + 1]!.id,
      distanceM: Math.round(seg.distance ?? 0),
      durationS: Math.round(seg.duration ?? 0),
    })),
    geometry: { type: 'LineString', coordinates },
  };
}

/**
 * OpenRouteService routing: `optimize` makes one `/optimization` call (VROOM on the foot-walking
 * network) that returns the order, the per-leg totals and the geometry; `directions` follows
 * the streets for an order already known (D-046). They have separate quotas, so each has its own
 * breaker name: an outage of one skips only that one (D-063). Create it once per isolate, so the
 * breaker outlives a request.
 * @example const route = await createOrsRouting({ apiKey, fetchJson }).optimize(stops, true);
 */
export function createOrsRouting(deps: OrsDeps & { breaker?: CircuitBreaker }): OrsRouting {
  const breaker = deps.breaker ?? new CircuitBreaker(ORS_COOL_DOWN_SECONDS);
  const { optimize, directions } = createOrsCalls(deps);
  return {
    optimize: (stops, fixedStart) =>
      breaker.run('ors:optimize', () => optimize(stops, fixedStart), isUpstreamOutage),
    directions: (ordered) =>
      breaker.run('ors:directions', () => directions(ordered), isUpstreamOutage),
  };
}

/** The two ORS calls themselves, without the breaker. */
function createOrsCalls(deps: OrsDeps): OrsRouting {
  const base = deps.baseUrl ?? ORS_BASE_URL;
  const opts = {
    headers: { Authorization: deps.apiKey },
    timeoutMs: deps.timeoutMs ?? ORS_TIMEOUT_MS,
  };

  const optimize: RoutingProvider = async (stops, fixedStart) => {
    // VROOM needs a vehicle start or end; for a free start, pick it with the exact
    // straight-line solution and let ORS order the rest on the real street network.
    const startId = fixedStart ? stops[0]!.id : bestStartFallback(stops).order[0]!;
    const start = stops.find((s) => s.id === startId)!;
    const jobs = stops.filter((s) => s !== start);

    const optimization = await deps.fetchJson<VroomResponse>(`${base}/optimization`, {
      ...opts,
      method: 'POST',
      body: {
        // Ordering only minimises walking, so visits have no service time.
        jobs: jobs.map((s, i) => ({ id: i, location: lngLat(s), service: 0 })),
        vehicles: [{ id: 0, profile: 'foot-walking', start: lngLat(start) }],
        // Geometry plus cumulative distance/duration per step (saves a directions call).
        options: { g: true },
      },
    });
    return routeFromVroom(start, jobs, optimization);
  };

  const directions: PathProvider = async (ordered) => {
    const res = await deps.fetchJson<DirectionsResponse>(`${base}${ORS_DIRECTIONS_PATH}`, {
      ...opts,
      // The GeoJSON endpoint answers 406 unless GeoJSON is acceptable.
      headers: { ...opts.headers, Accept: 'application/geo+json, application/json' },
      method: 'POST',
      // radiuses −1: each stop snaps to the nearest walkable point, however far (a stop in the
      // middle of a bridge or a park would otherwise fail the whole route with error 2010).
      body: {
        coordinates: ordered.map(lngLat),
        radiuses: ordered.map(() => -1),
        // The per-leg segments (distance, duration) only come with the instructions.
        instructions: true,
      },
    });
    return parseDirections(ordered, res);
  };

  return { optimize, directions };
}

// ---------------------------------------------------------------------------
// OpenStreetMap foot router (OSRM), no key (D-087)
// ---------------------------------------------------------------------------

/** FOSSGIS' public OSRM instance with the foot profile: a free service, with a fair-use policy. */
export const OSM_FOOT_BASE_URL = 'https://routing.openstreetmap.de/routed-foot';
export const OSM_TIMEOUT_MS = 10_000;
export const OSM_ATTRIBUTION =
  'Routes © OpenStreetMap contributors, routing by FOSSGIS (OSRM, foot)';

/** The part of an OSRM `/route` and `/trip` answer we read. */
type OsrmRoute = {
  geometry?: { coordinates?: number[][] };
  legs?: { distance?: number; duration?: number }[];
};
type OsrmRouteResponse = { code: string; message?: string; routes?: OsrmRoute[] };
type OsrmTripResponse = {
  code: string;
  message?: string;
  trips?: OsrmRoute[];
  /** One per stop sent, in the order sent: where that stop falls in the trip. */
  waypoints?: { waypoint_index: number }[];
};

/** The street path of an OSRM route; never fewer than two points (a line needs both ends). */
function osrmPath(route: OsrmRoute | undefined): [number, number][] {
  const coordinates = (route?.geometry?.coordinates ?? []).map(
    (c) => [c[0]!, c[1]!] as [number, number],
  );
  if (coordinates.length < 2) throw new Error('OSM foot router returned no street geometry');
  return coordinates;
}

function osrmLegs(ordered: readonly RoutePoint[], route: OsrmRoute): RouteLeg[] {
  const legs = route.legs ?? [];
  if (legs.length !== ordered.length - 1) {
    throw new Error(
      `OSM foot router returned ${legs.length} legs for ${ordered.length} stops, expected ${
        ordered.length - 1
      }`,
    );
  }
  return legs.map((leg, i) => ({
    fromId: ordered[i]!.id,
    toId: ordered[i + 1]!.id,
    distanceM: Math.round(leg.distance ?? 0),
    durationS: Math.round(leg.duration ?? 0),
  }));
}

/**
 * Pure: the walking order, legs and street path of an OSRM `/trip` answer for `stops` (sent in
 * this order). Throws on anything that is not a complete street route.
 * @example parseOsrmTrip(stops, answer).order // ['belem', 'jeronimos', 'comercio']
 */
export function parseOsrmTrip(stops: readonly RoutePoint[], res: OsrmTripResponse): RoutingResult {
  if (res.code !== 'Ok') throw new Error(`OSM foot router error ${res.code}: ${res.message ?? ''}`);
  const waypoints = res.waypoints ?? [];
  if (waypoints.length !== stops.length) {
    throw new Error(
      `OSM foot router returned ${waypoints.length} waypoints for ${stops.length} stops`,
    );
  }
  const ordered: RoutePoint[] = [];
  waypoints.forEach((w, i) => (ordered[w.waypoint_index] = stops[i]!));
  if (ordered.filter(Boolean).length !== stops.length) {
    throw new Error(`OSM foot router did not visit each stop once: ${JSON.stringify(waypoints)}`);
  }
  const trip = res.trips?.[0];
  if (!trip) throw new Error('OSM foot router returned no trip');
  return {
    order: ordered.map((p) => p.id),
    legs: osrmLegs(ordered, trip),
    geometry: { type: 'LineString', coordinates: osrmPath(trip) },
  };
}

/**
 * Pure: legs and street path of an OSRM `/route` answer for `ordered` stops.
 * @example parseOsrmRoute([a, b, c], answer).legs.length // 2
 */
export function parseOsrmRoute(
  ordered: readonly RoutePoint[],
  res: OsrmRouteResponse,
): RoutingResult {
  if (res.code !== 'Ok') throw new Error(`OSM foot router error ${res.code}: ${res.message ?? ''}`);
  const route = res.routes?.[0];
  if (!route) throw new Error('OSM foot router returned no route');
  return {
    order: ordered.map((p) => p.id),
    legs: osrmLegs(ordered, route),
    geometry: { type: 'LineString', coordinates: osrmPath(route) },
  };
}

type OsmDeps = {
  fetchJson: FetchJson;
  baseUrl?: string;
  timeoutMs?: number;
  breaker?: CircuitBreaker;
};

const coordinatesPath = (stops: readonly RoutePoint[]) =>
  stops.map((s) => `${s.lng},${s.lat}`).join(';');

/**
 * The public OpenStreetMap foot router: `optimize` asks `/trip` for the shortest walking order
 * from the first stop, `directions` asks `/route` for the street path of an order already known.
 * Both answers come from the pedestrian network, so a route follows streets and paths a person can
 * walk. Each has its own breaker name, like ORS (D-063).
 * @example const route = await createOsmFootRouting({ fetchJson }).directions(orderedStops);
 */
export function createOsmFootRouting(deps: OsmDeps): OrsRouting {
  const base = deps.baseUrl ?? OSM_FOOT_BASE_URL;
  const breaker = deps.breaker ?? new CircuitBreaker(ORS_COOL_DOWN_SECONDS);
  const get = <T>(path: string) =>
    deps.fetchJson<T>(`${base}${path}`, { timeoutMs: deps.timeoutMs ?? OSM_TIMEOUT_MS });
  const overview = 'overview=full&geometries=geojson&steps=false';

  const optimize: RoutingProvider = async (stops, fixedStart) => {
    // OSRM cannot leave both ends free: choose the start with the exact straight-line solution
    // (only to pick which stop goes first) and let the foot router order the rest on the streets.
    const startId = fixedStart ? stops[0]!.id : bestStartFallback(stops).order[0]!;
    const start = stops.find((s) => s.id === startId)!;
    const sent = [start, ...stops.filter((s) => s !== start)];
    const query = `roundtrip=false&source=first&destination=any&${overview}`;
    return parseOsrmTrip(sent, await get(`/trip/v1/foot/${coordinatesPath(sent)}?${query}`));
  };

  const directions: PathProvider = async (ordered) =>
    parseOsrmRoute(ordered, await get(`/route/v1/foot/${coordinatesPath(ordered)}?${overview}`));

  return {
    optimize: (stops, fixedStart) =>
      breaker.run('osm:optimize', () => optimize(stops, fixedStart), isUpstreamOutage),
    directions: (ordered) =>
      breaker.run('osm:directions', () => directions(ordered), isUpstreamOutage),
  };
}
