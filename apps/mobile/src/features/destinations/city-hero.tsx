// Top of the city page (D-033): cover photo with its credit, name with "Explore attractions",
// country and the city's average rating.
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { cityName, countryOf, type City } from '@/features/destinations/api';
import { useRatingSummary } from '@/features/reviews/api';
import { RatingSummaryLine } from '@/features/reviews/components';
import { flagEmoji } from '@/lib/format';
import { radius, spacing } from '@/theme/colors';
import { useBreakpoint, useTheme } from '@/theme/use-theme';

function Cover({ city, name }: { city: City; name: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  if (!city.cover) return null;
  return (
    <View style={styles.cover}>
      <Image
        source={city.cover.url}
        style={[styles.image, { backgroundColor: theme.surfaceMuted }]}
        contentFit="cover"
        accessibilityLabel={t('attraction.photoOf', { name })}
        transition={200}
      />
      <Text variant="helper" secondary>
        {t('home.photoCredit', {
          author: city.cover.author ?? '?',
          license: city.cover.license ?? '',
        })}
      </Text>
    </View>
  );
}

/**
 * @example <CityHero city={amsterdam} onExplore={() => router.push('/city/amsterdam')} />
 */
export function CityHero({ city, onExplore }: { city: City; onExplore: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const name = cityName(city, lang);
  const { isTablet } = useBreakpoint();
  const rating = useRatingSummary({ kind: 'city', id: city.slug });
  return (
    <View style={styles.hero} testID="city-hero">
      <Cover city={city} name={name} />
      <View style={[styles.titleRow, !isTablet && styles.titleRowPhone]}>
        <View style={[styles.titleText, !isTablet && styles.titleTextPhone]}>
          <Text variant="display" style={!isTablet && styles.centerText}>
            {name}
          </Text>
          <Text variant="subtitle" secondary style={!isTablet && styles.centerText}>
            {flagEmoji(city.countryCode)} {countryOf(city, lang)}
          </Text>
          {rating.data ? <RatingSummaryLine summary={rating.data} /> : null}
        </View>
        <Button icon="map" label={t('cityHub.exploreAttractions')} onPress={onExplore} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md },
  cover: { gap: spacing.sm },
  image: { width: '100%', aspectRatio: 16 / 7, maxHeight: 420, borderRadius: radius.xl },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleRowPhone: { flexDirection: 'column', alignItems: 'center' },
  titleTextPhone: { width: '100%', minWidth: 0, alignItems: 'center' },
  centerText: { textAlign: 'center' },
  titleText: { flexGrow: 1, flexShrink: 1, minWidth: 220, gap: spacing.xs },
});
