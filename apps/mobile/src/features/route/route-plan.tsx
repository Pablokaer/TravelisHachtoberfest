// Route screen building blocks for ordering and splitting the selection (D-022).
import {
  estimateLegs,
  maxRouteParts,
  ROUTE_MIN_STOPS,
  ROUTE_SPLIT_MIN_STOPS,
  type Units,
  type RouteLeg,
} from '@wayfarer/shared';
import { useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, IconButton } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import type { AttractionSummary } from '@/features/destinations/api';
import { localizedName } from '@/features/destinations/api';
import { AttractionRow } from '@/features/destinations/components';
import { formatDistance, formatDuration } from '@/lib/format';
import { useRouteColor } from '@/features/route/route-colors';
import { DragHandle, useStopDrag, type DragGesture } from '@/features/route/stop-drag';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type Stop = AttractionSummary;

/** True when the route can be cut before `position` leaving ≥ ROUTE_MIN_STOPS on each side. */
export function canSplitBefore(route: readonly Stop[], position: number): boolean {
  return position >= ROUTE_MIN_STOPS && route.length - position >= ROUTE_MIN_STOPS;
}

function RouteHeading({ routeIndex, stopCount }: { routeIndex: number; stopCount: number }) {
  const { t } = useTranslation();
  const colorOf = useRouteColor();
  return (
    <View style={styles.heading} testID={`route-heading-${routeIndex}`}>
      <View style={[styles.swatch, { backgroundColor: colorOf(routeIndex) }]} />
      <Text variant="heading">{t('route.routeN', { n: routeIndex + 1 })}</Text>
      <Text variant="caption" secondary>
        {t('route.routeStops', { count: stopCount })}
      </Text>
    </View>
  );
}

/**
 * The walk to the next stop — along the streets once the route is computed (D-046), else a
 * straight-line estimate — with a "Split here" action when the cut is allowed.
 */
function LegConnector({
  from,
  to,
  units,
  street,
  onSplit,
}: {
  from: Stop;
  to: Stop;
  units: Units;
  /** The computed walking leg, when the route is known for this order. */
  street?: RouteLeg;
  onSplit?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const lang = i18n.resolvedLanguage ?? 'en';
  const [leg] = estimateLegs([from, to]);
  const label = street
    ? t('route.legWalk', {
        distance: formatDistance(street.distanceM, units, lang),
        duration: formatDuration(street.durationS),
      })
    : t('route.legEstimate', { distance: formatDistance(leg!.distanceM, units, lang) });
  return (
    <View style={styles.connector}>
      <View style={[styles.rail, { backgroundColor: theme.borderStrong }]} />
      <Icon name="walk" size={14} color={theme.textSecondary} />
      <Text variant="helper" secondary style={styles.flex}>
        {label}
      </Text>
      {onSplit ? (
        <Button
          compact
          variant="ghost"
          icon="split"
          label={t('route.splitHere')}
          accessibilityLabel={t('route.splitHereLabel', { name: localizedName(to, lang) })}
          onPress={onSplit}
        />
      ) : null}
    </View>
  );
}

function StopActions({
  stop,
  index,
  isLast,
  onMove,
  onRemove,
  gesture,
}: {
  stop: Stop;
  index: number;
  isLast: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  gesture: DragGesture;
}) {
  const { t, i18n } = useTranslation();
  const isFirst = index === 0;
  const name = localizedName(stop, i18n.resolvedLanguage ?? 'en');
  return (
    <View style={styles.rowActions}>
      <DragHandle index={index} accessibilityLabel={t('route.dragNamed', { name })} {...gesture} />
      <IconButton
        icon="arrowUp"
        accessibilityLabel={t('route.moveUp')}
        disabled={isFirst}
        onPress={() => onMove(stop.id, -1)}
      />
      <IconButton
        icon="arrowDown"
        accessibilityLabel={t('route.moveDown')}
        disabled={isLast}
        onPress={() => onMove(stop.id, 1)}
      />
      <IconButton
        icon="close"
        accessibilityLabel={t('route.removeNamed', { name })}
        onPress={() => onRemove(stop.id)}
      />
    </View>
  );
}

/**
 * One route's stops in walking order, numbered in the route's colour, with the estimated walk
 * between consecutive stops and optional "Split here" points. Stops are reordered with the
 * up / down buttons or by dragging their grip.
 * @example <RouteStopList route={routes[0]} routeIndex={0} routeCount={2} … />
 */
export function RouteStopList({
  route,
  routeIndex,
  routeCount,
  splittable,
  units,
  legs,
  onMove,
  onMoveTo,
  onRemove,
  onSplitAt,
  onDragActive,
}: {
  route: Stop[];
  routeIndex: number;
  routeCount: number;
  /** Whether "Split here" is offered (enough stops in the whole selection). */
  splittable: boolean;
  units: Units;
  /** Walking legs along the streets for this exact order (a computed, non-estimated route). */
  legs?: readonly RouteLeg[] | null;
  onMove: (id: string, direction: -1 | 1) => void;
  onMoveTo: (id: string, to: number) => void;
  onRemove: (id: string) => void;
  onSplitAt: (position: number) => void;
  /** Called with true when a drag starts and false when it ends (e.g. to pause page scrolling). */
  onDragActive?: (active: boolean) => void;
}) {
  const colorOf = useRouteColor();
  const drag = useStopDrag(
    route.length,
    spacing.xs,
    (from, to) => onMoveTo(route[from]!.id, to),
    onDragActive,
  );
  return (
    <View style={styles.list} testID={`route-${routeIndex}`}>
      {routeCount > 1 ? <RouteHeading routeIndex={routeIndex} stopCount={route.length} /> : null}
      {route.map((stop, i) => (
        <Animated.View
          key={stop.id}
          onLayout={drag.measure(i)}
          testID={`route-${routeIndex}-stop-${i}`}
          style={[
            styles.list,
            { transform: [{ translateY: drag.offsetOf(i) }] },
            drag.isDragged(i) && styles.dragged,
          ]}>
          {i > 0 ? (
            <LegConnector
              from={route[i - 1]!}
              to={stop}
              units={units}
              street={legs?.find((l) => l.fromId === route[i - 1]!.id && l.toId === stop.id)}
              onSplit={splittable && canSplitBefore(route, i) ? () => onSplitAt(i) : undefined}
            />
          ) : null}
          <AttractionRow
            item={stop}
            index={i}
            badgeColor={colorOf(routeIndex)}
            trailing={
              <StopActions
                stop={stop}
                index={i}
                isLast={i === route.length - 1}
                onMove={onMove}
                onRemove={onRemove}
                gesture={drag.gesture}
              />
            }
          />
        </Animated.View>
      ))}
    </View>
  );
}

/** Says how the order was produced; offers to go back to the automatic order. */
export function RouteOrderNotice({ manual, onAuto }: { manual: boolean; onAuto: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.notice} testID="route-order-notice">
      <Icon name={manual ? 'info' : 'sparkles'} size={16} color={theme.textSecondary} />
      <Text variant="caption" secondary style={styles.flex}>
        {manual ? t('route.manualOrderHint') : t('route.autoOrderHint')}
      </Text>
      {manual ? (
        <Button
          compact
          variant="secondary"
          icon="sparkles"
          label={t('route.autoOrder')}
          onPress={onAuto}
          testID="auto-order"
        />
      ) : null}
    </View>
  );
}

