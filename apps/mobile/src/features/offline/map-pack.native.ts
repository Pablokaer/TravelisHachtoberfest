// Native map areas for offline use (D-092): a MapLibre offline pack of the route's box, from the
// overview zoom down to street level. The download runs in the background of the native module;
// this resolves when it is complete, or fails on an error or after PACK_TIMEOUT_MS.
import { OfflineManager } from '@maplibre/maplibre-react-native';

import type { MapPackRequest, MapPacks } from './save-offline';

const MIN_ZOOM = 10;
const MAX_ZOOM = 16;
/** A route's box is a few hundred tiles: a pack that is not done in this long is not going to be. */
export const PACK_TIMEOUT_MS = 5 * 60 * 1000;

export class MapLibreMapPacks implements MapPacks {
  async download(
    request: MapPackRequest,
    onPercent?: (percent: number) => void,
  ): Promise<string | null> {
    return await new Promise<string | null>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`map area not complete after ${PACK_TIMEOUT_MS / 1000}s`)),
        PACK_TIMEOUT_MS,
      );
      const done = (finish: () => void) => {
        clearTimeout(timer);
        finish();
      };
      OfflineManager.createPack(
        {
          mapStyle: request.styleUrl,
          bounds: request.bounds,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          metadata: { tripId: request.tripId },
        },
        (pack, status) => {
          onPercent?.(status.percentage);
          if (status.state === 'complete') done(() => resolve(pack.id));
        },
        (_pack, error) => done(() => reject(new Error(error.message))),
      ).catch((error: unknown) => done(() => reject(error)));
    });
  }

  async remove(packId: string): Promise<void> {
    await OfflineManager.deletePack(packId);
  }
}

export const defaultMapPacks: MapPacks = new MapLibreMapPacks();
