// Street-following walking routes (D-046): the path always comes from the walking network when
// OpenRouteService answers at all — the optimisation, or the directions for a known order —
// and the straight-line estimate is only the last resort.
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { CircuitBreaker } from '../_shared/breaker.ts';
import { cacheKey, createCached, noCache } from '../_shared/cache.ts';
import { FakeClock } from '../_shared/fake-clock.ts';
import { HttpError } from '../_shared/http.ts';
import { normalizeRouteInput } from './handler.ts';
import { createOrsRouting, ORS_COOL_DOWN_SECONDS, parseDirections } from './routing.ts';
import { fakeOrsFetch, memoryStore, ok } from './test-fakes.ts';

// Lisbon: Belém tower, Jerónimos, Praça do Comércio.
const STOPS = [
  { id: 'belem', lat: 38.6916, lng: -9.216, visitMinutes: 30 },
  { id: 'comercio', lat: 38.7075, lng: -9.1364, visitMinutes: 20 },
  { id: 'jeronimos', lat: 38.6979, lng: -9.2068, visitMinutes: 60 },
];

/** Recorded-shape ORS directions (GeoJSON) for belem → jeronimos → comercio, with street bends. */
const DIRECTIONS_OK = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-9.216, 38.6916],
        [-9.2141, 38.6927],
        [-9.2102, 38.6951],
        [-9.2068, 38.6979],
        [-9.1811, 38.7012],
        [-9.1523, 38.7049],
        [-9.1364, 38.7075],
      ],
    },
    properties: {
      segments: [{ distance: 1353.4, duration: 974.4 }, { distance: 6120.2, duration: 4406.5 }],
      summary: { distance: 7473.6, duration: 5380.9 },
    },
  }],
};

const QUOTA = new HttpError('https://api.openrouteservice.org/optimization', 403, 'Quota exceeded');

Deno.test('street route: optimisation over quota → local order, path from the directions', async () => {
  const { fetchJson, calls } = fakeOrsFetch({
    optimizationError: QUOTA,
    directions: DIRECTIONS_OK,
  });
  const r = await ok({ ors: createOrsRouting({ apiKey: 'k', fetchJson }), cached: noCache }, {
    stops: STOPS,
  });
  assertEquals(r.provider, 'openrouteservice');
  assertEquals(r.isFallback, false);
  // Shortest straight-line order from the first stop, walked on the street network.
  assertEquals(r.order, ['belem', 'jeronimos', 'comercio']);
  assertEquals(r.geometry.coordinates.length, 7, 'the path bends along the streets');
  assertEquals(r.legs, [
    { fromId: 'belem', toId: 'jeronimos', distanceM: 1353, durationS: 974 },
    { fromId: 'jeronimos', toId: 'comercio', distanceM: 6120, durationS: 4407 },
  ]);
  const directions = calls.find((c) => c.url.endsWith('/v2/directions/foot-walking/geojson'))!;
  // The GeoJSON endpoint answers 406 to `Accept: application/json` alone (found against ORS).
  assertEquals(directions.options?.headers?.Accept, 'application/geo+json, application/json');
  // A stop far from any footway (e.g. mid-bridge) snaps to the nearest walkable point instead
  // of failing the whole route (ORS error 2010, found with Lisbon's 25 de Abril Bridge).
  assertEquals((directions.options?.body as { radiuses: unknown }).radiuses, [-1, -1, -1]);
  // Per-leg segments only come with instructions (found against ORS: none without them).
  assertEquals((directions.options?.body as { instructions: unknown }).instructions, true);
  assertEquals((directions.options?.body as { coordinates: unknown }).coordinates, [
    [-9.216, 38.6916],
    [-9.2068, 38.6979],
    [-9.1364, 38.7075],
  ]);
});

Deno.test('street route: an order set by hand is kept; only the path is asked for', async () => {
  const { fetchJson, calls } = fakeOrsFetch({ directions: DIRECTIONS_OK });
  const manual = [STOPS[0]!, STOPS[2]!, STOPS[1]!]; // belem → jeronimos → comercio, as chosen
  const r = await ok({ ors: createOrsRouting({ apiKey: 'k', fetchJson }), cached: noCache }, {
    stops: manual,
    keepOrder: true,
  });
  assertEquals(r.order, ['belem', 'jeronimos', 'comercio']);
  assertEquals(r.provider, 'openrouteservice');
  assert(!calls.some((c) => c.url.endsWith('/optimization')), 'the optimiser is not asked');
});

