import { useState, type ReactElement } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/colors';
import { gridColumns, gridItemWidth } from '@/theme/grid';

const GRID_GAP = spacing.lg;
/** Cards stay at least this wide; the column count follows the space the grid really has. */
const CARD_MIN_WIDTH = 240;
/**
 * Screens of cards kept rendered around the visible one (FlatList's default is 21). Image cards
 * are heavy: 7 keeps scrolling smooth with far fewer mounted cards (D-062).
 */
const GRID_WINDOW_SIZE = 7;

type Props<T> = {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderCard: (item: T) => ReactElement;
  /** Above the first row (e.g. "269 places"). */
  header: ReactElement;
  empty: ReactElement;
  /** After the last row (e.g. "Load more"). */
  footer?: ReactElement | null;
  /** Content width of the page container (without the gutter), shared with the header. */
  maxWidth: number;
  gutter: number;
  testID?: string;
};

/**
 * Responsive grid of image cards (D-024): as many ≥ 240 px columns as its own width fits, 24 px
 * between columns and 32 px between rows, centred in the page container.
 * @example <CardGrid items={cities} keyOf={(c) => c.slug} renderCard={(c) => <CityCard city={c} />} … />
 */
export function CardGrid<T>(props: Props<T>) {
  const [width, setWidth] = useState(0);
  const gridWidth = Math.min(width, props.maxWidth + props.gutter * 2) - props.gutter * 2;
  const columns = gridColumns(gridWidth, CARD_MIN_WIDTH, GRID_GAP);
  const itemWidth = width ? gridItemWidth(gridWidth, columns, GRID_GAP) : undefined;
  return (
    <FlatList
      key={columns}
      testID={props.testID}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      data={props.items}
      keyExtractor={props.keyOf}
      numColumns={columns}
      windowSize={GRID_WINDOW_SIZE}
      // Detaches off-screen cards from the native view tree; the web has no such views.
      removeClippedSubviews={Platform.OS !== 'web'}
      columnWrapperStyle={columns > 1 ? { gap: GRID_GAP } : undefined}
      contentContainerStyle={[
        styles.content,
        { maxWidth: props.maxWidth + props.gutter * 2, paddingHorizontal: props.gutter },
      ]}
      ItemSeparatorComponent={RowGap}
      ListHeaderComponentStyle={styles.header}
      ListHeaderComponent={props.header}
      renderItem={({ item }) => (
        <View style={itemWidth ? { width: itemWidth } : styles.flex}>{props.renderCard(item)}</View>
      )}
      ListEmptyComponent={props.empty}
      ListFooterComponent={props.footer}
      ListFooterComponentStyle={styles.footer}
    />
  );
}

/** Vertical space between card rows (FlatList puts it between rows, not after the header). */
function RowGap() {
  return <View style={styles.rowGap} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Bottom room for floating controls (Map/List switch, route tray).
  content: { width: '100%', alignSelf: 'center', paddingTop: spacing.lg, paddingBottom: 160 },
  header: { marginBottom: spacing.md },
  footer: { marginTop: spacing.lg, alignItems: 'center' },
  rowGap: { height: spacing.xl },
});
