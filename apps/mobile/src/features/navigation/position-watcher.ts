// The traveller's live position while navigating in the app (D-086). The device's location
// service sits behind PositionWatcher so tests drive a fake one and this file holds the only
// watching expo-location import (the one-shot position of suggested routes is in
// features/suggested/location.ts).
import type { LatLng } from '@wayfarer/shared';
import * as Location from 'expo-location';

export type PositionListener = (position: LatLng) => void;

export type WatchResult =
  { ok: true; stop: () => void } | { ok: false; reason: 'denied' | 'error'; message: string };

export interface PositionWatcher {
  /** Starts reporting positions to `onPosition`; never throws, a refusal is a result. */
  watch(onPosition: PositionListener): Promise<WatchResult>;
}

/** Walking pace: a fix every few seconds or every few metres is plenty and spares the battery. */
const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 3000,
  distanceInterval: 5,
};

/**
 * expo-location, foreground only (the app stays open while navigating).
 * @example const result = await new ExpoPositionWatcher().watch((p) => console.log(p));
 */
export class ExpoPositionWatcher implements PositionWatcher {
  async watch(onPosition: PositionListener): Promise<WatchResult> {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        return { ok: false, reason: 'denied', message: 'Location permission was not granted' };
      }
      const subscription = await Location.watchPositionAsync(WATCH_OPTIONS, ({ coords }) =>
        onPosition({ lat: coords.latitude, lng: coords.longitude }),
      );
      return { ok: true, stop: () => subscription.remove() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: 'error', message };
    }
  }
}
