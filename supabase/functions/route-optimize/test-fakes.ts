// Test doubles for route-optimize: a fake OpenRouteService and an in-memory cache store.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  haversineMeters,
  type RouteResponse,
  routeResponseSchema,
  walkingSeconds,
} from '@wayfarer/shared';

import type { CacheStore } from '../_shared/cache.ts';
import type { FetchJson, FetchJsonOptions } from '../_shared/http.ts';
import { createHandler, type RouteDeps } from './handler.ts';

type Call = { url: string; options?: FetchJsonOptions };

/**
 * Fake OpenRouteService: answers `/optimization` and `/v2/directions/foot-walking/geojson` with
 * the given bodies, or rejects them (`error` for every call, `optimizationError` /
 * `directionsError` for one endpoint). Records every call.
 */
export function fakeOrsFetch(responses: {
  optimization?: unknown;
  directions?: unknown;
  error?: Error;
  optimizationError?: Error;
  directionsError?: Error;
}) {
  const calls: Call[] = [];
  const fetchJson: FetchJson = <T>(url: string, options?: FetchJsonOptions) => {
    calls.push({ url, options });
    if (responses.error) return Promise.reject(responses.error);
    if (url.endsWith('/optimization')) {
      if (responses.optimizationError) return Promise.reject(responses.optimizationError);
      return Promise.resolve(responses.optimization as T);
    }
    if (url.endsWith('/v2/directions/foot-walking/geojson') && responses.directions) {
      if (responses.directionsError) return Promise.reject(responses.directionsError);
      return Promise.resolve(responses.directions as T);
    }
    if (url.endsWith('/v2/directions/foot-walking/geojson') && responses.directionsError) {
      return Promise.reject(responses.directionsError);
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  return { fetchJson, calls };
}

/**
 * Fake OpenStreetMap foot router (OSRM): answers `/trip/v1/foot/` and `/route/v1/foot/` with the
 * given bodies, or rejects every call with `error`. Records every call.
 */
export function fakeOsmFetch(responses: { trip?: unknown; route?: unknown; error?: Error }) {
  const calls: Call[] = [];
  const fetchJson: FetchJson = <T>(url: string, options?: FetchJsonOptions) => {
    calls.push({ url, options });
    if (responses.error) return Promise.reject(responses.error);
    if (url.includes('/trip/v1/foot/') && responses.trip) {
      return Promise.resolve(responses.trip as T);
    }
    if (url.includes('/route/v1/foot/') && responses.route) {
      return Promise.resolve(responses.route as T);
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  return { fetchJson, calls };
}

/**
 * A fake OpenStreetMap foot router that answers any request: it keeps the stops in the order it
 * was sent and walks each pair with a bend in between (so the path is never a straight line),
 * with legs measured from the coordinates. Lets tests exercise the handler with many stops.
 */
export function echoOsmFetch() {
  const fetchJson: FetchJson = <T>(url: string) => {
    const path = new URL(url).pathname;
    const coords = path.split('/').pop()!.split(';').map((c) => {
      const [lng, lat] = c.split(',').map(Number);
      return { lng: lng!, lat: lat! };
    });
    const path_: number[][] = [];
    const legs = coords.slice(1).map((to, i) => {
      const from = coords[i]!;
      path_.push([from.lng, from.lat], [(from.lng + to.lng) / 2, (from.lat + to.lat) / 2 + 0.0004]);
      const distance = haversineMeters(from, to);
      return { distance, duration: walkingSeconds(distance) };
    });
    const last = coords[coords.length - 1]!;
    path_.push([last.lng, last.lat]);
    const geometry = { type: 'LineString', coordinates: path_ };
    const body = path.includes('/trip/v1/')
      ? {
        code: 'Ok',
        waypoints: coords.map((_, i) => ({ waypoint_index: i })),
        trips: [{ geometry, legs }],
      }
      : { code: 'Ok', routes: [{ geometry, legs }] };
    return Promise.resolve(body as T);
  };
  return { fetchJson };
}

/** In-memory `api_cache`. */
export function memoryStore() {
  const rows = new Map<string, { value: unknown; expiresAt: Date }>();
  const store: CacheStore = {
    // Fresh or expired: the cache itself decides what it may answer.
    get: (k) => Promise.resolve(rows.get(k)),
    set: (k, value, expiresAt) => {
      rows.set(k, { value, expiresAt });
      return Promise.resolve();
    },
    purgeExpired: () => Promise.resolve(),
  };
  return { store, rows };
}

export async function post(deps: RouteDeps, body: unknown): Promise<Response> {
  return await createHandler(deps)(
    new Request('http://localhost/route-optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function ok(deps: RouteDeps, body: unknown): Promise<RouteResponse> {
  const res = await post(deps, body);
  assertEquals(res.status, 200, await res.clone().text());
  return routeResponseSchema.parse(await res.json());
}
