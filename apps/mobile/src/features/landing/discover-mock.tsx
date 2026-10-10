import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { MOCK_CITIES, type MockCity } from './mock-data';
import { MockBrand, MockChip, MockTabBar, MockText } from './mock-ui';
import { PHONE_OVERLAP } from './phone-frame';

import { Icon } from '@/components/icon';
import { flagEmoji } from '@/lib/format';
import { palette } from '@/theme/colors';

const c = palette.light;

function MockCityCard({ city }: { city: MockCity }) {
  const { t, i18n } = useTranslation();
  const pt = i18n.resolvedLanguage === 'pt';
  const places = t('explore.placesCount', { count: city.places });
  return (
    <View style={styles.card}>
      <View>
        <Image source={city.photo.source} style={styles.cover} contentFit="cover" />
        <View style={styles.save}>
          <Icon name="heart" size={14} color={c.primary} />
        </View>
      </View>
      <View style={styles.cardTitle}>
        <MockText size={14.5} weight="700">
          {pt ? city.namePt : city.nameEn}
        </MockText>
        <MockText size={12} weight="600">
          <MockText size={12} color={c.star}>
            ★
          </MockText>{' '}
          {city.rating}
        </MockText>
      </View>
      <MockText size={11.5} secondary>
        {`${flagEmoji(city.countryCode)} ${pt ? city.countryPt : city.countryEn} · ${places}`}
      </MockText>
    </View>
  );
}

/**
 * The Home of the app as a mockup: logo, "Where to next?", search, filters and city cards.
 * @example <PhoneFrame><DiscoverMock /></PhoneFrame>
 */
export function DiscoverMock() {
  const { t } = useTranslation();
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <MockBrand />
        <View style={styles.avatar}>
          <MockText size={10.5} weight="700" color={c.primary}>
            AT
          </MockText>
        </View>
      </View>
      <MockText size={21} weight="700" style={styles.title}>
        {t('explore.title')}
      </MockText>
      <View style={styles.search}>
        <Icon name="search" size={15} color={c.textSecondary} />
        <MockText size={12} secondary>
          {t('landing.mock.search')}
        </MockText>
      </View>
      <View style={styles.chips}>
        <MockChip label={t('landing.mock.all')} selected />
        <MockChip label={t('category.museum')} icon="museum" />
        <MockChip label={t('category.nature')} icon="nature" />
      </View>
      {MOCK_CITIES.map((city) => (
        <MockCityCard key={city.slug} city={city} />
      ))}
      <MockTabBar active="explore" />
    </View>
  );
}

const styles = StyleSheet.create({
  // The front phone covers the right edge: keep the header and ratings clear of it.
  screen: { flex: 1, paddingLeft: 16, paddingRight: 16 + PHONE_OVERLAP },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primarySoft,
  },
  title: { marginTop: 14, letterSpacing: -0.4 },
  search: {
    marginTop: 10,
    height: 38,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
  },
  chips: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 4 },
  card: { marginTop: 12, gap: 2 },
  cover: { width: '100%', height: 124, borderRadius: 16, marginBottom: 6 },
  save: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  cardTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
