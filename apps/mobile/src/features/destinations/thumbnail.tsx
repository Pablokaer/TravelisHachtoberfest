// Attraction photos: the image, its placeholder when there is none, and small thumbnails.
import { Image } from 'expo-image';
import { useState } from 'react';
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Icon } from '@/components/icon';
import { useTheme } from '@/theme/use-theme';

// Commons thumbnail URLs end in /<width>px-<file>; the pipeline stores the 960 px one.
const COMMONS_THUMB = /^(https:\/\/[^/]*wikimedia\.org\/.+\/thumb\/.+\/)\d+px-([^/?]+)/;

/**
 * Widths Commons keeps ready in its thumbnail cache (other widths are rendered on demand); 960 px
 * is the stored one, so nothing larger is ever asked for. 60 px is one of those standard widths
 * too: a 36 px map marker on a 1×/2× screen takes it (~3.5 kB vs ~8.5 kB for 120 px, so a city's
 * 300 markers load ~1.0 MiB instead of ~2.5 MiB; D-050, D-062).
 */
export const COMMONS_THUMB_WIDTHS = [60, 120, 250, 330, 500, 960] as const;

/**
 * Share of a box's physical pixels its thumbnail must cover. 0.8 lets a 282 px card on a 2×
 * screen take the 500 px thumbnail (~85 kB) instead of the 960 px one (~300 kB, measured on
 * Berlin's photos), a difference a photo does not show.
 */
const PIXEL_COVERAGE = 0.8;

/**
 * The same Wikimedia Commons photo at a smaller standard width (map markers load dozens at
 * once); other URLs are returned unchanged.
 * @example thumbnailUrl('…/thumb/b/b5/X.jpg/960px-X.jpg', 120) // '…/thumb/b/b5/X.jpg/120px-X.jpg'
 */
export function thumbnailUrl(url: string | null, width: number): string | null {
  if (!url) return null;
  return url.replace(COMMONS_THUMB, `$1${width}px-$2`);
}

/**
 * The Commons thumbnail width for a box `layoutWidth` points wide on a `pixelRatio` screen.
 * @example thumbnailWidthFor(64, 3) // 250
 */
export function thumbnailWidthFor(layoutWidth: number, pixelRatio: number): number {
  const needed = layoutWidth * pixelRatio * PIXEL_COVERAGE;
  return COMMONS_THUMB_WIDTHS.find((width) => width >= needed) ?? 960;
}

/** The box's width: the one given, else its layout width once measured (null until then). */
function useBoxWidth(known: number | undefined) {
  const [measured, setMeasured] = useState<number | null>(null);
  const onLayout =
    known == null ? (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width) : undefined;
  return { width: known ?? measured, onLayout };
}

/**
 * Photo, or a neutral placeholder with a photo glyph when there is none. The photo is loaded at
 * the Commons width the box needs (D-050): pass `width` when the box size is fixed, otherwise
 * the box is measured first.
 * @example <Thumbnail uri={place.imageUrl} width={64} style={{ width: 64, height: 64 }} />
 */
export function Thumbnail({
  uri,
  style,
  iconSize = 28,
  testID,
  width,
}: {
  uri: string | null;
  style: object;
  iconSize?: number;
  testID?: string;
  /** Display width in points, when known up front (rows, markers, suggestions). */
  width?: number;
}) {
  const box = useBoxWidth(width);
  if (!uri) return <PhotoPlaceholder style={style} iconSize={iconSize} testID={testID} />;
  const source =
    box.width == null ? null : thumbnailUrl(uri, thumbnailWidthFor(box.width, PixelRatio.get()));
  return (
    <Image
      source={source}
      style={style}
      contentFit="cover"
      accessible={false}
      transition={200}
      testID={testID}
      onLayout={box.onLayout}
    />
  );
}

function PhotoPlaceholder({
  style,
  iconSize,
  testID,
}: {
  style: object;
  iconSize: number;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[style, styles.placeholder, { backgroundColor: theme.surfaceMuted }]}
      testID={testID && `${testID}-placeholder`}>
      <Icon name="photo" size={iconSize} color={theme.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
