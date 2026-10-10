import { ROUTE_MAX_STOPS, ROUTE_MIN_STOPS } from '../constants/index.ts';
import type { LatLng } from '../schemas/common.ts';
import { estimateWalkingMeters, haversineMeters, walkingSeconds } from './geo.ts';

export type RoutePoint = LatLng & { id: string };

/** Straight-line length of an open path, in metres. */
export function pathLength(order: readonly RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < order.length; i++) total += haversineMeters(order[i - 1]!, order[i]!);
  return total;
}

/**
 * Up to this many stops the order is exact (Held-Karp, O(2ⁿ·n²): ~1 ms at 12, ~4 s at 20);
 * longer routes, up to ROUTE_MAX_STOPS, use nearest neighbour + 2-opt (D-030).
 */
export const EXACT_ORDER_MAX_STOPS = 12;

function assertStopCount(points: readonly RoutePoint[]): void {
  if (points.length < ROUTE_MIN_STOPS || points.length > ROUTE_MAX_STOPS) {
    throw new RangeError(
      `a route needs between ${ROUTE_MIN_STOPS} and ${ROUTE_MAX_STOPS} stops, got ${points.length}`,
    );
  }
}

/** Pairwise straight-line distances, in metres. */
function distanceMatrix(points: readonly RoutePoint[]): number[][] {
  return points.map((a) => points.map((b) => haversineMeters(a, b)));
}

/**
 * Held-Karp tables: `cost[mask·n + last]` is the shortest path over `mask` ending at `last`;
 * `d[i·n + j]` the distance from stop i to stop j. Flat typed arrays keep the inner loop cheap
 * on Hermes, which has no JIT (the loop ran ~1.9× faster than over nested arrays).
 */
type PathTables = { n: number; d: Float64Array; cost: Float64Array; prev: Int8Array };

/** The distance matrix in one flat array, row after row. */
function flatten(d: readonly number[][]): Float64Array {
  const flat = new Float64Array(d.length * d.length);
  d.forEach((row, i) => flat.set(row, i * d.length));
  return flat;
}

/** Relaxes every path over `mask` by one more stop. */
function extendPaths(mask: number, { n, d, cost, prev }: PathTables): void {
  // Locals, not `t.cost[…]`: an interpreter looks a property up on every access.
  for (let last = 0; last < n; last++) {
    const here = cost[mask * n + last]!;
    if (here === Infinity) continue;
    for (let next = 0; next < n; next++) {
      if (mask & (1 << next)) continue;
      const slot = (mask | (1 << next)) * n + next;
      const total = here + d[last * n + next]!;
      // Strict comparison (lowest index wins ties) keeps the result deterministic.
      if (!(total < cost[slot]! - 1e-9)) continue;
      cost[slot] = total;
      prev[slot] = last;
    }
  }
}

/** Walks the `prev` links back from the cheapest complete path. */
function tracePath(t: PathTables): number[] {
  let mask = (1 << t.n) - 1;
  let last = 0;
  for (let j = 1; j < t.n; j++) if (t.cost[mask * t.n + j]! < t.cost[mask * t.n + last]!) last = j;
  const order: number[] = [];
  while (last >= 0) {
    order.push(last);
    const prev = t.prev[mask * t.n + last]!;
    mask &= ~(1 << last);
    last = prev;
  }
  return order.reverse();
}

/**
 * Exact shortest open path by dynamic programming over subsets (Held-Karp): O(2ⁿ·n²), about
 * 1 ms for the 12-stop maximum. It replaced nearest neighbour + 2-opt, which walked up to 21%
 * further on 46% of random 12-stop routes. `start` fixes the first stop; null lets any start.
 */
function shortestOpenPath(d: readonly number[][], start: number | null): number[] {
  const n = d.length;
  const size = (1 << n) * n;
  const t: PathTables = {
    n,
    d: flatten(d),
    cost: new Float64Array(size).fill(Infinity),
    prev: new Int8Array(size).fill(-1),
  };
  for (let j = 0; j < n; j++) if (start === null || j === start) t.cost[(1 << j) * n + j] = 0;
  // With a fixed start, a subset without it has no path: skipping it halves the work.
  const startBit = start === null ? 0 : 1 << start;
  for (let mask = 1; mask < 1 << n; mask++) if (mask & startBit || !startBit) extendPaths(mask, t);
  const order = tracePath(t);
  // With a free start a path and its reverse are equally short: start from the stop listed
  // first, so e.g. the second half of a split carries on from where the first one ended.
  return start === null && order[order.length - 1]! < order[0]! ? order.reverse() : order;
}

