// The photos of a saved trip (D-092): expo-image keeps what it downloads in its disk cache, so
// prefetching the stops' photos is what makes them show with no connection.
import { Image } from 'expo-image';

import type { ImageCache } from './save-offline';

export class ExpoImageCache implements ImageCache {
  async prefetch(urls: string[]): Promise<void> {
    if (urls.length === 0) return;
    const all = await Image.prefetch(urls, 'disk');
    if (!all) throw new Error(`some of the ${urls.length} photos could not be downloaded`);
  }
}
