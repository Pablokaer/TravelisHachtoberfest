import {
  cheapestInsertion,
  orderFromBestStart,
  orderFromStart,
  ROUTE_MAX_STOPS,
  ROUTE_MIN_STOPS,
  splitRoute,
} from '@wayfarer/shared';
import { create } from 'zustand';

import type { AttractionSummary } from '@/features/destinations/api';

/**
 * What `toggle` did: the tray only holds one city and at most ROUTE_MAX_STOPS stops (D-030) — on
 * every account; the per-plan limit of D-047 was lifted (D-065).
 */
export type ToggleOutcome = 'added' | 'removed' | 'full' | 'startedNewCity';

type Stop = AttractionSummary;

type RouteState = {
  citySlug: string | null;
  /** Every selected stop, route after route (what the map and the tray count show). */
  stops: Stop[];
  /** The selection split into independent routes; one route until the user splits it. */
  routes: Stop[][];
  /** True once the user reorders by hand: new stops are then slotted in, not re-sorted. */
  manualOrder: boolean;
  /** Returns false when the tray is full or the stop belongs to another city. */
  add: (stop: Stop) => boolean;
  remove: (id: string) => void;
  /**
   * Adds or removes a stop. A stop from another city replaces the tray (new route); a full tray
   * is left unchanged.
   * @example const outcome = useRouteStore.getState().toggle(attraction); // 'added'
   */
  toggle: (stop: Stop) => ToggleOutcome;
  /** Moves a stop one place within its route; switches to manual order. */
  move: (id: string, direction: -1 | 1) => void;
  /**
   * Moves a stop to position `to` within its route (drag and drop); switches to manual order.
   * @example useRouteStore.getState().moveTo('a1', 0); // 'a1' becomes the route's start
   */
  moveTo: (id: string, to: number) => void;
  /** Back to the automatic (shortest-walk) order for every route. */
  autoOrder: () => void;
  /** Splits route `routeIndex` before its stop at `position` (both sides keep ≥ 2 stops). */
  splitAt: (routeIndex: number, position: number) => void;
  /** Replaces the routes with the suggested split into `parts` routes by proximity. */
  suggestSplit: (parts: number) => void;
  /** Joins every route back into one. */
  merge: () => void;
  /**
   * Replaces the tray with a suggested route (D-077), keeping its order: it already starts at the
   * stop nearest to the traveller. Stops beyond ROUTE_MAX_STOPS are dropped; an empty route does
   * nothing.
   * @example useRouteStore.getState().startRoute(suggested.stops);
   */
  startRoute: (stops: readonly Stop[]) => void;
  /** Applies a server-optimised order to one route. */
  setRouteOrder: (routeIndex: number, ids: string[]) => void;
  clear: () => void;
};

/** Re-orders a route for the shortest walk; the first route keeps the user's starting point. */
function orderRoute(route: readonly Stop[], routeIndex: number): Stop[] {
  return routeIndex === 0 ? orderFromStart(route) : orderFromBestStart(route);
}

function withRoutes(routes: Stop[][]): Pick<RouteState, 'routes' | 'stops'> {
  const kept = routes.filter((r) => r.length > 0);
  return { routes: kept, stops: kept.flat() };
}

/** The route (and position in it) where `stop` adds the least walking. */
function cheapestRoute(routes: readonly Stop[][], stop: Stop) {
  let best = { routeIndex: 0, index: 0, costM: Infinity };
  routes.forEach((route, routeIndex) => {
    const { index, costM } = cheapestInsertion(route, stop);
    if (costM < best.costM) best = { routeIndex, index, costM };
  });
  return best;
}

function insertStop(routes: readonly Stop[][], stop: Stop, manual: boolean): Stop[][] {
  if (routes.length === 0) return [[stop]];
  const { routeIndex, index } = cheapestRoute(routes, stop);
  return routes.map((route, i) => {
    if (i !== routeIndex) return route;
    const next = [...route.slice(0, index), stop, ...route.slice(index)];
    return manual ? next : orderRoute(next, i);
  });
}

