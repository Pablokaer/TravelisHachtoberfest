// The rule (D-087): a route is never a straight line between stops. It follows streets a person
// can walk: OpenRouteService when a key is set, else the public OpenStreetMap foot router (no key),
// and when neither answers the function says so (503) instead of drawing a line across buildings.
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { CircuitBreaker } from '../_shared/breaker.ts';
import { cacheKey, createCached, noCache } from '../_shared/cache.ts';
import { HttpError } from '../_shared/http.ts';
import { normalizeRouteInput } from './handler.ts';
import {
  createOrsRouting,
  createOsmFootRouting,
  OSM_ATTRIBUTION,
  parseOsrmRoute,
  parseOsrmTrip,
} from './routing.ts';
import { fakeOrsFetch, fakeOsmFetch, memoryStore, ok, post } from './test-fakes.ts';

// Lisbon: Belém tower, Jerónimos, Praça do Comércio.
const STOPS = [
  { id: 'belem', lat: 38.6916, lng: -9.216, visitMinutes: 30 },
  { id: 'comercio', lat: 38.7075, lng: -9.1364, visitMinutes: 20 },
  { id: 'jeronimos', lat: 38.6979, lng: -9.2068, visitMinutes: 60 },
];

/** A street path with bends: belem → jeronimos → comercio. */
const STREET_PATH = {
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
};
const LEGS = [{ distance: 1353.4, duration: 974.4 }, { distance: 6120.2, duration: 4406.5 }];

/** OSRM `/trip` answer; waypoints are in the order the stops were sent (belem, comercio, jeronimos). */
const TRIP_OK = {
  code: 'Ok',
  waypoints: [
    { waypoint_index: 0, trips_index: 0 },
    { waypoint_index: 2, trips_index: 0 },
    { waypoint_index: 1, trips_index: 0 },
  ],
  trips: [{ geometry: STREET_PATH, legs: LEGS, distance: 7473.6, duration: 5380.9 }],
};
/** OSRM `/route` answer for the same three stops in walking order. */
const ROUTE_OK = {
  code: 'Ok',
  routes: [{ geometry: STREET_PATH, legs: LEGS, distance: 7473.6, duration: 5380.9 }],
};
const DOWN = new HttpError('https://routing.openstreetmap.de/routed-foot/trip', 503, 'busy');

Deno.test('parseOsrmTrip: orders the stops by the trip and keeps the street path and legs', () => {
  const route = parseOsrmTrip(STOPS, TRIP_OK);
  assertEquals(route.order, ['belem', 'jeronimos', 'comercio']);
  assertEquals(route.legs.length, 2);
  assertEquals(route.legs[0], {
    fromId: 'belem',
    toId: 'jeronimos',
    distanceM: 1353,
    durationS: 974,
  });
  assertEquals(route.geometry.coordinates.length, 7, 'the path bends along the streets');
});

Deno.test('parseOsrmTrip: an answer that is not a street route is an error naming what is wrong', () => {
  assertThrows(() => parseOsrmTrip(STOPS, { code: 'NoRoute' }), Error, 'NoRoute');
  const twoWaypoints = { ...TRIP_OK, waypoints: TRIP_OK.waypoints.slice(0, 2) };
  assertThrows(() => parseOsrmTrip(STOPS, twoWaypoints), Error, '2 waypoints for 3 stops');
  const repeated = { ...TRIP_OK, waypoints: TRIP_OK.waypoints.map(() => TRIP_OK.waypoints[0]!) };
  assertThrows(() => parseOsrmTrip(STOPS, repeated), Error, 'each stop once');
  const straight = {
    ...TRIP_OK,
    trips: [{ ...TRIP_OK.trips[0]!, geometry: { type: 'LineString', coordinates: [[0, 0]] } }],
  };
  assertThrows(() => parseOsrmTrip(STOPS, straight), Error, 'no street geometry');
  const oneLeg = { ...TRIP_OK, trips: [{ ...TRIP_OK.trips[0]!, legs: [LEGS[0]!] }] };
  assertThrows(() => parseOsrmTrip(STOPS, oneLeg), Error, '1 legs for 3 stops, expected 2');
});

Deno.test('parseOsrmRoute: legs and street path for a known order; malformed answers are errors', () => {
  const ordered = [STOPS[0]!, STOPS[2]!, STOPS[1]!];
  const route = parseOsrmRoute(ordered, ROUTE_OK);
  assertEquals(route.order, ['belem', 'jeronimos', 'comercio']);
  assertEquals(route.legs.map((l) => l.distanceM), [1353, 6120]);
  assertThrows(() => parseOsrmRoute(ordered, { code: 'NoSegment' }), Error, 'NoSegment');
  assertThrows(() => parseOsrmRoute(ordered, { code: 'Ok', routes: [] }), Error, 'no route');
});

Deno.test('osm foot router: asks /trip with the first stop fixed and walking only', async () => {
  const { fetchJson, calls } = fakeOsmFetch({ trip: TRIP_OK });
  const route = await createOsmFootRouting({ fetchJson }).optimize(
    normalizeRouteInput({ stops: STOPS, keepFirst: true }).stops,
    true,
  );
  assertEquals(route.order, ['belem', 'jeronimos', 'comercio']);
  const url = new URL(calls[0]!.url);
  assert(url.pathname.endsWith('/trip/v1/foot/-9.216,38.6916;-9.1364,38.7075;-9.2068,38.6979'));
  assertEquals(url.searchParams.get('roundtrip'), 'false');
  assertEquals(url.searchParams.get('source'), 'first');
  assertEquals(url.searchParams.get('geometries'), 'geojson');
  assertEquals(url.searchParams.get('overview'), 'full');
});

