import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/colors';
import { gridColumns, gridItemWidth } from '@/theme/grid';

const GRID_GAP = spacing.lg;

type Props<T> = {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactElement;
  /** Items stay at least this wide; the column count follows the grid's own width. */
  minItemWidth?: number;
  testID?: string;
};

/**
 * A grid for content inside a scrolling page (no nested list): as many columns of at least
 * `minItemWidth` as fit (one on phones, several on desktop), wrapping into rows, never wider
 * than the page.
 * @example <WrapGrid items={lists} keyOf={(l) => l.id} renderItem={(l) => <TripCard trip={l} … />} />
 */
export function WrapGrid<T>({ items, keyOf, renderItem, minItemWidth = 280, testID }: Props<T>) {
  const [width, setWidth] = useState(0);
  const columns = gridColumns(width, minItemWidth, GRID_GAP, 3);
  const itemWidth = width ? gridItemWidth(width, columns, GRID_GAP) : undefined;
  return (
    <View
      testID={testID}
      style={styles.grid}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {items.map((item) => (
        <View key={keyOf(item)} style={itemWidth ? { width: itemWidth } : styles.full}>
          {renderItem(item)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  full: { width: '100%' },
});