/**
 * Offers a proximity-based split once the selection has ROUTE_SPLIT_MIN_STOPS stops, and a way
 * to join split routes back together.
 */
export function SplitPanel({
  stopCount,
  routeCount,
  onSuggest,
  onMerge,
}: {
  stopCount: number;
  routeCount: number;
  onSuggest: (parts: number) => void;
  onMerge: () => void;
}) {
  const { t } = useTranslation();
  const maxParts = maxRouteParts(stopCount);
  const [parts, setParts] = useState('2');
  if (stopCount < ROUTE_SPLIT_MIN_STOPS && routeCount < 2) return null;
  const options = Array.from({ length: Math.max(0, maxParts - 1) }, (_, i) => {
    const value = String(i + 2);
    return { value, label: value };
  });
  const chosen = Math.min(Number(parts), maxParts);
  return (
    <Card testID="split-panel">
      <Text variant="heading">{t('route.splitTitle')}</Text>
      <Text variant="caption" secondary>
        {t('route.splitBody')}
      </Text>
      {options.length > 1 ? (
        <Segmented
          accessibilityLabel={t('route.splitParts')}
          options={options}
          value={String(chosen)}
          onChange={setParts}
        />
      ) : null}
      <View style={styles.splitActions}>
        {maxParts >= 2 ? (
          <Button
            variant="secondary"
            icon="split"
            label={t('route.suggestSplit')}
            onPress={() => onSuggest(chosen)}
            testID="suggest-split"
          />
        ) : null}
        {routeCount > 1 ? (
          <Button
            variant="ghost"
            icon="merge"
            label={t('route.merge')}
            onPress={onMerge}
            testID="merge-routes"
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: spacing.xs },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  connector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.lg,
    minHeight: 32,
  },
  rail: { width: 2, alignSelf: 'stretch', marginRight: spacing.sm, borderRadius: 1 },
  rowActions: { flexDirection: 'row', alignItems: 'center' },
  // Lifted above its neighbours while it follows the pointer.
  dragged: { zIndex: 1, opacity: 0.92 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  splitActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
