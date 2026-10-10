import { assert, assertEquals } from 'jsr:@std/assert@1';

import { cacheKey, createCached, noCache } from '../_shared/cache.ts';
import { HttpError } from '../_shared/http.ts';
import { createHandler, FALLBACK_TTL, normalizeRouteInput } from './handler.ts';
import { createOrsRouting, FALLBACK_ATTRIBUTION, ORS_ATTRIBUTION } from './routing.ts';
import { fakeOrsFetch, memoryStore, ok, post } from './test-fakes.ts';

// Lisbon: Belém tower, Jerónimos, Praça do Comércio, Castelo de São Jorge.
const STOPS = [
  { id: 'belem', lat: 38.6916, lng: -9.216, visitMinutes: 30 },
  { id: 'castelo', lat: 38.7139, lng: -9.1335, visitMinutes: 90 },
  { id: 'jeronimos', lat: 38.6979, lng: -9.2068, visitMinutes: 60 },
  { id: 'comercio', lat: 38.7075, lng: -9.1364, visitMinutes: 20 },
];

/**
 * Recorded-shape VROOM response (requested with `options.g`). Jobs are the non-start stops
 * sorted by id, as `normalizeRouteInput` sends them (castelo=0, comercio=1, jeronimos=2); step
 * distance/duration are cumulative; geometry is the encoded polyline of the four stops.
 */
const VROOM_OK = {
  code: 0,
  summary: { cost: 6578, routes: 1, unassigned: 0 },
  unassigned: [],
  routes: [{
    vehicle: 0,
    cost: 6578,
    distance: 9136.2,
    duration: 6578,
    geometry: 'o}ckF~~fw@kf@ox@_{@_wL_g@cQ',
    steps: [
      { type: 'start', location: [-9.216, 38.6916], distance: 0, duration: 0 },
      {
        type: 'job',
        id: 2,
        job: 2,
        location: [-9.2068, 38.6979],
        distance: 1012.4,
        duration: 728.9,
      },
      {
        type: 'job',
        id: 1,
        job: 1,
        location: [-9.1364, 38.7075],
        distance: 8133,
        duration: 5855.7,
      },
      {
        type: 'job',
        id: 0,
        job: 0,
        location: [-9.1335, 38.7139],
        distance: 9136.2,
        duration: 6578,
      },
    ],
  }],
};

Deno.test('route: ORS order, legs and geometry from a single VROOM call', async () => {
  const { fetchJson, calls } = fakeOrsFetch({ optimization: VROOM_OK });
  const ors = createOrsRouting({ apiKey: 'test-key', fetchJson });
  const r = await ok({ ors, cached: noCache }, { stops: STOPS });

  assertEquals(r.order, ['belem', 'jeronimos', 'comercio', 'castelo']);
  assertEquals(r.legs, [
    { fromId: 'belem', toId: 'jeronimos', distanceM: 1012, durationS: 729 },
    { fromId: 'jeronimos', toId: 'comercio', distanceM: 7121, durationS: 5127 },
    { fromId: 'comercio', toId: 'castelo', distanceM: 1003, durationS: 722 },
  ]);
  assertEquals(r.geometry.coordinates, [
    [-9.216, 38.6916],
    [-9.2068, 38.6979],
    [-9.1364, 38.7075],
    [-9.1335, 38.7139],
  ]);
  assertEquals(r.distanceM, 1012 + 7121 + 1003);
  assertEquals(r.walkingSeconds, 729 + 5127 + 722);
  assertEquals(r.visitMinutes, 200);
  assertEquals(r.isFallback, false);
  assertEquals(r.provider, 'openrouteservice');
  assertEquals(r.attribution, ORS_ATTRIBUTION);

  // Request shape: one optimization call asking for geometry, no directions call.
  assertEquals(calls.length, 1);
  const [opt] = calls;
  assertEquals(opt!.options?.headers?.Authorization, 'test-key');
  const optBody = opt!.options?.body as {
    jobs: { id: number; location: number[]; service: number }[];
    vehicles: { profile: string; start: number[]; end?: number[] }[];
    options: { g: boolean };
  };
  assertEquals(optBody.options.g, true);
  assertEquals(optBody.vehicles[0]!.profile, 'foot-walking');
  assertEquals(optBody.vehicles[0]!.start, [-9.216, 38.6916]);
  assertEquals(optBody.vehicles[0]!.end, undefined);
  assertEquals(optBody.jobs.map((j) => j.id), [0, 1, 2]);
  assertEquals(optBody.jobs[0]!.location, [-9.1335, 38.7139]);
  assertEquals(optBody.jobs.every((j) => j.service === 0), true);
});

