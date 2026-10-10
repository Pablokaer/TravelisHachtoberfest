// A place on the map as a small round photo (D-029), like Google Maps: the attraction's own
// image in a white ring, larger and ringed in the accent when selected, with its stop number
// when it is in the route. Rendered inside the map library's native marker on web and native.
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Thumbnail } from '@/features/destinations/thumbnail';
import { palette } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

/** Diameters in px: small enough for dense areas, larger for the selected place. */
export const MARKER_SIZE = 36;
export const MARKER_SELECTED_SIZE = 48;

type Props = {
  imageUrl: string | null;
  name: string;
  selected?: boolean;
  /** 1-based stop number when the place is in the route. */
  order?: number;
};

function StopNumber({ order }: { order: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.stop, { backgroundColor: theme.primary }]}>
      <Text variant="helper" style={{ color: theme.onPrimary, fontWeight: '700' }}>
        {order}
      </Text>
    </View>
  );
}

/**
 * Round photo marker; decorative for assistive tech (the marker itself carries the name).
 * @example <PhotoMarker imageUrl={a.imageUrl} name="Rijksmuseum" selected order={2} />
 */
export function PhotoMarker({ imageUrl, selected, order }: Props) {
  const theme = useTheme();
  const shadows = useShadows();
  const size = selected ? MARKER_SELECTED_SIZE : MARKER_SIZE;
  const ring = selected ? `0 0 0 2px ${theme.primary}, ${shadows.raised}` : shadows.floating;
  return (
    <View aria-hidden style={styles.wrap}>
      <View
        testID="photo-marker"
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, boxShadow: ring },
          selected && styles.circleSelected,
        ]}>
        <Thumbnail
          uri={imageUrl}
          // The circle's own size: the 60 px Commons thumbnail up to 2× screens, 120 px on 3×
          // ones and for the selected marker (D-050, D-062).
          width={size}
          style={styles.photo}
          iconSize={Math.round(size * 0.45)}
          testID="photo-marker-image"
        />
      </View>
      {order != null ? <StopNumber order={order} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 4 },
  // The ring is white in both themes: it separates the photo from any map colour.
  circle: { borderWidth: 2, borderColor: palette.light.surface, overflow: 'hidden' },
  circleSelected: { borderWidth: 3 },
  photo: { width: '100%', height: '100%' },
  stop: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.light.surface,
  },
});
