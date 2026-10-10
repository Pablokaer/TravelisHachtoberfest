// Route planning on top of optimizeOrder: keep the selection in walking order as stops are
// added, and split a long route into several balanced ones (D-022, D-023).
import {
  ROUTE_MAX_SPLIT_PARTS,
  ROUTE_MIN_STOPS,
  WALKING_SPEED_M_PER_S,
} from '../constants/index.ts';
import { haversineMeters } from './geo.ts';
import { optimizeOrder, optimizeOrderAnyStart, pathLength, type RoutePoint } from './route.ts';

/**
 * Orders an open path from its first stop; paths of 0–1 stops are returned as they are.
 * @example orderFromStart([home, far, near]) // [home, near, far]
 */
export function orderFromStart<T extends RoutePoint>(points: readonly T[]): T[] {
  return points.length < ROUTE_MIN_STOPS ? [...points] : optimizeOrder(points);
}

/**
 * Shortest open path over `points` from whichever stop makes it shortest (for a route that has
 * no user-chosen starting point, e.g. the second half of a split); 0–1 stops are returned as is.
 * @example orderFromBestStart([a, b, c]).map((p) => p.id)
 */
export function orderFromBestStart<T extends RoutePoint>(points: readonly T[]): T[] {
  return points.length < ROUTE_MIN_STOPS ? [...points] : optimizeOrderAnyStart(points);
}

/** Extra metres walked when `point` is inserted at `index` of the open path `order`. */
function insertionCost(order: readonly RoutePoint[], point: RoutePoint, index: number): number {
  const before = order[index - 1]!;
  const after = order[index];
  if (!after) return haversineMeters(before, point);
  return (
    haversineMeters(before, point) + haversineMeters(point, after) - haversineMeters(before, after)
  );
}

/**
 * Where `point` adds the least walking to `order` (index ≥ 1: the start never moves), with
 * the cost in metres. An empty path accepts the point at 0.
 * @example cheapestInsertion([a, c], b) // { index: 1, costM: 120 }
 */
export function cheapestInsertion(
  order: readonly RoutePoint[],
  point: RoutePoint,
): { index: number; costM: number } {
  if (order.length === 0) return { index: 0, costM: 0 };
  let best = { index: order.length, costM: insertionCost(order, point, order.length) };
  for (let index = 1; index < order.length; index++) {
    const costM = insertionCost(order, point, index);
    if (costM < best.costM - 1e-6) best = { index, costM };
  }
  return best;
}

/** Total straight-line length of several routes, in metres. */
export function routesLength(routes: readonly (readonly RoutePoint[])[]): number {
  return routes.reduce((sum, route) => sum + pathLength(route), 0);
}

/** A stop that may carry its own visit time (attractions do); plain points use a default. */
export type SplitPoint = RoutePoint & { avgVisitMinutes?: number };

/** Visit time assumed for a stop without one, in minutes. */
const DEFAULT_VISIT_MINUTES = 30;

/**
 * Minutes of split score per minute of imbalance: 0.5 means a route may be up to twice as long
 * in time before splitting it saves more than it costs in extra walking (D-023).
 */
export const SPLIT_BALANCE_WEIGHT = 0.5;

/** Straight-line walking time of an open path, in minutes. */
function walkMinutes(route: readonly RoutePoint[]): number {
  return pathLength(route) / (WALKING_SPEED_M_PER_S * 60);
}

/** A route's time budget: visits plus walking, in minutes (a proxy for "one day out"). */
function routeMinutes(route: readonly SplitPoint[]): number {
  const visits = route.reduce((sum, p) => sum + (p.avgVisitMinutes ?? DEFAULT_VISIT_MINUTES), 0);
  return visits + walkMinutes(route);
}

/**
 * Score of a split, lower is better: total walking minutes plus SPLIT_BALANCE_WEIGHT × the
 * sum of each route's distance (in minutes) from the average route time. Short walks and
 * routes of similar length (visits + walking) both lower it.
 * @example splitCost([[a, b], [c, d]]) // 42.5
 */
export function splitCost(routes: readonly (readonly SplitPoint[])[]): number {
  const times = routes.map(routeMinutes);
  const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
  const imbalance = times.reduce((sum, t) => sum + Math.abs(t - mean), 0);
  const walking = routes.reduce((sum, r) => sum + walkMinutes(r), 0);
  return walking + SPLIT_BALANCE_WEIGHT * imbalance;
}

/** Re-orders one group: the first keeps the route's start, the others pick their best start. */
function orderGroup<T extends RoutePoint>(group: readonly T[], index: number): T[] {
  return index === 0 ? orderFromStart(group) : orderFromBestStart(group);
}

/**
 * Work caps that keep "Suggest a split" interactive for long routes (D-030): how many
 * contiguous cuts are scored, and how many neighbouring splits the hill climb may evaluate.
 * Both are counts, not time limits, so the result stays deterministic.
 */
const CUT_BUDGET = 20_000;
const NEIGHBOUR_BUDGET = 1_500;

/** Number of ways to cut `length` items into `parts` groups of ≥ `min` (a binomial). */
function cutCount(length: number, parts: number, min: number): number {
  const free = length - min * parts;
  let count = 1;
  for (let k = 1; k < parts; k++) count = (count * (free + k)) / k;
  return count;
}

/**
 * How far each cut may stray from an even split: unlimited while every way of cutting fits in
 * CUT_BUDGET, otherwise the widest window whose combinations do.
 */