/** Drops a stop; a split route left with one stop is folded into the nearest other route. */
function removeStop(routes: readonly Stop[][], id: string, manual: boolean): Stop[][] {
  const trimmed = routes
    .map((route) => route.filter((s) => s.id !== id))
    .filter((route) => route.length > 0);
  const lonely = trimmed.findIndex((r) => r.length < ROUTE_MIN_STOPS);
  if (trimmed.length < 2 || lonely < 0) {
    return manual ? trimmed : trimmed.map(orderRoute);
  }
  const [stop] = trimmed[lonely]!;
  const others = trimmed.filter((_, i) => i !== lonely);
  return insertStop(others, stop!, manual);
}

export const useRouteStore = create<RouteState>((set, get) => ({
  citySlug: null,
  stops: [],
  routes: [],
  manualOrder: false,
  add: (stop) => {
    const { stops, citySlug, routes, manualOrder } = get();
    if (stops.some((s) => s.id === stop.id)) return true;
    if (citySlug && citySlug !== stop.citySlug && stops.length > 0) return false;
    if (stops.length >= ROUTE_MAX_STOPS) return false;
    set({ citySlug: stop.citySlug, ...withRoutes(insertStop(routes, stop, manualOrder)) });
    return true;
  },
  toggle: (stop) => {
    const { stops, add, remove } = get();
    if (stops.some((s) => s.id === stop.id)) {
      remove(stop.id);
      return 'removed';
    }
    if (add(stop)) return 'added';
    if (stops.length >= ROUTE_MAX_STOPS) return 'full';
    set({ citySlug: stop.citySlug, manualOrder: false, ...withRoutes([[stop]]) });
    return 'startedNewCity';
  },
  remove: (id) =>
    set((s) => {
      const next = withRoutes(removeStop(s.routes, id, s.manualOrder));
      return next.stops.length ? next : { ...next, citySlug: null, manualOrder: false };
    }),
  move: (id, direction) => {
    const route = get().routes.find((r) => r.some((x) => x.id === id)) ?? [];
    get().moveTo(id, route.findIndex((x) => x.id === id) + direction);
  },
  moveTo: (id, to) =>
    set((s) => {
      const routeIndex = s.routes.findIndex((r) => r.some((x) => x.id === id));
      const route = [...(s.routes[routeIndex] ?? [])];
      const from = route.findIndex((x) => x.id === id);
      if (from < 0 || from === to || to < 0 || to >= route.length) return s;
      route.splice(to, 0, ...route.splice(from, 1));
      return {
        manualOrder: true,
        ...withRoutes(s.routes.map((r, k) => (k === routeIndex ? route : r))),
      };
    }),
  autoOrder: () => set((s) => ({ manualOrder: false, ...withRoutes(s.routes.map(orderRoute)) })),
  splitAt: (routeIndex, position) =>
    set((s) => {
      const route = s.routes[routeIndex];
      if (!route || position < ROUTE_MIN_STOPS || route.length - position < ROUTE_MIN_STOPS) {
        return s;
      }
      const halves = [route.slice(0, position), route.slice(position)];
      const routes = [
        ...s.routes.slice(0, routeIndex),
        ...halves,
        ...s.routes.slice(routeIndex + 1),
      ];
      return withRoutes(s.manualOrder ? routes : routes.map(orderRoute));
    }),
  suggestSplit: (parts) =>
    set((s) => ({ manualOrder: false, ...withRoutes(splitRoute(s.stops, parts)) })),
  merge: () => set((s) => withRoutes([s.manualOrder ? s.stops : orderFromStart(s.stops)])),
  startRoute: (stops) => {
    if (stops.length === 0) return;
    const kept = stops.slice(0, ROUTE_MAX_STOPS);
    set({ citySlug: kept[0]!.citySlug, manualOrder: false, ...withRoutes([kept]) });
  },
  setRouteOrder: (routeIndex, ids) =>
    set((s) => {
      const route = s.routes[routeIndex] ?? [];
      const ordered = ids.map((id) => route.find((x) => x.id === id)).filter((x): x is Stop => !!x);
      if (ordered.length !== route.length) return s;
      return withRoutes(s.routes.map((r, i) => (i === routeIndex ? ordered : r)));
    }),
  clear: () => set({ stops: [], routes: [], citySlug: null, manualOrder: false }),
}));
