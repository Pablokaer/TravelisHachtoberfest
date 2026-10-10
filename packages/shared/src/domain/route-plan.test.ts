import { describe, expect, it } from 'vitest';

import { pathLength, type RoutePoint } from './route.ts';
import {
  cheapestInsertion,
  maxRouteParts,
  orderFromBestStart,
  orderFromStart,
  routesLength,
  splitCost,
  splitRoute,
  type SplitPoint,
} from './route-plan.ts';

/** A stop on a straight west–east line: `km` kilometres east of the origin (Lisbon latitude). */
const at = (id: string, km: number, northKm = 0): RoutePoint => ({
  id,
  lat: 38.7 + northKm / 111.2,
  lng: -9.2 + km / 86.8,
});
const ids = (points: readonly RoutePoint[]) => points.map((p) => p.id);

describe('orderFromStart', () => {
  it('visits the nearer stop first (1 → 3 → 2 when 3 is 2 km and 2 is 5 km away)', () => {
    expect(ids(orderFromStart([at('1', 0), at('2', 5), at('3', 2)]))).toEqual(['1', '3', '2']);
  });

  it('minimises the whole walk rather than sorting by distance from the start', () => {
    // Nearest-first from A would go A → B (1 km) and then back west; the shortest walk is
    // A → B → C → D (1 + 2.5 + 1.5 = 5 km), not A → C → D → B (1.5 + 1.5 + 4 = 7 km).
    const order = orderFromStart([at('A', 0), at('D', -3), at('B', 1), at('C', -1.5)]);
    expect(ids(order)).toEqual(['A', 'B', 'C', 'D']);
    const westFirst = [at('A', 0), at('C', -1.5), at('D', -3), at('B', 1)];
    expect(pathLength(order)).toBeLessThan(pathLength(westFirst));
  });

  it('returns 0–1 stops unchanged', () => {
    expect(orderFromStart([])).toEqual([]);
    expect(ids(orderFromStart([at('a', 0)]))).toEqual(['a']);
  });
});

describe('orderFromBestStart', () => {
  it('starts at an end of the line instead of the middle', () => {
    const order = ids(orderFromBestStart([at('mid', 1), at('w', 0), at('e', 2)]));
    expect([order[0], order[2]].sort()).toEqual(['e', 'w']);
  });
});

describe('cheapestInsertion', () => {
  it('slots a stop between its neighbours and never before the start', () => {
    expect(cheapestInsertion([at('a', 0), at('c', 2)], at('b', 1)).index).toBe(1);
    expect(cheapestInsertion([at('a', 1), at('b', 2)], at('w', 0)).index).toBeGreaterThan(0);
    expect(cheapestInsertion([at('a', 0), at('b', 1)], at('c', 2))).toMatchObject({ index: 2 });
  });

  it('accepts the first stop of an empty route at 0', () => {
    expect(cheapestInsertion([], at('a', 0))).toEqual({ index: 0, costM: 0 });
  });
});

