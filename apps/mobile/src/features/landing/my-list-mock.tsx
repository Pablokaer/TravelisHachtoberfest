import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { MOCK_CITIES, MOCK_MAP, MOCK_STOPS, type MockStop } from './mock-data';
import { MockTabBar, MockText } from './mock-ui';

import { Icon } from '@/components/icon';
import { categoryColors, palette } from '@/theme/colors';

const c = palette.light;
const MAP_WIDTH = 236;
const MAP_HEIGHT = MAP_WIDTH / MOCK_MAP.aspectRatio;
const PIN = 22;

/** The Belém map with the walking route and a numbered pin per stop. */
function MockMap() {
  return (
    <View style={styles.map}>
      <Image source={MOCK_MAP.source} style={StyleSheet.absoluteFill} contentFit="cover" />
      {MOCK_STOPS.map((stop, i) => (
        <View
          key={stop.nameEn}
          style={[
            styles.pin,
            { left: stop.pin.x * MAP_WIDTH - PIN / 2, top: stop.pin.y * MAP_HEIGHT - PIN / 2 },
          ]}>
          <MockText size={11} weight="700" color={c.onPrimary}>
            {i + 1}
          </MockText>
        </View>
      ))}
      <View style={styles.attribution}>
        <MockText size={7} secondary>
          © OpenStreetMap
        </MockText>
      </View>
    </View>
  );
}

function MockStopRow({ stop, index }: { stop: MockStop; index: number }) {
  const { t, i18n } = useTranslation();
  const name = i18n.resolvedLanguage === 'pt' ? stop.namePt : stop.nameEn;
  const visit = t('attraction.visitMinutes', { minutes: stop.minutes });
  return (
    <View style={styles.row}>
      <MockText size={12} weight="700" color={c.primary} style={styles.index}>
        {index + 1}
      </MockText>
      <Image source={stop.photo.source} style={styles.thumb} contentFit="cover" />
      <View style={styles.rowText}>
        <MockText size={12.5} weight="600">
          {name}
        </MockText>
        <View style={styles.meta}>
          <View style={[styles.dot, { backgroundColor: categoryColors[stop.category] }]} />
          <MockText size={11} secondary>
            {`${t(`category.${stop.category}`)} · ${visit}`}
          </MockText>
        </View>
      </View>
    </View>
  );
}

/**
 * A walk list as a mockup: "My List", Lisbon, the route on the map and its stops.
 * @example <PhoneFrame raised><MyListMock /></PhoneFrame>
 */
export function MyListMock() {
  const { t, i18n } = useTranslation();
  const lisbon = MOCK_CITIES[0]!;
  const city = i18n.resolvedLanguage === 'pt' ? lisbon.namePt : lisbon.nameEn;
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <MockText size={21} weight="700" style={styles.title}>
          {t('landing.mock.myList')}
        </MockText>
        <Icon name="share" size={17} color={c.text} />
      </View>
      <View style={styles.city}>
        <Icon name="pin" size={13} color={c.primary} />
        <MockText size={12} secondary>
          {`${city} · ${t('explore.placesCount', { count: MOCK_STOPS.length })}`}
        </MockText>
      </View>
      <MockMap />
      <View style={styles.walk}>
        <Icon name="walk" size={14} color={c.text} />
        <MockText size={11.5} weight="600">
          {t('landing.mock.walk')}
        </MockText>
      </View>
      {MOCK_STOPS.map((stop, i) => (
        <MockStopRow key={stop.nameEn} stop={stop} index={i} />
      ))}
      <MockTabBar active="trips" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { letterSpacing: -0.4 },
  city: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, marginBottom: 10 },
  map: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: c.surfaceMuted,
  },
  pin: {
    position: 'absolute',
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primary,
    boxShadow: '0px 2px 6px rgba(0,0,0,0.25)',
  },
  attribution: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingHorizontal: 4,
    borderTopLeftRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  walk: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  index: { width: 10, textAlign: 'center' },
  thumb: { width: 38, height: 38, borderRadius: 10 },
  rowText: { flex: 1, gap: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
