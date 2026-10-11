// Starts and stops the in-app navigation of one trip (D-086) for the "Navigate in the app" button.
import { useMemo } from 'react';

import type { InAppNavigation } from '@/features/route/components';
import type { TripDetail } from '@/features/trips/api';
import { streetGeometryOf } from '@/features/trips/street-geometry';
import { useNavigationStore } from './navigation-store';
import { ExpoPositionWatcher, type PositionWatcher } from './position-watcher';

const defaultWatcher = new ExpoPositionWatcher();

/**
 * Not offered for a trip with fewer than two stops (nothing to walk between).
 * @example const navigation = useTripNavigation(trip); // { active, onStart, onStop }
 */
export function useTripNavigation(
  trip: Pick<TripDetail, 'id' | 'stops' | 'geometry' | 'isFallback'>,
  watcher: PositionWatcher = defaultWatcher,
): InAppNavigation {
  const active = useNavigationStore((s) => s.tripId === trip.id && s.status !== 'idle');
  return useMemo(
    () => ({
      active,
      onStart: () =>
        void useNavigationStore
          .getState()
          .start({ id: trip.id, stops: trip.stops, geometry: streetGeometryOf(trip) }, watcher),
      onStop: () => useNavigationStore.getState().stop(),
    }),
    [active, trip.id, trip.stops, trip.geometry, trip.isFallback, watcher],
  );
}