Deno.test('osm foot router: a free start begins at the stop that makes the shortest walk', async () => {
  const { fetchJson, calls } = fakeOsmFetch({ trip: TRIP_OK });
  await createOsmFootRouting({ fetchJson }).optimize(STOPS, false);
  assert(calls[0]!.url.includes('/trip/v1/foot/'));
  assertEquals(new URL(calls[0]!.url).searchParams.get('source'), 'first');
});

Deno.test('osm foot router: a known order is walked with /route, in that order', async () => {
  const { fetchJson, calls } = fakeOsmFetch({ route: ROUTE_OK });
  const ordered = [STOPS[0]!, STOPS[2]!, STOPS[1]!];
  const route = await createOsmFootRouting({ fetchJson }).directions(ordered);
  assertEquals(route.order, ['belem', 'jeronimos', 'comercio']);
  assert(calls[0]!.url.includes('/route/v1/foot/-9.216,38.6916;-9.2068,38.6979;-9.1364,38.7075'));
});

Deno.test('route: no ORS key → the OpenStreetMap foot router draws the street path', async () => {
  const { fetchJson } = fakeOsmFetch({ trip: TRIP_OK });
  const osm = createOsmFootRouting({ fetchJson });
  const r = await ok({ ors: null, osm, cached: noCache }, { stops: STOPS });
  assertEquals(r.provider, 'osm-foot');
  assertEquals(r.isFallback, false);
  assertEquals(r.attribution, OSM_ATTRIBUTION);
  assertEquals(r.order, ['belem', 'jeronimos', 'comercio']);
  assert(r.geometry.coordinates.length > STOPS.length, 'more points than stops: it bends');
});

Deno.test('route: ORS down → the OpenStreetMap foot router answers, still on the streets', async () => {
  const ors = createOrsRouting({
    apiKey: 'k',
    fetchJson: fakeOrsFetch({ error: new HttpError('https://api.openrouteservice.org/x', 503, '') })
      .fetchJson,
  });
  const osm = createOsmFootRouting({ fetchJson: fakeOsmFetch({ trip: TRIP_OK }).fetchJson });
  const r = await ok({ ors, osm, cached: noCache }, { stops: STOPS });
  assertEquals(r.provider, 'osm-foot');
});

Deno.test('route: a kept order is walked along the streets by the OpenStreetMap foot router', async () => {
  const { fetchJson, calls } = fakeOsmFetch({ route: ROUTE_OK });
  const osm = createOsmFootRouting({ fetchJson });
  const manual = [STOPS[0]!, STOPS[2]!, STOPS[1]!];
  const r = await ok({ ors: null, osm, cached: noCache }, { stops: manual, keepOrder: true });
  assertEquals(r.order, ['belem', 'jeronimos', 'comercio']);
  assert(calls[0]!.url.includes('/route/v1/foot/'));
});

Deno.test('route: when no street router answers there is no route, never a straight line', async () => {
  const ors = createOrsRouting({
    apiKey: 'k',
    fetchJson: fakeOrsFetch({ error: DOWN }).fetchJson,
  });
  const osm = createOsmFootRouting({ fetchJson: fakeOsmFetch({ error: DOWN }).fetchJson });
  for (const deps of [{ ors, osm, cached: noCache }, { ors: null, osm: null, cached: noCache }]) {
    const res = await post(deps, { stops: STOPS });
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(body.error, 'street_routing_unavailable');
    assertEquals(body.geometry, undefined, 'no line is drawn');
    assert(!JSON.stringify(body).includes('coordinates'));
  }
});

Deno.test('route: a kept order with no street router is also an error, not straight lines', async () => {
  const res = await post({ ors: null, osm: null, cached: noCache }, {
    stops: STOPS,
    keepOrder: true,
  });
  assertEquals(res.status, 503);
});

Deno.test('route: OpenStreetMap results are cached, so the public router is asked once', async () => {
  const { store, rows } = memoryStore();
  const { fetchJson, calls } = fakeOsmFetch({ trip: TRIP_OK });
  const deps = {
    ors: null,
    osm: createOsmFootRouting({ fetchJson }),
    cached: createCached(store),
  };
  await ok(deps, { stops: STOPS });
  const again = await ok(deps, { stops: STOPS });
  assertEquals(again.provider, 'osm-foot');
  assertEquals(calls.length, 1);
  assertEquals(rows.size, 1);
  const key = await cacheKey('route:osm', normalizeRouteInput({ stops: STOPS, keepFirst: true }));
  assert(rows.has(key));
});

Deno.test('osm foot router: during an outage later requests skip it until the cool-down ends', async () => {
  const { fetchJson, calls } = fakeOsmFetch({ error: DOWN });
  const breaker = new CircuitBreaker(60);
  const deps = { ors: null, osm: createOsmFootRouting({ fetchJson, breaker }), cached: noCache };
  assertEquals((await post(deps, { stops: STOPS })).status, 503);
  const afterFirst = calls.length;
  assertEquals((await post(deps, { stops: STOPS })).status, 503);
  assertEquals(calls.length, afterFirst, 'the second request does not wait on the router');
});