/** Greedy path from `start`: always walk to the nearest stop not yet visited. */
function nearestNeighbourPath(d: readonly number[][], start: number): number[] {
  const order = [start];
  const left = new Set(d.map((_, i) => i).filter((i) => i !== start));
  while (left.size > 0) {
    const here = order[order.length - 1]!;
    let next = -1;
    for (const i of left) if (next < 0 || d[here]![i]! < d[here]![next]! - 1e-9) next = i;
    order.push(next);
    left.delete(next);
  }
  return order;
}

/** Length change of reversing `order[i..j]` in an open path (no edge before 0 or after n-1). */
function reversalGain(d: readonly number[][], order: readonly number[], i: number, j: number) {
  const [a, b, c, e] = [order[i - 1], order[i]!, order[j]!, order[j + 1]];
  const before = (a === undefined ? 0 : d[a]![b]!) + (e === undefined ? 0 : d[c]![e]!);
  const after = (a === undefined ? 0 : d[a]![c]!) + (e === undefined ? 0 : d[b]![e]!);
  return before - after;
}

/** 2-opt: reverses stretches of the path while that shortens it; `from` 1 keeps the start. */
function twoOpt(d: readonly number[][], path: number[], from: number): number[] {
  const order = [...path];
  for (let improved = true; improved;) {
    improved = false;
    for (let i = from; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        if (reversalGain(d, order, i, j) <= 1e-9) continue;
        order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
        improved = true;
      }
    }
  }
  return order;
}

/** Sum of the path's legs in the distance matrix. */
function matrixLength(d: readonly number[][], order: readonly number[]): number {
  return order.slice(1).reduce((sum, stop, k) => sum + d[order[k]!]![stop]!, 0);
}

/** The stop farthest from `from` (lowest index on ties). */
function farthestFrom(d: readonly number[][], from: number): number {
  return d[from]!.reduce((best, dist, i) => (dist > d[from]![best]! + 1e-9 ? i : best), from);
}

/**
 * Where a free-start path may begin: the first stop and the two ends of the selection's
 * longest stretch (a shortest open path usually starts at an extreme). Trying every stop
 * instead costs O(n) times more for little gain.
 */
function candidateStarts(d: readonly number[][]): number[] {
  const end = farthestFrom(d, 0);
  return [...new Set([0, end, farthestFrom(d, end)])];
}

/**
 * Near-shortest open path for routes longer than EXACT_ORDER_MAX_STOPS: nearest neighbour then
 * 2-opt, from the fixed start or (free start) from a few candidate starts, keeping the shortest.
 */
function approximateOpenPath(d: readonly number[][], start: number | null): number[] {
  const starts = start === null ? candidateStarts(d) : [start];
  let best: number[] = [];
  for (const s of starts) {
    const path = twoOpt(d, nearestNeighbourPath(d, s), start === null ? 0 : 1);
    if (best.length === 0 || matrixLength(d, path) < matrixLength(d, best) - 1e-9) best = path;
  }
  return start === null && best[best.length - 1]! < best[0]! ? best.reverse() : best;
}

/** Exact up to EXACT_ORDER_MAX_STOPS, approximate beyond. */
function openPath(d: readonly number[][], start: number | null): number[] {
  return d.length <= EXACT_ORDER_MAX_STOPS
    ? shortestOpenPath(d, start)
    : approximateOpenPath(d, start);
}

/**
 * Orders stops into the shortest open walking path (straight-line distance) that starts at the
 * first stop. Exact for up to EXACT_ORDER_MAX_STOPS stops, near-shortest beyond; deterministic.
 * @example optimizeOrder([hotel, castle, museum]) // [hotel, museum, castle]
 */
export function optimizeOrder<T extends RoutePoint>(points: readonly T[]): T[] {
  assertStopCount(points);
  return openPath(distanceMatrix(points), 0).map((i) => points[i]!);
}

/**
 * Shortest open walking path over the stops starting from whichever stop makes it shortest
 * (one exact pass, instead of optimising once per candidate start).
 * @example optimizeOrderAnyStart([mid, west, east]) // [west, mid, east]
 */
export function optimizeOrderAnyStart<T extends RoutePoint>(points: readonly T[]): T[] {
  assertStopCount(points);
  return openPath(distanceMatrix(points), null).map((i) => points[i]!);
}

export type RouteLeg = { fromId: string; toId: string; distanceM: number; durationS: number };

/** Straight-line legs scaled to an estimated street distance. */
export function estimateLegs(order: readonly RoutePoint[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 1; i < order.length; i++) {
    const distanceM = Math.round(estimateWalkingMeters(haversineMeters(order[i - 1]!, order[i]!)));
    legs.push({
      fromId: order[i - 1]!.id,
      toId: order[i]!.id,
      distanceM,
      durationS: walkingSeconds(distanceM),
    });
  }
  return legs;
}
