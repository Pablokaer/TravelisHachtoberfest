// Saving a trip for offline use from a screen (D-092): the copy on the device, and the two actions
// (save, remove) with the stage the download is in.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { fetchAttractionDetails } from '@/features/destinations/api';
import type { TripDetail } from '@/features/trips/api';
import { env } from '@/lib/env';
import { ExpoImageCache } from './image-cache';
import { offlineLibrary } from './library';
import { defaultMapPacks } from './map-pack';
import {
  removeTripOffline,
  saveTripOffline,
  type SaveDeps,
  type SaveResult,
  type SaveStage,
} from './save-offline';

export const offlineKeys = { all: ['offline'] as const, trip: (id: string) => ['offline', id] };

const defaultSaveDeps: SaveDeps = {
  library: offlineLibrary,
  fetchDetails: fetchAttractionDetails,
  images: new ExpoImageCache(),
  mapPacks: defaultMapPacks,
  styleUrl: env.mapStyleUrl,
  now: () => new Date().toISOString(),
};

export type SaveProgress = { stage: SaveStage; percent: number | null };

/** The copy of a trip saved on this device, if any. */
export function useOfflineCopy(tripId: string) {
  return useQuery({
    queryKey: offlineKeys.trip(tripId),
    staleTime: 0,
    queryFn: () => offlineLibrary.get(tripId),
  });
}

/**
 * @example const { copy, progress, save, remove } = useTripOffline(trip);
 */
export function useTripOffline(trip: TripDetail, deps: SaveDeps = defaultSaveDeps) {
  const queryClient = useQueryClient();
  const copy = useOfflineCopy(trip.id);
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  // The list of My Trips falls back to these copies, so it changes with them.
  const refresh = () => queryClient.invalidateQueries({ queryKey: offlineKeys.all });
  const save = useMutation<SaveResult, Error>({
    mutationFn: () =>
      saveTripOffline(
        trip,
        deps,
        (stage) => setProgress({ stage, percent: null }),
        (percent) => setProgress({ stage: 'map', percent }),
      ),
    onSettled: () => {
      setProgress(null);
      return refresh();
    },
  });
  const remove = useMutation<void, Error>({
    mutationFn: () => removeTripOffline(trip.id, deps),
    onSettled: refresh,
  });
  return { copy: copy.data ?? null, progress, save, remove };
}
