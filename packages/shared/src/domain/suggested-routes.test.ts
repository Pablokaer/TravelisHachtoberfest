import { describe, expect, it } from 'vitest';

import type { RoutePoint } from './route.ts';
import {
  nearestCity,
  rankByProximity,
  startFromNearest,
  SUGGESTED_ROUTES_MAX_CITY_DISTANCE_M,
  type CityPoint,
} from './suggested-routes.ts';

/** A stop `km` kilometres east of the origin (Lisbon latitude), `northKm` north of it. */
const at = (id: string, km: number, northKm = 0): RoutePoint => ({
  id,
  lat: 38.7 + northKm / 111.2,
  lng: -9.2 + km / 86.8,
});
const ids = (points: readonly RoutePoint[]) => points.map((p) => p.id);

describe('startFromNearest', () => {
  it('reverses a route whose far end is the nearest stop', () => {
    const route = [at('a', 0), at('b', 2), at('c', 5)];
    expect(ids(startFromNearest(route, at('user', 4.8)))).toEqual(['c', 'b', 'a']);
  });

  it('keeps a route whose first stop is already the nearest', () => {
    const route = [at('a', 0), at('b', 2), at('c', 5)];
    expect(ids(startFromNearest(route, at('user', -0.5)))).toEqual(['a', 'b', 'c']);
  });

  it('starts at an interior stop and walks the rest by the shortest path', () => {
    // From b: b → a → c is 2 + 5 = 7 km, b → c → a is 3 + 5 = 8 km.
    const route = [at('a', 0), at('b', 2), at('c', 5)];
    expect(ids(startFromNearest(route, at('user', 2.1)))).toEqual(['b', 'a', 'c']);
  });

  it('returns routes of 0 or 1 stops unchanged and never mutates its input', () => {
    expect(startFromNearest([], at('user', 0))).toEqual([]);
    const single = [at('a', 1)];
    expect(startFromNearest(single, at('user', 9))).toEqual(single);
    const route = [at('a', 0), at('b', 2), at('c', 5)];
    startFromNearest(route, at('user', 4.8));
    expect(ids(route)).toEqual(['a', 'b', 'c']);
  });
});

describe('rankByProximity', () => {
  const near = { id: 'near', stops: [at('n1', 1), at('n2', 2)] };
  const far = { id: 'far', stops: [at('f1', 8), at('f2', 9)] };

  it('lists the route with the nearest first stop first', () => {
    const ranked = rankByProximity([far, near], at('user', 0));
    expect(ranked.map((r) => r.id)).toEqual(['near', 'far']);
  });

  it('starts every route at its stop nearest to the user and says how far that is', () => {
    const [first, second] = rankByProximity([far, near], at('user', 9.5));
    expect(first!.id).toBe('far');
    expect(ids(first!.stops)).toEqual(['f2', 'f1']);
    expect(first!.startDistanceM).toBeGreaterThan(400);
    expect(first!.startDistanceM).toBeLessThan(600);
    expect(second!.startDistanceM).toBeGreaterThan(first!.startDistanceM);
  });

  it('reports the walk of the re-ordered route in metres, with the street detour', () => {
    const [ranked] = rankByProximity([near], at('user', 0));
    // 1 km straight line × 1.3 detour.
    expect(ranked!.walkingMeters).toBeGreaterThan(1250);
    expect(ranked!.walkingMeters).toBeLessThan(1350);
  });

  it('breaks distance ties by route id so the order is stable', () => {
    const a = { id: 'a', stops: [at('a1', 3), at('a2', 4)] };
    const b = { id: 'b', stops: [at('b1', 3), at('b2', 5)] };
    expect(rankByProximity([b, a], at('user', 0)).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps the other fields of each route', () => {
    const titled = { id: 't', title: 'Old town', stops: [at('t1', 1), at('t2', 2)] };
    expect(rankByProximity([titled], at('user', 0))[0]!.title).toBe('Old town');
  });
});

describe('nearestCity', () => {
  const lisbon: CityPoint = { slug: 'lisbon', lat: 38.72, lng: -9.14 };
  const porto: CityPoint = { slug: 'porto', lat: 41.15, lng: -8.61 };

  it('picks the city closest to the user', () => {
    expect(nearestCity([porto, lisbon], { lat: 38.7, lng: -9.2 })?.city.slug).toBe('lisbon');
  });

  it('is null when no city is within the coverage distance', () => {
    expect(nearestCity([lisbon, porto], { lat: 48.85, lng: 2.35 })).toBeNull();
    expect(nearestCity([], { lat: 38.7, lng: -9.2 })).toBeNull();
  });

  it('accepts a user inside the coverage distance and reports it', () => {
    const found = nearestCity([lisbon], { lat: 38.8, lng: -9.2 });
    expect(found?.distanceM).toBeLessThan(SUGGESTED_ROUTES_MAX_CITY_DISTANCE_M);
    expect(found?.distanceM).toBeGreaterThan(5_000);
  });
});

describe('visited places (D-085)', () => {
  const near = { id: 'near', stops: [at('n1', 1), at('n2', 2)] };
  const mid = { id: 'mid', stops: [at('m1', 1.5), at('m2', 3)] };
  const far = { id: 'far', stops: [at('f1', 8), at('f2', 9)] };
  const user = at('user', 0);

  it('starts a route at its nearest stop that is not visited yet', () => {
    const [ranked] = rankByProximity([near], user, new Set(['n1']));
    expect(ids(ranked!.stops)).toEqual(['n2', 'n1']);
    expect(ranked!.startDistanceM).toBeGreaterThan(1500);
  });

  it('ranks a route below one whose nearest stop is still new, however close the visited one is', () => {
    const order = rankByProximity([near, mid, far], user, new Set(['n1'])).map((r) => r.id);
    expect(order).toEqual(['mid', 'near', 'far']);
  });

  it('puts a route whose stops are all visited last, even when it is the nearest', () => {
    const order = rankByProximity([near, far], user, new Set(['n1', 'n2'])).map((r) => r.id);
    expect(order).toEqual(['far', 'near']);
  });

  it('counts the visited stops of each route', () => {
    const counts = rankByProximity([near, far], user, new Set(['n1', 'f2'])).map(
      (r) => [r.id, r.visitedStops] as const,
    );
    expect(counts).toEqual([
      ['near', 1],
      ['far', 1],
    ]);
  });

  it('ranks exactly as before when nothing is visited', () => {
    const plain = rankByProximity([far, near], user).map((r) => r.id);
    expect(rankByProximity([far, near], user, new Set()).map((r) => r.id)).toEqual(plain);
    expect(rankByProximity([near], user)[0]!.visitedStops).toBe(0);
  });
});
