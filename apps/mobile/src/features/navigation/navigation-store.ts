// Navigating a saved trip with the app open (D-086). It lives in a store, not in a screen, so it
// keeps following the traveller while they open an attraction to read about it and come back.
import {
  isOffRoute,
  stopAfterArrival,
  type LatLng,
  type LineString,
  type RoutePoint,
} from '@wayfarer/shared';
import { create } from 'zustand';

import type { PositionWatcher } from './position-watcher';

export type NavigationStatus = 'idle' | 'locating' | 'tracking' | 'finished' | 'denied' | 'error';

export type NavigationTrip = {
  id: string;
  stops: readonly RoutePoint[];
  geometry: LineString | null;
};

type NavigationState = {
  status: NavigationStatus;
  tripId: string | null;
  stops: readonly RoutePoint[];
  geometry: LineString | null;
  /** The stop being walked to; `stops.length` once the last one is reached. */
  index: number;
  position: LatLng | null;
  offRoute: boolean;
  message: string | null;
  start: (trip: NavigationTrip, watcher: PositionWatcher) => Promise<void>;
  stop: () => void;
  skip: () => void;
};

const IDLE = {
  status: 'idle' as NavigationStatus,
  tripId: null,
  stops: [] as readonly RoutePoint[],
  geometry: null,
  index: 0,
  position: null,
  offRoute: false,
  message: null,
};

/** Releases the current watch; the session number makes a late position from it harmless. */
let releaseWatch: (() => void) | null = null;
let session = 0;

function endWatch() {
  session += 1;
  releaseWatch?.();
  releaseWatch = null;
}

/**
 * @example await useNavigationStore.getState().start({ id, stops, geometry }, new ExpoPositionWatcher());
 */
export const useNavigationStore = create<NavigationState>((set, get) => {
  const follow = (position: LatLng) => {
    const { stops, geometry, index } = get();
    const next = stopAfterArrival(position, stops, index);
    set({
      position,
      index: next,
      offRoute: isOffRoute(position, geometry),
      status: next >= stops.length ? 'finished' : 'tracking',
    });
  };

  return {
    ...IDLE,
    async start(trip, watcher) {
      endWatch();
      const mine = session;
      set({
        ...IDLE,
        status: 'locating',
        tripId: trip.id,
        stops: trip.stops,
        geometry: trip.geometry,
      });
      const result = await watcher.watch((position) => {
        if (mine === session) follow(position);
      });
      if (mine !== session) {
        if (result.ok) result.stop();
        return;
      }
      if (!result.ok) {
        set({ ...IDLE, status: result.reason, message: result.message });
        return;
      }
      releaseWatch = result.stop;
      set({ status: 'tracking' });
    },
    stop() {
      endWatch();
      set({ ...IDLE });
    },
    skip() {
      const { index, stops } = get();
      const next = Math.min(index + 1, stops.length);
      set({ index: next, status: next >= stops.length ? 'finished' : get().status });
    },
  };
});
