// Map areas for offline use (D-092). The web has no equivalent of a native map pack, so there the
// map is only saved when the browser's own cache has it; the native version is map-pack.native.ts.
import type { MapPacks } from './save-offline';

export const defaultMapPacks: MapPacks = {
  download: async () => null,
  remove: async () => undefined,
};
