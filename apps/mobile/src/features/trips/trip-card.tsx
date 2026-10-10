// A walk list card (D-020; shared by My Trips and the city page since D-035): the starting
// point's photo with its credit (D-038), city and date, name, then stops · distance · walk and,
// for other people's lists, author and rating.
import type { TripVisibility } from '@wayfarer/shared';
import type { TFunction } from 'i18next';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { centring, useCentredOnPhone } from '@/components/phone-centring';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { cityName, type City, type PhotoCover } from '@/features/destinations/api';
import { PhotoCredit } from '@/features/destinations/photo-credit';
import { Thumbnail } from '@/features/destinations/thumbnail';
import { useProfile } from '@/features/profile/api';
import type { RatingSummary } from '@/features/reviews/api';
import { CardRating } from '@/features/reviews/components';
import { visibilityBadge } from '@/features/trips/visibility-editor';
import { flagEmoji, formatDate, formatDistance, formatDuration } from '@/lib/format';
import { radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

/** What a card needs; own trips and community lists both provide it. */
export type TripCardData = {
  id: string;
  name: string;
  citySlug: string;
  stopCount: number;
  distanceM: number | null;
  walkingSeconds: number | null;
  tripDate?: string | null;
  /** Shown as a badge on the owner's cards (public / password). */
  visibility?: TripVisibility;
  /** Other people's lists: author, official badge and rating. */
  authorName?: string | null;
  isOfficial?: boolean;
  rating?: RatingSummary;
  /** Photo of the starting point (D-038); the photo placeholder when null or missing. */
  cover?: PhotoCover | null;
};

type MetaItem = { icon: IconName; label: string };

function useMeta(trip: TripCardData, lang: string): MetaItem[] {
  const { t } = useTranslation();
  const units = useProfile().data?.units ?? 'metric';
  const meta: MetaItem[] = [{ icon: 'pin', label: t('trips.stops', { count: trip.stopCount }) }];
  if (trip.distanceM != null)
    meta.push({ icon: 'route', label: formatDistance(trip.distanceM, units, lang) });
  if (trip.walkingSeconds != null)
    meta.push({
      icon: 'walk',
      label: t('trips.walk', { duration: formatDuration(trip.walkingSeconds) }),
    });
  const badge = trip.visibility ? visibilityBadge(trip.visibility) : null;
  if (badge) meta.push({ icon: badge.icon, label: t(badge.label as never) });
  return meta;
}

/**
 * "by Ana", "by a traveller", or "by Travelist" for official lists (D-035).
 * @example authorLabel({ authorName: 'Ana', isOfficial: false }, t) // 'by Ana'
 */
export function authorLabel(
  trip: Pick<TripCardData, 'authorName' | 'isOfficial'>,
  t: TFunction,
): string {
  if (trip.isOfficial) return t('walklists.byPlatform');
  return t('walklists.byAuthor', { name: trip.authorName ?? t('walklists.anonymousAuthor') });
}

/** Author line of other people's lists; nothing on the owner's own cards. */
function Byline({ trip, centred }: { trip: TripCardData; centred: boolean }) {
  const { t } = useTranslation();
  if (trip.authorName === undefined && !trip.isOfficial) return null;
  return (
    <View testID="walklist-byline" style={[styles.byline, centred && centring.row]}>
      {trip.isOfficial ? (
        <Badge icon="verified" tone="accent" label={t('walklists.official')} />
      ) : null}
      {/* Without flex: 1 on phones, so the row can gather in the middle. */}
      <Text variant="caption" secondary numberOfLines={1} style={!centred && styles.flex}>
        {authorLabel(trip, t)}
      </Text>
      <CardRating summary={trip.rating} />
    </View>
  );
}

/** The starting point's photo across the top of the card, with its credit over it. */
function CardPhoto({ cover }: { cover?: PhotoCover | null }) {
  return (
    <View>
      <Thumbnail uri={cover?.url ?? null} style={styles.photo} testID="walklist-cover" />
      {cover ? <PhotoCredit cover={cover} /> : null}
    </View>
  );
}

function CardCover({ trip, city, lang }: { trip: TripCardData; city?: City; lang: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.cover, { backgroundColor: theme.surfaceMuted }]}>
      <Text style={styles.flag}>{city ? flagEmoji(city.countryCode) : '🧭'}</Text>
      <View style={styles.flex}>
        <Text variant="label" secondary numberOfLines={1}>
          {city ? cityName(city, lang) : trip.citySlug}
        </Text>
        {trip.tripDate ? (
          <Text variant="helper" secondary>
            {formatDate(trip.tripDate, lang)}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronRight" size={16} color={theme.textSecondary} />
    </View>
  );
}

function MetaRow({ items, centred }: { items: MetaItem[]; centred: boolean }) {
  const theme = useTheme();
  return (
    <View testID="walklist-meta" style={[styles.meta, centred && centring.row]}>
      {items.map((m) => (
        <View key={m.icon} style={styles.metaItem}>
          <Icon name={m.icon} size={14} color={theme.textSecondary} />
          <Text variant="caption" secondary>
            {m.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The card opens the list; `actions` (e.g. Save) sit below it, outside the pressable area, so
 * no button is nested in another (invalid HTML on web).
 * @example <TripCard trip={list} city={lisbon} onPress={open} actions={<SaveWalklistButton trip={list} />} />
 */
export function TripCard({
  trip,
  city,
  onPress,
  actions,
}: {
  trip: TripCardData;
  city?: City;
  onPress: () => void;
  actions?: ReactNode;
}) {
  const { i18n } = useTranslation();
  const theme = useTheme();
  const shadows = useShadows();
  const [hovered, setHovered] = useState(false);
  const centred = useCentredOnPhone();
  const lang = i18n.resolvedLanguage ?? 'en';
  const place = city ? cityName(city, lang) : trip.citySlug;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          boxShadow: hovered ? shadows.raised : shadows.card,
        },
      ]}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={`${trip.name}, ${place}`}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        pressScale={0.98}
        style={styles.flex}>
        <CardPhoto cover={trip.cover} />
        <CardCover trip={trip} city={city} lang={lang} />
        <View style={styles.body}>
          <Text variant="heading" numberOfLines={2} style={centred && centring.text}>
            {trip.name}
          </Text>
          <Byline trip={trip} centred={centred} />
          <MetaRow items={useMeta(trip, lang)} centred={centred} />
        </View>
      </Tappable>
      {actions ? (
        <View testID="walklist-actions" style={[styles.actions, centred && centring.row]}>
          {actions}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  photo: { width: '100%', aspectRatio: 16 / 9 },
  cover: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md,
  },
  flag: { fontSize: 28, lineHeight: 34 },
  body: { padding: spacing.md, paddingTop: spacing.md - 4, gap: spacing.sm },
  byline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
