// Drag and drop for the route's stop list, next to the move up / move down buttons.
// Built on the core PanResponder (not react-native-gesture-handler) so it works on web, iOS and
// Android without a GestureHandlerRootView at the app root.
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

import { Icon } from '@/components/icon';
import { MIN_TOUCH } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** A row's vertical box inside the list, as reported by onLayout. */
export type RowBox = { y: number; height: number };

/** The row being dragged and how far the pointer has moved since the drag started. */
export type StopDragState = { from: number; dy: number };

/** What the list renders from: the dragged row and the slot it currently hovers over. */
type DragSlot = { from: number; target: number };

/**
 * Where a row dragged by `dy` lands: the number of other rows whose centre is above its centre.
 * @example dropIndex([{ y: 0, height: 60 }, { y: 70, height: 60 }], 0, 50); // 1
 */
export function dropIndex(rows: readonly RowBox[], from: number, dy: number): number {
  const dragged = rows[from];
  if (!dragged) return from;
  const centre = dragged.y + dragged.height / 2 + dy;
  return rows.filter((r, k) => k !== from && r.y + r.height / 2 < centre).length;
}

/**
 * Vertical offset of row `index` while the row at `from` hovers over position `to`: the rows in
 * between slide by the dragged row's height (plus the list gap) to open a slot for it.
 * @example rowShift(1, 0, 2, 60, 4); // -64 — row 1 moves up to make room below it
 */
export function rowShift(index: number, from: number, to: number, height: number, gap: number) {
  if (index > from && index <= to) return -(height + gap);
  if (index < from && index >= to) return height + gap;
  return 0;
}

/** The callbacks a DragHandle reports its gesture to. */
export type DragGesture = {
  onDragMove: (state: StopDragState) => void;
  onDragEnd: (from: number, dy: number) => void;
  /** The gesture was taken away (e.g. by the system): nothing moves. */
  onDragCancel: () => void;
};

/** Row boxes reported by onLayout, one per row index. */
function useRowBoxes(count: number) {
  const [measured, setMeasured] = useState<RowBox[]>([]);
  const measure = (index: number) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    setMeasured((prev) => Object.assign([...prev], { [index]: { y, height } }));
  };
  // Boxes past the end belong to stops that were removed; they must not count as drop slots.
  return { rows: measured.slice(0, count), measure };
}

/**
 * Drag and drop for one list of `count` rows separated by `gap`: measures the rows, moves the
 * dragged one with the pointer, slides the others to open a slot and reports the drop. The
 * pointer offset lives in an Animated.Value, so the list only re-renders when the hovered slot
 * changes, not on every pointer move.
 * @example const drag = useStopDrag(route.length, 4, (from, to) => moveTo(route[from].id, to));
 */
export function useStopDrag(
  count: number,
  gap: number,
  onDrop: (from: number, to: number) => void,
  onActive?: (active: boolean) => void,
) {
  const { rows, measure } = useRowBoxes(count);
  const [slot, setSlot] = useState<DragSlot | null>(null);
  const [dy] = useState(() => new Animated.Value(0));
  const stop = () => {
    onActive?.(false);
    setSlot(null);
    dy.setValue(0);
  };
  const gesture: DragGesture = {
    onDragMove: ({ from, dy: offset }) => {
      dy.setValue(offset);
      const target = dropIndex(rows, from, offset);
      // Same slot: skip setState, which can still cost a render even when the value is unchanged.
      if (slot?.from === from && slot.target === target) return;
      if (!slot) onActive?.(true);
      setSlot({ from, target });
    },
    onDragEnd: (from, offset) => {
      stop();
      const to = dropIndex(rows, from, offset);
      if (to !== from) onDrop(from, to);
    },
    onDragCancel: stop,
  };
  const offsetOf = (index: number): Animated.Value | number => {
    if (!slot) return 0;
    if (index === slot.from) return dy;
    return rowShift(index, slot.from, slot.target, rows[slot.from]?.height ?? 0, gap);
  };
  return { measure, offsetOf, isDragged: (index: number) => slot?.from === index, gesture };
}

type DragHandleProps = DragGesture & { index: number; accessibilityLabel: string };

/** Pan gestures on the grip; every callback reads the handle's current props from `latest`. */
function createDragResponder(latest: RefObject<DragHandleProps>) {
  const current = () => latest.current;
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => current().onDragMove({ from: current().index, dy: 0 }),
    onPanResponderMove: (_, g) => current().onDragMove({ from: current().index, dy: g.dy }),
    onPanResponderRelease: (_, g) => current().onDragEnd(current().index, g.dy),
    onPanResponderTerminate: () => current().onDragCancel(),
  });
}

/** The grip a stop is dragged by; claims the gesture so the page doesn't scroll instead. */
export function DragHandle(props: DragHandleProps) {
  const theme = useTheme();
  // The responder is created once; its callbacks read the latest props (index changes after a drop).
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  // eslint-disable-next-line react-hooks/refs -- the ref is only read inside gesture callbacks
  const [responder] = useState(() => createDragResponder(latest));
  return (
    <View
      {...responder.panHandlers}
      accessibilityLabel={props.accessibilityLabel}
      testID={`drag-stop-${props.index}`}
      style={[styles.handle, webGrab]}>
      <Icon name="dragHandle" size={20} color={theme.textSecondary} />
    </View>
  );
}

// Web: a grab cursor, and touch screens neither scroll the page nor select text on the grip.
const webGrab =
  Platform.OS === 'web'
    ? ({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle)
    : null;

const styles = StyleSheet.create({
  handle: {
    width: MIN_TOUCH - 8,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