Deno.test('route: no ORS key → fallback (cached 1 h)', async () => {
  const { store, rows } = memoryStore();
  const t0 = new Date('2026-09-27T00:00:00Z');
  const cached = createCached(store, { now: () => t0, random: () => 1 });
  const r = await ok({ ors: null, cached }, { stops: STOPS });
  assertEquals(r.isFallback, true);
  assertEquals(r.provider, 'fallback');
  assertEquals(r.attribution, FALLBACK_ATTRIBUTION);
  assertEquals(r.order[0], 'belem');
  assertEquals(new Set(r.order).size, 4);
  assertEquals(r.legs.length, 3);
  assertEquals(r.geometry.coordinates[0], [-9.216, 38.6916]);
  assertEquals(r.distanceM, r.legs.reduce((a, l) => a + l.distanceM, 0));
  const [row] = [...rows.values()];
  assertEquals(row!.expiresAt.getTime() - t0.getTime(), FALLBACK_TTL * 1000);
});

Deno.test('route: ORS error → fallback, not cached', async () => {
  const { store, rows } = memoryStore();
  const { fetchJson } = fakeOrsFetch({
    error: new HttpError('https://api.openrouteservice.org/optimization', 503, 'busy'),
  });
  const ors = createOrsRouting({ apiKey: 'k', fetchJson });
  const r = await ok({ ors, cached: createCached(store) }, { stops: STOPS });
  assertEquals(r.isFallback, true);
  assertEquals(r.provider, 'fallback');
  assertEquals(rows.size, 0);
});

Deno.test('route: malformed ORS response (unassigned job) → fallback', async () => {
  const { fetchJson } = fakeOrsFetch({ optimization: { ...VROOM_OK, unassigned: [{ id: 2 }] } });
  const ors = createOrsRouting({ apiKey: 'k', fetchJson });
  const r = await ok({ ors, cached: noCache }, { stops: STOPS });
  assertEquals(r.provider, 'fallback');
});

Deno.test('route: VROOM answer without geometry or step totals → fallback', async () => {
  const [route] = VROOM_OK.routes;
  const noGeometry = { ...VROOM_OK, routes: [{ ...route!, geometry: undefined }] };
  const noTotals = {
    ...VROOM_OK,
    routes: [{ ...route!, steps: route!.steps.map(({ distance: _d, ...step }) => step) }],
  };
  for (const optimization of [noGeometry, noTotals]) {
    const ors = createOrsRouting({
      apiKey: 'k',
      fetchJson: fakeOrsFetch({ optimization }).fetchJson,
    });
    const r = await ok({ ors, cached: noCache }, { stops: STOPS });
    assertEquals(r.provider, 'fallback');
  }
});

Deno.test('route: ORS results are cached for 30 days by normalized input', async () => {
  const { store, rows } = memoryStore();
  const { fetchJson, calls } = fakeOrsFetch({ optimization: VROOM_OK });
  const deps = { ors: createOrsRouting({ apiKey: 'k', fetchJson }), cached: createCached(store) };
  await ok(deps, { stops: STOPS });
  // Same stops with sub-micro-degree noise hit the cache.
  const noisy = STOPS.map((s) => ({ ...s, lat: s.lat + 1e-9 }));
  const again = await ok(deps, { stops: noisy });
  assertEquals(again.provider, 'openrouteservice');
  assertEquals(calls.length, 1);
  const key = await cacheKey('route:ors', normalizeRouteInput({ stops: STOPS, keepFirst: true }));
  assert(rows.has(key));
});