Deno.test('street route: a kept order is cached by that order, not by the set of stops', async () => {
  const { store } = memoryStore();
  const cached = createCached(store);
  const { fetchJson, calls } = fakeOrsFetch({ directions: DIRECTIONS_OK });
  const deps = { ors: createOrsRouting({ apiKey: 'k', fetchJson }), cached };
  const forward = [STOPS[0]!, STOPS[2]!, STOPS[1]!];
  await ok(deps, { stops: forward, keepOrder: true });
  await ok(deps, { stops: forward, keepOrder: true });
  assertEquals(calls.length, 1, 'the same order hits the cache');
  const a = await cacheKey(
    'route:ors-path',
    normalizeRouteInput({ stops: forward, keepFirst: true, keepOrder: true }),
  );
  const b = await cacheKey(
    'route:ors-path',
    normalizeRouteInput({ stops: [...forward].reverse(), keepFirst: true, keepOrder: true }),
  );
  assert(a !== b, 'another order is another route');
});

Deno.test('street route: without any ORS answer, the kept order is walked in straight lines', async () => {
  const { fetchJson } = fakeOrsFetch({ error: QUOTA });
  const manual = [STOPS[0]!, STOPS[1]!, STOPS[2]!]; // belem → comercio → jeronimos, as chosen
  const r = await ok({ ors: createOrsRouting({ apiKey: 'k', fetchJson }), cached: noCache }, {
    stops: manual,
    keepOrder: true,
  });
  assertEquals(r.provider, 'fallback');
  assertEquals(r.isFallback, true);
  assertEquals(r.order, ['belem', 'comercio', 'jeronimos'], 'still in the chosen order');
});

Deno.test('street route: during an ORS outage, later requests skip ORS until the cool-down ends', async () => {
  const outage = new HttpError('https://api.openrouteservice.org/optimization', 503, 'down');
  const { fetchJson, calls } = fakeOrsFetch({ error: outage });
  const clock = new FakeClock();
  const breaker = new CircuitBreaker(ORS_COOL_DOWN_SECONDS, clock.now);
  const deps = { ors: createOrsRouting({ apiKey: 'k', fetchJson, breaker }), cached: noCache };
  assertEquals((await ok(deps, { stops: STOPS })).provider, 'fallback');
  assertEquals(calls.length, 2, 'optimisation, then directions for the local order');
  assertEquals((await ok(deps, { stops: STOPS })).provider, 'fallback');
  assertEquals(calls.length, 2, 'straight to the straight lines: no call waits on ORS');
  clock.advance(ORS_COOL_DOWN_SECONDS);
  await ok(deps, { stops: STOPS });
  assertEquals(calls.length, 4, 'ORS is asked again after the cool-down');
});

Deno.test('street route: without a key, a kept order is kept too', async () => {
  const manual = [STOPS[0]!, STOPS[1]!, STOPS[2]!];
  const r = await ok({ ors: null, cached: noCache }, { stops: manual, keepOrder: true });
  assertEquals(r.order, ['belem', 'comercio', 'jeronimos']);
});

Deno.test('parseDirections: legs match the segments; a malformed answer is an error', () => {
  const ordered = [STOPS[0]!, STOPS[2]!, STOPS[1]!];
  const route = parseDirections(ordered, DIRECTIONS_OK);
  assertEquals(route.order, ['belem', 'jeronimos', 'comercio']);
  assertEquals(route.legs.length, 2);
  const oneSegment = structuredClone(DIRECTIONS_OK);
  oneSegment.features[0]!.properties.segments.pop();
  // parseDirections throws synchronously (no await involved).
  assertThrows(
    () => parseDirections(ordered, oneSegment),
    Error,
    'ORS directions returned 1 segments for 3 stops, expected 2',
  );
  assertThrows(
    () => parseDirections(ordered, { features: [] }),
    Error,
    'ORS directions returned no route',
  );
});
