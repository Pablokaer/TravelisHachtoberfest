// Characterization of the exact ordering (Held-Karp): the optimised implementation must return
// exactly what the textbook dynamic programme below returns — same relaxation order, same
// tie-break (strict `<`, lowest index wins) — including on tie-heavy grids.
import { describe, expect, it } from 'vitest';

import { haversineMeters } from './geo.ts';
import {
  EXACT_ORDER_MAX_STOPS,
  optimizeOrder,
  optimizeOrderAnyStart,
  type RoutePoint,
} from './route.ts';

/** Walks `prev` back from the cheapest complete path (lowest index on ties). */
function traceBack(cost: number[][], prev: number[][], n: number): number[] {
  let mask = (1 << n) - 1;
  let last = 0;
  for (let j = 1; j < n; j++) if (cost[mask]![j]! < cost[mask]![last]!) last = j;
  const order: number[] = [];
  while (last >= 0) {
    order.push(last);
    const before = prev[mask]![last]!;
    mask &= ~(1 << last);
    last = before;
  }
  return order.reverse();
}

/** Textbook Held-Karp over nested arrays: the oracle. `start` null lets any stop start. */
function referenceOrder(points: readonly RoutePoint[], start: number | null): string[] {
  const n = points.length;
  const d = points.map((a) => points.map((b) => haversineMeters(a, b)));
  const cost = Array.from({ length: 1 << n }, () => Array<number>(n).fill(Infinity));
  const prev = Array.from({ length: 1 << n }, () => Array<number>(n).fill(-1));
  for (let j = 0; j < n; j++) if (start === null || j === start) cost[1 << j]![j] = 0;
  for (let mask = 1; mask < 1 << n; mask++) {
    for (let last = 0; last < n; last++) {
      for (let next = 0; next < n; next++) {
        if (cost[mask]![last] === Infinity || mask & (1 << next)) continue;
        const to = mask | (1 << next);
        const c = cost[mask]![last]! + d[last]![next]!;
        if (c < cost[to]![next]! - 1e-9) [cost[to]![next], prev[to]![next]] = [c, last];
      }
    }
  }
  const order = traceBack(cost, prev, n);
  const flipped = start === null && order[order.length - 1]! < order[0]!;
  return (flipped ? order.reverse() : order).map((i) => points[i]!.id);
}

/** Deterministic points around Lisbon; `grid` snaps them to 3×3 spots (many equal distances). */
function points(count: number, seed: number, grid: boolean): RoutePoint[] {
  let state = seed + 1;
  const next = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const coord = (base: number, span: number) =>
    base + (grid ? Math.floor(next() * 3) / 2 : next()) * span;
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    lat: coord(38.7, 0.03),
    lng: coord(-9.16, 0.05),
  }));
}

const ids = (route: readonly RoutePoint[]) => route.map((p) => p.id);
const SIZES = [2, 3, 5, 8, 10, 11, EXACT_ORDER_MAX_STOPS];

describe.each([false, true])('exact ordering equals the textbook programme (grid: %s)', (grid) => {
  it.each(SIZES)('%i stops, fixed start', (n) => {
    for (let seed = 0; seed < 15; seed++) {
      const route = points(n, seed * 31 + n, grid);
      expect(ids(optimizeOrder(route))).toEqual(referenceOrder(route, 0));
    }
  });

  it.each(SIZES)('%i stops, any start', (n) => {
    for (let seed = 0; seed < 15; seed++) {
      const route = points(n, seed * 17 + n, grid);
      expect(ids(optimizeOrderAnyStart(route))).toEqual(referenceOrder(route, null));
    }
  });
});
