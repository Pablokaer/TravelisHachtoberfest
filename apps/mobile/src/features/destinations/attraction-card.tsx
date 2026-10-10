// The attraction card: a grid card in List mode and, `compact`, the popup of a selected map
// marker — one design for both, so a place looks the same in either view.
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { localizedName, type AttractionSummary } from './api';
import { CategoryDot } from './components';
import { Thumbnail } from './thumbnail';

import { Badge } from '@/components/card';
import { Icon } from '@/components/icon';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import type { RatingSummary } from '@/features/reviews/api';
import { CardRating, ratingLabel } from '@/features/reviews/components';
import { palette, radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

// Handlers take the place, so a screen passes the same function to every card and a card
// re-renders only when its own place, stop number or rating changes (D-062).
type CardProps = {
  item: AttractionSummary;
  onPress?: (item: AttractionSummary) => void;
  /** Position in the current route, when the place is in it. */
  order?: number;
  /** Shows a checkbox that adds/removes the place without opening it. */
  onToggleRoute?: (item: AttractionSummary) => void;
  /** Average rating; omitted for places without reviews (D-028). */
  rating?: RatingSummary;
  /** Map popup: a narrower card on its own surface, rating on its own line. */
  compact?: boolean;
};

/** Name, category · visit time and rating (beside the name, or below it when compact). */
function CardBody({ item, name, rating, compact }: CardProps & { name: string }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.cardBody, compact && styles.compactBody]}>
      <View style={styles.cardTitle}>
        <Text variant="subtitle" numberOfLines={1} style={styles.flex}>
          {name}
        </Text>
        {compact ? null : <CardRating summary={rating} />}
      </View>
      <View style={styles.meta}>
        <CategoryDot category={item.category} />
        <Text variant="caption" secondary numberOfLines={1} style={styles.flex}>
          {t(`category.${item.category}`)} ·{' '}
          {t('attraction.visitMinutes', { minutes: item.avgVisitMinutes })}
        </Text>
      </View>
      {compact ? <CardRating summary={rating} /> : null}
    </View>
  );
}

/** The card's own surface when it floats over the map; none in the grid. */
function useCompactSurface(compact: boolean | undefined) {
  const theme = useTheme();
  const shadows = useShadows();
  if (!compact) return null;
  return [
    styles.compact,
    { backgroundColor: theme.surface, borderColor: theme.border, boxShadow: shadows.raised },
  ];
}

/**
 * Image-led card for an attraction: photo, name, category, rating and the "+" route checkbox.
 * Memoised: pass stable `onPress` / `onToggleRoute` (they receive the place) and the rating
 * object from the ratings query, so toggling one stop leaves the other cards alone.
 * @example <AttractionCard item={a} onPress={open} onToggleRoute={toggle} rating={r} compact />
 */
export const AttractionCard = memo(function AttractionCard(props: CardProps) {
  const { item, onPress, order, onToggleRoute, rating, compact } = props;
  const { t, i18n } = useTranslation();
  const name = localizedName(item, i18n.resolvedLanguage ?? 'en');
  const spokenRating = ratingLabel(rating, t('common.locale'), t)?.spoken;
  return (
    <View style={useCompactSurface(compact)} testID={`attraction-card-${item.id}`}>
      <Tappable
        onPress={onPress && (() => onPress(item))}
        disabled={!onPress}
        pressScale={0.98}
        accessibilityRole="button"
        accessibilityLabel={[name, t(`category.${item.category}`), spokenRating]
          .filter(Boolean)
          .join(', ')}
        style={styles.card}>
        {({ hovered }) => (
          <>
            <View style={[styles.media, compact && styles.compactMedia]}>
              <Thumbnail
                uri={item.imageUrl}
                style={[styles.cover, compact && styles.compactCover, hovered && styles.coverHover]}
              />
              <View style={styles.overlayRow} pointerEvents="none">
                {item.isUnesco ? <Badge label="UNESCO" tone="overlay" /> : <View />}
              </View>
            </View>
            <CardBody {...props} name={name} />
          </>
        )}
      </Tappable>
      {/* A sibling of the card, not a child, so its press never opens the attraction. */}
      <View style={styles.selectSlot} pointerEvents="box-none">
        {onToggleRoute ? (
          <RouteCheckbox name={name} order={order} onPress={() => onToggleRoute(item)} />
        ) : order != null ? (
          <OrderBadge order={order} />
        ) : null}
      </View>
    </View>
  );
});

function OrderBadge({ order }: { order: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.checkbox, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
      <Text variant="label" style={{ color: theme.onPrimary, fontWeight: '700' }}>
        {order}
      </Text>
    </View>
  );
}

/** Round checkbox over the photo; when checked it shows the stop number. */
function RouteCheckbox({
  name,
  order,
  onPress,
}: {
  name: string;
  order?: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const shadows = useShadows();
  const checked = order != null;
  return (
    <Tappable
      accessibilityRole="checkbox"
      accessibilityLabel={t('route.includeNamed', { name })}
      accessibilityState={{ checked }}
      onPress={onPress}
      hitSlop={8}
      pressScale={0.88}
      testID="route-checkbox"
      style={({ hovered }) => [
        styles.checkbox,
        {
          backgroundColor: checked
            ? theme.primary
            : hovered
              ? palette.light.surface
              : 'rgba(255,255,255,0.85)',
          borderColor: checked ? theme.primary : palette.light.surface,
          boxShadow: shadows.floating,
        },
      ]}>
      {checked ? (
        <Text variant="label" style={{ color: theme.onPrimary, fontWeight: '700' }}>
          {order}
        </Text>
      ) : (
        // Sits on a light pill over the photo in both themes, so use the light-theme text colour.
        <Icon name="add" size={18} color={palette.light.text} />
      )}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { flex: 1, gap: spacing.md - 4 },
  media: { borderRadius: radius.lg, overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 4 / 3 },
  coverHover: { opacity: 0.88 },
  overlayRow: {
    position: 'absolute',
    top: spacing.md - 4,
    left: spacing.md - 4,
    right: spacing.md - 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectSlot: { position: 'absolute', top: spacing.md - 4, right: spacing.md - 4 },
  checkbox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { gap: spacing.xxs },
  cardTitle: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm - 2 },
  // Map popup: narrow enough for a phone, photo on top of its own rounded surface.
  compact: {
    width: 248,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  compactMedia: { borderRadius: 0 },
  compactCover: { aspectRatio: 16 / 10 },
  compactBody: { paddingHorizontal: spacing.md - 4, paddingBottom: spacing.md - 4 },
});
