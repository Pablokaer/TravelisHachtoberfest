// The traveller's position for suggested routes (D-077). The device's location service sits
// behind LocationSource so tests use a fake and the app owns the only expo-location import.
import type { LatLng } from '@wayfarer/shared';
import * as Location from 'expo-location';

/** Answers with the current position, or null when the traveller has not allowed it. */
export interface LocationSource {
  /** `askPermission` false only reads a permission already given (no prompt). */
  requestPosition(askPermission: boolean): Promise<LatLng | null>;
}

export type PositionResult =
  | { status: 'found'; position: LatLng }
  | { status: 'denied' }
  | { status: 'error'; message: string };

/** expo-location: foreground permission only, city-block accuracy is plenty to pick a route. */
export class ExpoLocationSource implements LocationSource {
  async requestPosition(askPermission: boolean): Promise<LatLng | null> {
    const current = await Location.getForegroundPermissionsAsync();
    const granted = current.granted || (askPermission && (await this.ask()));
    if (!granted) return null;
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: coords.latitude, lng: coords.longitude };
  }

  private async ask(): Promise<boolean> {
    return (await Location.requestForegroundPermissionsAsync()).granted;
  }
}

/**
 * Asks `source` for the position and never throws: a refusal or a failing GPS is a result.
 * @example const result = await findUserPosition(new ExpoLocationSource(), true);
 */
export async function findUserPosition(
  source: LocationSource,
  askPermission: boolean,
): Promise<PositionResult> {
  try {
    const position = await source.requestPosition(askPermission);
    return position ? { status: 'found', position } : { status: 'denied' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', message };
  }
}
