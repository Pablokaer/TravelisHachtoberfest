import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { cityName, countryOf, type City } from './api';
import { PhotoCredit } from './photo-credit';
import { Thumbnail } from './thumbnail';

import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { flagEmoji } from '@/lib/format';
import { radius, spacing } from '@/theme/colors';

/**
 * Image-led card for a destination on the Home: cover photo (with its credit), name, country
 * and number of places. The whole card opens the city.
 * @example <CityCard city={amsterdam} onPress={() => openCity('amsterdam')} />
 */
export function CityCard({ city, onPress }: { city: City; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const places = t('explore.placesCount', { count: city.attractionCount });
  const country = countryOf(city, lang);
  return (
    <Tappable
      onPress={onPress}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={t('home.openCity', { city: cityName(city, lang), country, places })}
      testID={`city-card-${city.slug}`}
      style={styles.card}>
      {({ hovered }) => (
        <>
          <View style={styles.media}>
            <Thumbnail
              uri={city.cover?.url ?? null}
              style={[styles.cover, hovered && styles.coverHover]}
            />
            {city.cover ? <PhotoCredit cover={city.cover} /> : null}
          </View>
          <View style={styles.body}>
            <Text variant="subtitle" numberOfLines={1}>
              {cityName(city, lang)}
            </Text>
            <Text variant="caption" secondary numberOfLines={1}>
              {`${flagEmoji(city.countryCode)}  ${country}`}
            </Text>
            <Text variant="caption" secondary numberOfLines={1}>
              {places}
            </Text>
          </View>
        </>
      )}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: spacing.md - 4 },
  media: { borderRadius: radius.lg, overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 4 / 3 },
  coverHover: { opacity: 0.88 },
  body: { gap: spacing.xxs },
});
