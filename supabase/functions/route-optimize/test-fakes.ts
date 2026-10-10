// Test doubles for route-optimize: a fake OpenRouteService and an in-memory cache store.
import { assertEquals } from 'jsr:@std/assert@1';
import { type RouteResponse, routeResponseSchema } from '@wayfarer/shared';

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
