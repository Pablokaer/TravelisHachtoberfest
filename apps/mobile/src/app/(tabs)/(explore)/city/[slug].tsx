import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CardGrid } from '@/components/card-grid';
import { useGutter } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import {
  cityName,
  localizedName,
  useAttractions,
  useCities,
  type AttractionSummary,
} from '@/features/destinations/api';
import { AttractionSearch } from '@/features/destinations/attraction-search';
import { AttractionCard } from '@/features/destinations/attraction-card';
import { CityHeader } from '@/features/destinations/city-header';
import { CityNotFound } from '@/features/destinations/city-not-found';
import { buildSearchIndex, searchIndex } from '@/features/destinations/search';
import { useExploreStore } from '@/features/destinations/store';
import { MapView } from '@/features/map/map-view';
import { routeNotice } from '@/features/route/notice';
import { useCityRatings } from '@/features/reviews/api';
import { withMinRating } from '@/features/reviews/rating-filter';
import { useRouteStore } from '@/features/route/store';
import { env } from '@/lib/env';
import { categoryColors, layout, radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

/**
 * City page (`/city/[slug]`): the attractions of the city in the URL — search, category tabs,
 * map or list, route tray. Opened from a city card on the Home.
 */
export default function CityScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const shadows = useShadows();
  const gutter = useGutter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const cities = useCities();
  const { categories, toggleCategory, clearCategories, view, setView, minRating, setMinRating } =
    useExploreStore();
  const routeStops = useRouteStore((s) => s.stops);
  const toggleStop = useRouteStore((s) => s.toggle);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // The place whose card is open on the map; one at a time (D-029).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Height of the Map/List switch + route tray floating over the map's bottom edge.
  const [floatingHeight, setFloatingHeight] = useState(0);

  const city = cities.data?.find((c) => c.slug === slug);

  const attractions = useAttractions(city, categories);
  const ratings = useCityRatings(city?.slug);
  const lang = i18n.resolvedLanguage ?? 'en';
  // Names normalised once per city (and category tabs), not on every keystroke.
  const index = useMemo(() => buildSearchIndex(attractions.data ?? []), [attractions.data]);
  // The grid and the map follow the query at low priority: typing (and the dropdown, which
  // reads the live query) never waits for 300 cards or markers to re-render.
  const gridQuery = useDeferredValue(query);
  // The grid and the map show every match of the search and the rating tabs; the dropdown
  // only the best few matches.
  const visible = useMemo(() => {
    const all = attractions.data ?? [];
    const matches = gridQuery.trim() ? searchIndex(index, gridQuery, lang) : all;
    return withMinRating(matches, ratings.data, minRating);
  }, [attractions.data, index, gridQuery, lang, ratings.data, minRating]);
  const stopOrder = useMemo(() => new Map(routeStops.map((s, i) => [s.id, i + 1])), [routeStops]);
  // A filter or search that hides the selected place also closes its card.
  const selected = visible.find((a) => a.id === selectedId) ?? null;
  const points = useMemo(
    () =>
      visible.map((a) => ({
        id: a.id,
        lat: a.lat,
        lng: a.lng,
        color: categoryColors[a.category] ?? categoryColors.other!,
        selected: a.id === selected?.id,
        order: stopOrder.get(a.id),
        imageUrl: a.imageUrl,
        name: localizedName(a, lang),
      })),
    [visible, stopOrder, selected?.id, lang],
  );
  // Stable and taking the place, so a memoised card re-renders only when its own stop number
  // or rating changes, not on every route change (D-062).
  const openAttraction = useCallback(
    (item: AttractionSummary) =>
      router.push({ pathname: '/attraction/[id]', params: { id: item.id } }),
    [],
  );
  const toggleWithNotice = useCallback(
    (item: AttractionSummary) => {
      setNotice(routeNotice(toggleStop(item), t));
    },
    [toggleStop, t],
  );

  if (cities.isPending) return <LoadingState />;
  if (cities.isError) return <ErrorState onRetry={() => cities.refetch()} />;
  if (!city) return <CityNotFound />;

  const [south, west, north, east] = city.bbox;
  const selectCity = (next: string) => {
    setQuery('');
    router.setParams({ slug: next });
  };
  const openChecklist = () =>
    router.push({ pathname: '/checklist/[city]', params: { city: city.slug } });

  // One container for the header and the grid, so both start and end on the same lines.
  const inner = { maxWidth: layout.page + gutter * 2, paddingHorizontal: gutter };
  const count = attractions.isPending
    ? t('common.loading')
    : t('explore.placesCount', { count: visible.length });

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safe, { backgroundColor: theme.background }]}>
      <CityHeader
        cities={cities.data}
        city={city}
        onSelectCity={selectCity}
        search={
          <AttractionSearch
            items={attractions.data ?? []}
            cityName={cityName(city, lang)}
            query={query}
            onQueryChange={setQuery}
            routeOrder={stopOrder}
            onToggle={toggleWithNotice}
            onOpen={openAttraction}
          />
        }
        categories={categories}
        onToggleCategory={toggleCategory}
        onClearCategories={clearCategories}
        minRating={minRating}
        onChangeMinRating={setMinRating}
        onOpenChecklist={openChecklist}
        container={inner}
        gutter={gutter}
      />

      <View style={styles.body}>
        {attractions.isError ? (
          <ErrorState onRetry={() => attractions.refetch()} />
        ) : view === 'map' ? (
          <>
            <MapView
              testID="explore-map"
              accessibilityLabel={t('explore.mapLabel')}
              styleUrl={env.mapStyleUrl}
              bounds={[west, south, east, north]}
              points={points}
              markers="photo"
              selectedId={selected?.id ?? null}
              onPointPress={setSelectedId}
              onMapPress={() => setSelectedId(null)}
              overlayInsets={{ top: MAP_COUNT_BAND, bottom: floatingHeight + spacing.md }}
              popup={
                selected ? (
                  <AttractionCard
                    compact
                    item={selected}
                    order={stopOrder.get(selected.id)}
                    onPress={openAttraction}
                    onToggleRoute={toggleWithNotice}
                    rating={ratings.data?.get(selected.id)}
                  />
                ) : null
              }
            />
            <View
              style={[styles.mapCount, { backgroundColor: theme.surface, boxShadow: shadows.card }]}
              pointerEvents="none">
              <Text variant="label" accessibilityLiveRegion="polite">
                {count}
              </Text>
            </View>
          </>
        ) : attractions.isPending ? (
          <LoadingState />
        ) : (
          <CardGrid
            testID="attraction-list"
            items={visible}
            keyOf={(a) => a.id}
            maxWidth={layout.page}
            gutter={gutter}
            header={
              <Text variant="heading" accessibilityLiveRegion="polite">
                {count}
              </Text>
            }
            renderCard={(item) => (
              <AttractionCard
                item={item}
                order={stopOrder.get(item.id)}
                onPress={openAttraction}
                onToggleRoute={toggleWithNotice}
                rating={ratings.data?.get(item.id)}
              />
            )}
            empty={<EmptyState icon="search" title={t('explore.noResults')} />}
          />
        )}

        <View
          style={styles.floating}
          pointerEvents="box-none"
          onLayout={(e) => setFloatingHeight(e.nativeEvent.layout.height)}>
          <Segmented
            floating
            accessibilityLabel={t('explore.viewMode')}
            value={view}
            onChange={setView}
            options={[
              { value: 'map', label: t('explore.mapView'), icon: 'map' },
              { value: 'list', label: t('explore.listView'), icon: 'grid' },
            ]}
          />
          {routeStops.length > 0 ? (
            <View
              style={[
                styles.tray,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  boxShadow: shadows.raised,
                },
              ]}>
              <View
                style={[styles.trayIcon, { backgroundColor: theme.primarySoft }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
                <Text variant="subtitle" style={{ color: theme.primary }}>
                  {routeStops.length}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text variant="subtitle" accessibilityLiveRegion="polite">
                  {t('route.trayCount', { count: routeStops.length })}
                </Text>
                {notice ? (
                  <Text variant="helper" secondary accessibilityLiveRegion="polite">
                    {notice}
                  </Text>
                ) : null}
              </View>
              <Button
                compact
                icon="route"
                label={t('route.build')}
                onPress={() => router.push('/route')}
                testID="open-route"
              />
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

/** The "N places" pill over the top of the map (its offset + height). */
const MAP_COUNT_BAND = spacing.md + 40;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  body: { flex: 1 },
  mapCount: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  floating: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    alignItems: 'center',
    gap: spacing.md - 4,
  },
  tray: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md - 4,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  trayIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