Deno.test('route: keepFirst=false lets the optimiser pick the start', async () => {
  // Stops on a line, given in a bad order: the best open path starts at an end.
  const line = [
    { id: 'b', lat: 38.7, lng: -9.15, visitMinutes: 10 },
    { id: 'a', lat: 38.7, lng: -9.16, visitMinutes: 10 },
    { id: 'c', lat: 38.7, lng: -9.14, visitMinutes: 10 },
    { id: 'd', lat: 38.7, lng: -9.13, visitMinutes: 10 },
  ];
  const kept = await ok({ ors: null, cached: noCache }, { stops: line });
  assertEquals(kept.order[0], 'b');
  const free = await ok({ ors: null, cached: noCache }, { stops: line, keepFirst: false });
  assert(['a', 'd'].includes(free.order[0]!));
  assert(free.distanceM < kept.distanceM);
});

Deno.test('route: invalid input → 400', async () => {
  const deps = { ors: null, cached: noCache };
  const one = await post(deps, { stops: [STOPS[0]] });
  assertEquals(one.status, 400);
  assertEquals((await one.json()).error, 'bad_request');
  const dup = await post(deps, { stops: [STOPS[0], STOPS[0]] });
  assertEquals(dup.status, 400);
});

Deno.test('route: up to 20 stops are routed; 21 are rejected', async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    ...STOPS[0],
    id: `s${i}`,
    lng: STOPS[0].lng + i * 0.002,
  }));
  const r = await ok({ ors: null, cached: noCache }, { stops: many });
  assertEquals(r.order.length, 20);
  assertEquals(r.order[0], 's0');
  assertEquals(r.legs.length, 19);
  const tooMany = await post({ ors: null, cached: noCache }, {
    stops: [...many, { ...STOPS[0], id: 's20', lng: STOPS[0].lng + 0.05 }],
  });
  assertEquals(tooMany.status, 400);
});

Deno.test('route: OPTIONS preflight and method not allowed', async () => {
  const handler = createHandler({ ors: null, cached: noCache });
  const pre = await handler(new Request('http://localhost/route-optimize', { method: 'OPTIONS' }));
  assertEquals(pre.status, 200);
  assertEquals(pre.headers.get('Access-Control-Allow-Origin'), '*');
  const get = await handler(new Request('http://localhost/route-optimize'));
  assertEquals(get.status, 405);
});

Deno.test('route: the same places in another order (same start) hit the cache', async () => {
  const { store } = memoryStore();
  const { fetchJson, calls } = fakeOrsFetch({ optimization: VROOM_OK });
  const deps = { ors: createOrsRouting({ apiKey: 'k', fetchJson }), cached: createCached(store) };
  const first = await ok(deps, { stops: STOPS });
  // E.g. "Optimise" again after the app applied the optimised order.
  const reordered = first.order.map((id) => STOPS.find((s) => s.id === id)!);
  const again = await ok(deps, { stops: reordered });
  assertEquals(calls.length, 1);
  assertEquals(again.order, first.order);
});

Deno.test('route: normalizeRouteInput keeps the start and sorts the other stops by id', () => {
  const [belem, castelo, jeronimos, comercio] = STOPS;
  const input = { stops: [jeronimos!, castelo!, belem!, comercio!] };
  const ids = (n: { stops: { id: string }[] }) => n.stops.map((s) => s.id);
  assertEquals(ids(normalizeRouteInput({ ...input, keepFirst: true })), [
    'jeronimos',
    'belem',
    'castelo',
    'comercio',
  ]);
  assertEquals(ids(normalizeRouteInput({ ...input, keepFirst: false })), [
    'belem',
    'castelo',
    'comercio',
    'jeronimos',
  ]);
});
