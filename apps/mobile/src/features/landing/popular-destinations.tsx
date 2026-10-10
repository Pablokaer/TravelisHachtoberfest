import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LandingContainer, SectionHeading } from './landing-section';
import { destinationCardWidth, type LandingLayout } from './layout';
import { popularCities } from './popular';

import { Icon } from '@/components/icon';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { cityName, countryOf, type City } from '@/features/destinations/api';
import { PhotoCredit } from '@/features/destinations/photo-credit';
import { Thumbnail } from '@/features/destinations/thumbnail';
import { flagEmoji } from '@/lib/format';
import { gradient } from '@/theme/gradient';
import { radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

const CARD_SCRIM = gradient(
  'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.68) 100%)',
);
const SKELETONS = 6;
/** The hover lift and photo zoom ease in on the web (CSS transitions; native has no hover). */
const easeLift = (
  Platform.OS === 'web'
    ? {
        transitionProperty: 'top, box-shadow',
        transitionDuration: '200ms',
        transitionTimingFunction: 'ease-out',
      }
    : {}
) as ViewStyle;
const easeZoom = (
  Platform.OS === 'web'
    ? {
        transitionProperty: 'transform',
        transitionDuration: '400ms',
        transitionTimingFunction: 'ease-out',
      }
    : {}
) as ViewStyle;

/** A city photo with its name and country over a soft scrim; it lifts a little on hover. */
function DestinationCard({ city, width }: { city: City; width: number | null }) {
  const { t, i18n } = useTranslation();
  const shadows = useShadows();
  const lang = i18n.resolvedLanguage ?? 'en';
  const name = cityName(city, lang);
  const country = countryOf(city, lang);
  const places = t('explore.placesCount', { count: city.attractionCount });
  return (
    <Tappable
      onPress={() => router.push('/sign-up')}
      accessibilityRole="button"
      accessibilityLabel={t('landing.destinations.open', { city: name, country, places })}
      testID={`destination-${city.slug}`}
      pressScale={0.98}
      style={({ hovered }) => [
        styles.card,
        easeLift,
        width ? { width } : styles.cardFlex,
        hovered && { top: -4, boxShadow: shadows.raised },
      ]}>
      {({ hovered }) => (
        <>
          <View style={[StyleSheet.absoluteFill, easeZoom, hovered && styles.zoom]}>
            <Thumbnail uri={city.cover?.url ?? null} style={StyleSheet.absoluteFill} />
          </View>
          <View style={[StyleSheet.absoluteFill, CARD_SCRIM, styles.inert]} />
          {city.cover ? <PhotoCredit cover={city.cover} placement="top-left" /> : null}
          <View style={[styles.caption, styles.inert]}>
            <Text variant="subtitle" numberOfLines={1} style={styles.name}>
              {name}
            </Text>
            <Text variant="caption" numberOfLines={1} style={styles.country}>
              {`${flagEmoji(city.countryCode)}  ${country}`}
            </Text>
          </View>
        </>
      )}
    </Tappable>
  );
}

function CardSkeletons({ width }: { width: number | null }) {
  const theme = useTheme();
  return Array.from({ length: SKELETONS }, (_, i) => (
    <View
      key={i}
      style={[
        styles.card,
        width ? { width } : styles.cardFlex,
        { backgroundColor: theme.surfaceMuted },
      ]}
    />
  ));
}

/** The cards in one row (desktop) or a sideways-scrolling strip that bleeds to the edges. */
function CardRow({
  cities,
  width,
  gutter,
}: {
  cities: City[] | null;
  width: number | null;
  gutter: number;
}) {
  const cards = cities ? (
    cities.map((city) => <DestinationCard key={city.slug} city={city} width={width} />)
  ) : (
    <CardSkeletons width={width} />
  );
  if (width == null) return <View style={styles.row}>{cards}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={width + spacing.md}
      decelerationRate="fast"
      contentContainerStyle={[styles.row, { paddingHorizontal: gutter }]}
      style={{ marginHorizontal: -gutter }}>
      {cards}
    </ScrollView>
  );
}

/** Every covered city by name, A–Z in the UI language: the whole catalogue at a glance. */
function AllCities({ cities }: { cities: City[] }) {
  const theme = useTheme();
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const sorted = useMemo(
    () => [...cities].sort((a, b) => cityName(a, lang).localeCompare(cityName(b, lang), lang)),
    [cities, lang],
  );
  return (
    <View style={styles.allCities} testID="all-cities">
      {sorted.map((city) => (
        <View key={city.slug} style={[styles.cityPill, { borderColor: theme.border }]}>
          <Text variant="caption">{`${flagEmoji(city.countryCode)}  ${cityName(city, lang)}`}</Text>
        </View>
      ))}
    </View>
  );
}

function ViewAllLink({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const label = open
    ? t('landing.destinations.showFewer')
    : t('landing.destinations.viewAll', { count });
  return (
    <Tappable onPress={onToggle} accessibilityRole="button" pressScale={1} style={styles.viewAll}>
      {({ hovered }) => (
        <>
          <Text
            variant="label"
            style={[styles.viewAllText, { color: theme.primary }, hovered && styles.underline]}>
            {label}
          </Text>
          <Icon name={open ? 'arrowUp' : 'arrowForward'} size={18} color={theme.primary} />
        </>
      )}
    </Tappable>
  );
}

type DestinationsProps = {
  layout: LandingLayout;
  width: number;
  /** Every active city (`city_list`); null while loading. */
  cities: City[] | null;
  failed: boolean;
};

/**
 * "Popular destinations" (D-072): the curated cities from the real city list, and every covered
 * city on demand. A card leads to sign-up, where the city can be explored.
 * @example <PopularDestinations layout={layout} width={width} cities={cities} failed={false} />
 */
export function PopularDestinations({ layout, width, cities, failed }: DestinationsProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const cardWidth = destinationCardWidth(width);
  const popular = cities ? popularCities(cities) : null;
  const phone = width < 600;
  return (
    <LandingContainer gutter={layout.gutter} style={styles.section}>
      <View style={[styles.head, phone && styles.headStacked]}>
        <SectionHeading
          title={t('landing.destinations.title')}
          subtitle={t('landing.destinations.subtitle')}
          compact={phone}
          centered={phone}
        />
        {cities?.length ? (
          <ViewAllLink
            count={cities.length}
            open={showAll}
            onToggle={() => setShowAll((v) => !v)}
          />
        ) : null}
      </View>
      {failed ? (
        <Text secondary>{t('landing.destinations.unavailable')}</Text>
      ) : (
        <CardRow cities={popular} width={cardWidth} gutter={layout.gutter} />
      )}
      {showAll && cities ? <AllCities cities={cities} /> : null}
    </LandingContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xl },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  headStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  card: { aspectRatio: 3 / 4, borderRadius: radius.lg + 4, overflow: 'hidden' },
  cardFlex: { flex: 1 },
  inert: { pointerEvents: 'none' },
  zoom: { transform: [{ scale: 1.04 }] },
  caption: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: 2,
  },
  name: { color: '#FFFFFF', fontSize: 19, lineHeight: 24, fontWeight: '700' },
  country: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  viewAllText: { fontSize: 15 },
  underline: { textDecorationLine: 'underline' },
  allCities: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cityPill: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