function cutWindow(length: number, parts: number, min: number): number {
  if (cutCount(length, parts, min) <= CUT_BUDGET) return Infinity;
  return Math.max(0, Math.floor((Math.pow(CUT_BUDGET, 1 / (parts - 1)) - 1) / 2));
}

/** Ways to cut `length` items into `parts` contiguous groups of ≥ `min` (group starts). */
function contiguousCuts(length: number, parts: number, min: number): number[][] {
  if (parts === 1) return [[]];
  const window = cutWindow(length, parts, min);
  const all: number[][] = [];
  const walk = (from: number, left: number, cuts: number[]) => {
    if (left === 0) return void all.push(cuts);
    const even = Math.round((length * cuts.length + length) / parts);
    const lo = Math.max(from + min, even - window);
    const hi = Math.min(length - min * left, even + window);
    for (let cut = lo; cut <= hi; cut++) walk(cut, left - 1, [...cuts, cut]);
  };
  walk(0, parts - 1, []);
  return all;
}

/** The best split into contiguous stretches of the walking order (a strong starting point). */
function bestContiguousSplit<T extends SplitPoint>(path: readonly T[], parts: number, min: number) {
  const ordered = new Map<string, T[]>();
  const group = (from: number, to: number, index: number) => {
    const key = `${from}:${to}:${index === 0}`;
    if (!ordered.has(key)) ordered.set(key, orderGroup(path.slice(from, to), index));
    return ordered.get(key)!;
  };
  let best: T[][] = [];
  let bestCost = Infinity;
  for (const cuts of contiguousCuts(path.length, parts, min)) {
    const bounds = [0, ...cuts, path.length];
    const groups = bounds.slice(1).map((end, i) => group(bounds[i]!, end, i));
    const cost = splitCost(groups);
    if (cost < bestCost - 1e-9) [best, bestCost] = [groups, cost];
  }
  return best;
}

/** Groups after moving stop `index` of group `from` to group `to` (both re-ordered). */
function withMove<T extends SplitPoint>(groups: T[][], from: number, index: number, to: number) {
  const next = [...groups];
  const point = groups[from]![index]!;
  next[from] = orderGroup(
    groups[from]!.filter((_, i) => i !== index),
    from,
  );
  next[to] = orderGroup([...groups[to]!, point], to);
  return next;
}

/** Groups after swapping stop `i` of group `a` with stop `j` of group `b` (both re-ordered). */
function withSwap<T extends SplitPoint>(groups: T[][], a: number, i: number, b: number, j: number) {
  const next = [...groups];
  const [pa, pb] = [groups[a]![i]!, groups[b]![j]!];
  next[a] = orderGroup([...groups[a]!.filter((_, k) => k !== i), pb], a);
  next[b] = orderGroup([...groups[b]!.filter((_, k) => k !== j), pa], b);
  return next;
}

/** Every split one move or one swap away; the first route's start never leaves it. */
function neighbours<T extends SplitPoint>(groups: T[][], min: number): T[][][] {
  const out: T[][][] = [];
  const movable = (g: number, i: number) => !(g === 0 && i === 0);
  groups.forEach((group, a) =>
    group.forEach((_, i) => {
      if (!movable(a, i)) return;
      groups.forEach((other, b) => {
        if (b === a) return;
        if (group.length > min) out.push(withMove(groups, a, i, b));
        if (b > a)
          other.forEach((__, j) => movable(b, j) && out.push(withSwap(groups, a, i, b, j)));
      });
    }),
  );
  return out;
}

/** Hill-climbs from `groups`, taking the best move or swap while it lowers the split score. */
function improveSplit<T extends SplitPoint>(groups: T[][], min: number): T[][] {
  let current = groups;
  let cost = splitCost(current);
  let evaluated = 0;
  // Each step lowers the score by > 0.01, so this terminates; the caps bound long routes.
  for (let step = 0; step < 200 && evaluated < NEIGHBOUR_BUDGET; step++) {
    const candidates = neighbours(current, min);
    evaluated += candidates.length;
    const best = candidates.reduce<{ groups: T[][]; cost: number } | null>((acc, candidate) => {
      const c = splitCost(candidate);
      return c < (acc?.cost ?? cost - 0.01) ? { groups: candidate, cost: c } : acc;
    }, null);
    if (!best) break;
    [current, cost] = [best.groups, best.cost];
  }
  return current;
}

/**
 * Splits a route into `parts` routes of ≥ `min` stops each, balancing two goals (D-023):
 * short walks (nearby places stay together) and routes of similar length in time — visits plus
 * walking — so each can fill a day or a part of the trip. Starts from the best contiguous cuts of
 * the walking order, then moves and swaps stops between routes while `splitCost` drops. The
 * first route keeps the original start. Deterministic; well under a second for 20 stops.
 * @example splitRoute(stops, 2) // [[start, …], […]]
 */
export function splitRoute<T extends SplitPoint>(
  order: readonly T[],
  parts: number,
  min: number = ROUTE_MIN_STOPS,
): T[][] {
  if (!Number.isInteger(parts) || parts < 2 || parts * min > order.length) {
    throw new RangeError(
      `cannot split ${order.length} stops into ${parts} routes of at least ${min} stops`,
    );
  }
  const path = orderFromStart(order);
  return improveSplit(bestContiguousSplit(path, parts, min), min);
}

/** Largest number of routes `stopCount` stops can be split into (at most ROUTE_MAX_SPLIT_PARTS). */
export function maxRouteParts(stopCount: number, min: number = ROUTE_MIN_STOPS): number {
  return Math.min(Math.floor(stopCount / min), ROUTE_MAX_SPLIT_PARTS);
}