describe('splitRoute', () => {
  // Two clusters 10 km apart; the walking order alternates between them on purpose.
  const west = [at('w1', 0), at('w2', 0.3), at('w3', 0.6, 0.2), at('w4', 0.2, 0.4)];
  const east = [at('e1', 10), at('e2', 10.3), at('e3', 10.1, 0.3)];
  const mixed = [west[0]!, east[0]!, west[1]!, east[1]!, west[2]!, east[2]!, west[3]!];

  it('keeps nearby stops together and the original start first', () => {
    const [first, second] = splitRoute(mixed, 2);
    expect(first![0]!.id).toBe('w1');
    expect(ids(first!).sort()).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(ids(second!).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('is shorter in total than cutting the list in half', () => {
    const halves = [orderFromStart(mixed.slice(0, 4)), orderFromStart(mixed.slice(4))];
    expect(routesLength(splitRoute(mixed, 2))).toBeLessThan(routesLength(halves));
  });

  it('gives every route at least two stops', () => {
    const line = Array.from({ length: 12 }, (_, i) => at(`s${i}`, i * (i % 3 === 0 ? 3 : 0.2)));
    const routes = splitRoute(line, 3);
    expect(routes).toHaveLength(3);
    expect(routes.every((r) => r.length >= 2)).toBe(true);
    expect(routes.flat()).toHaveLength(12);
  });

  it('rejects impossible splits with the offending values', () => {
    expect(() => splitRoute(mixed, 4)).toThrow('cannot split 7 stops into 4 routes of at least 2');
    expect(() => splitRoute(mixed, 1)).toThrow(RangeError);
  });

  it('maxRouteParts allows two stops per route', () => {
    expect(maxRouteParts(5)).toBe(2);
    expect(maxRouteParts(12)).toBe(6);
    // 20 stops would allow 10 two-stop routes; at most ROUTE_MAX_SPLIT_PARTS are offered.
    expect(maxRouteParts(20)).toBe(6);
  });
});

describe('balanced splits (D-023)', () => {
  const visit = (p: RoutePoint, minutes: number): SplitPoint => ({
    ...p,
    avgVisitMinutes: minutes,
  });
  const sizes = (routes: readonly unknown[][]) => routes.map((r) => r.length).sort((a, b) => a - b);

  it('does not leave one route with most of the stops when the places are close', () => {
    // 3 places around the start and 9 packed 1.5 km east: splitting purely by distance gives 3 + 9.
    const near = [at('n0', 0), at('n1', 0.2), at('n2', 0.1, 0.2)];
    const far = Array.from({ length: 9 }, (_, i) =>
      at(`f${i}`, 1.5 + (i % 3) * 0.15, Math.floor(i / 3) * 0.15),
    );
    const routes = splitRoute([...near, ...far], 2);
    const [small, large] = sizes(routes);
    expect(large! - small!).toBeLessThanOrEqual(2);
    expect(routes[0]![0]!.id).toBe('n0');
  });

  it('spreads long visits across routes instead of stacking them in one day', () => {
    // Two 3-hour museums side by side and four quick stops nearby.
    const stops = [
      visit(at('start', 0), 15),
      visit(at('museumA', 0.5), 180),
      visit(at('museumB', 0.55), 180),
      visit(at('v1', 0.2, 0.3), 15),
      visit(at('v2', 0.4, 0.3), 15),
      visit(at('v3', 0.6, 0.3), 15),
    ];
    const routes = splitRoute(stops, 2);
    const museumsPerRoute = routes.map((r) => r.filter((p) => p.id.startsWith('museum')).length);
    expect(museumsPerRoute).toEqual([1, 1]);
  });

  it('still keeps far-apart neighbourhoods together even if their sizes differ', () => {
    // 5 places here and 3 places 10 km away: balancing is not worth a 10 km walk.
    const here = Array.from({ length: 5 }, (_, i) => at(`h${i}`, i * 0.2));
    const there = [at('t0', 10), at('t1', 10.2), at('t2', 10.1, 0.2)];
    const routes = splitRoute([...here, ...there], 2);
    expect(ids(routes[0]!).sort()).toEqual(['h0', 'h1', 'h2', 'h3', 'h4']);
    expect(ids(routes[1]!).sort()).toEqual(['t0', 't1', 't2']);
  });

  it('scores balanced routes better than unbalanced ones with the same walking', () => {
    const [a, b, c, d] = [at('a', 0), at('b', 0), at('c', 0), at('d', 0)];
    const even = splitCost([
      [a!, b!],
      [c!, d!],
    ]);
    const uneven = splitCost([
      [visit(a!, 200), b!],
      [c!, d!],
    ]);
    expect(even).toBe(0);
    expect(uneven).toBeGreaterThan(even);
  });

  it('splits the longest route (20 stops into 3) quickly', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      at(`s${i}`, (i % 5) * 0.7, Math.floor(i / 5) * 0.7),
    );
    const started = Date.now();
    const routes = splitRoute(many, 3);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(routes.flat()).toHaveLength(20);
    expect(routes.every((r) => r.length >= 2)).toBe(true);
    expect(routes[0]![0]).toBe(many[0]);
  });

  it('splits the longest route (20 stops) into the most routes (6) quickly', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      at(`s${i}`, (i % 5) * 0.4, Math.floor(i / 5) * 0.4),
    );
    const started = Date.now();
    const routes = splitRoute(many, 6);
    // Well under a second on an idle machine; the margin keeps it repeatable under load.
    expect(Date.now() - started).toBeLessThan(3000);
    expect(routes).toHaveLength(6);
    expect(routes.flat()).toHaveLength(20);
    expect(splitRoute(many, 6)).toEqual(routes); // deterministic
  });

  it('splits the largest route (12 stops into 6) quickly', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      at(`s${i}`, (i % 4) * 0.7, Math.floor(i / 4) * 0.7),
    );
    const started = Date.now();
    const routes = splitRoute(many, 6);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(sizes(routes)).toEqual([2, 2, 2, 2, 2, 2]);
  });
});
