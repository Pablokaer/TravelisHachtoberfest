// One suggested route (D-077): photos of its stops, title, how far it starts from the traveller,
// its stops in walking order (each opens the place, with its Wikipedia link) and a Start button.
import { walkingSeconds, type RankedRoute } from '@wayfarer/shared';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { localizedName } from '@/features/destinations/api';
import { Thumbnail } from '@/features/destinations/thumbnail';
import { useProfile } from '@/features/profile/api';
import { formatDistance, formatDuration } from '@/lib/format';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';
import { routeTitle, type SuggestedRoute } from './api';

/** Stops listed on the card; the rest are summed up as "+N". */
const LISTED_STOPS = 5;
const PHOTO_SIZE = 64;

type Props = {
  route: RankedRoute<SuggestedRoute>;
  /** Show "starts X from you": only when the traveller shared their position. */
  showStartDistance: boolean;
  onStart: () => void;
  onOpenStop: (id: string) => void;
};

function PhotoStrip({ route }: { route: Props['route'] }) {
  return (
    <View style={styles.photos}>
      {route.stops.slice(0, 4).map((stop) => (
        <Thumbnail
          key={stop.id}
          uri={stop.imageUrl}
          width={PHOTO_SIZE}
          iconSize={20}
          style={styles.photo}
        />
      ))}
    </View>
  );
}

function Facts({ route, showStartDistance }: Pick<Props, 'route' | 'showStartDistance'>) {
  const { t, i18n } = useTranslation();
  const units = useProfile().data?.units ?? 'metric';
  const lang = i18n.resolvedLanguage ?? 'en';
  const theme = useTheme();
  const items = [
    t('suggested.stops', { count: route.stops.length }),
    formatDistance(route.walkingMeters, units, lang),
    t('suggested.walk', { duration: formatDuration(walkingSeconds(route.walkingMeters)) }),
  ];
  return (
    <View style={styles.facts}>
      <Text variant="caption" secondary>
        {items.join(' · ')}
      </Text>
      {showStartDistance ? (
        <View style={styles.startsAt}>
          <Icon name="pin" size={14} color={theme.primary} />
          <Text variant="caption" style={{ color: theme.primary }}>
            {t('suggested.startsAt', {
              distance: formatDistance(route.startDistanceM, units, lang),
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function StopRow({ index, name, onPress }: { index: number; name: string; onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={t('suggested.openStop', { name })}
      style={styles.stop}>
      <View style={[styles.number, { backgroundColor: theme.surfaceMuted }]}>
        <Text variant="helper">{index + 1}</Text>
      </View>
      <Text numberOfLines={1} style={styles.stopName}>
        {name}
      </Text>
      <Icon name="chevronRight" size={16} color={theme.textSecondary} />
    </Tappable>
  );
}

export function SuggestedRouteCard({ route, showStartDistance, onStart, onOpenStop }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const hidden = route.stops.length - LISTED_STOPS;
  return (
    <Card testID={`suggested-route-${route.slug}`} style={styles.card}>
      <PhotoStrip route={route} />
      <Text variant="heading">{routeTitle(route, lang)}</Text>
      <Facts route={route} showStartDistance={showStartDistance} />
      <View>
        {route.stops.slice(0, LISTED_STOPS).map((stop, i) => (
          <StopRow
            key={stop.id}
            index={i}
            name={localizedName(stop, lang)}
            onPress={() => onOpenStop(stop.id)}
          />
        ))}
        {hidden > 0 ? (
          <Text variant="caption" secondary style={styles.more}>
            {t('suggested.moreStops', { count: hidden })}
          </Text>
        ) : null}
      </View>
      <Button
        icon="walk"
        label={t('suggested.start')}
        accessibilityHint={t('suggested.startHint')}
        onPress={onStart}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.md - 4 },
  photos: { flexDirection: 'row', gap: spacing.sm },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: radius.md, overflow: 'hidden' },
  facts: { gap: spacing.xs },
  startsAt: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  number: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopName: { flex: 1 },
  more: { paddingLeft: 32 },
});
