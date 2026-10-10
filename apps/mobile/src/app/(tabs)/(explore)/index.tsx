import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CardGrid } from '@/components/card-grid';
import { PageHeader, useGutter } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { cityName, useCities, type City } from '@/features/destinations/api';
import { BrowseHeader } from '@/features/destinations/browse-header';
import { CityCard } from '@/features/destinations/city-card';
import { searchCities } from '@/features/destinations/search';
import { UpgradeButton } from '@/features/subscription/upgrade-button';
import { layout } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * Home (`/`): the destinations Travelist covers, as a searchable grid of city cards. A card opens
 * the city page (`/short/[slug]`, D-033); its attractions are one tap further (`/city/[slug]`).
 */
export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const gutter = useGutter();
  const cities = useCities();
  const [query, setQuery] = useState('');
  const lang = i18n.resolvedLanguage ?? 'en';
  const visible = useMemo(
    () => visibleCities(cities.data ?? [], query, lang),
    [cities.data, query, lang],
  );

  if (cities.isPending) return <LoadingState />;
  if (cities.isError) return <ErrorState onRetry={() => cities.refetch()} />;
  if (cities.data.length === 0)
    return (
      <EmptyState icon="globe" title={t('explore.noCities')} body={t('explore.noCitiesBody')} />
    );

  const openCity = (slug: string) => router.push({ pathname: '/short/[slug]', params: { slug } });
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safe, { backgroundColor: theme.background }]}>
      <BrowseHeader
        container={{ maxWidth: layout.page + gutter * 2, paddingHorizontal: gutter }}
        gutter={gutter}
        action={<UpgradeButton />}
        search={
          <SearchField
            value={query}
            onChangeText={setQuery}
            label={t('explore.searchCities')}
            testID="city-search"
          />
        }
      />
      <CardGrid
        testID="city-list"
        items={visible}
        keyOf={(c) => c.slug}
        maxWidth={layout.page}
        gutter={gutter}
        header={
          <PageHeader
            title={t('explore.title')}
            subtitle={t('home.citiesCount', { count: visible.length })}
            size="title"
          />
        }
        renderCard={(city) => <CityCard city={city} onPress={() => openCity(city.slug)} />}
        empty={<EmptyState icon="search" title={t('explore.noCityMatch')} />}
      />
    </SafeAreaView>
  );
}

/** Every city A–Z in the UI language, or the search matches (best first) while typing. */
function visibleCities(cities: readonly City[], query: string, lang: string): City[] {
  if (query.trim()) return searchCities(cities, query, lang);
  return [...cities].sort((a, b) => cityName(a, lang).localeCompare(cityName(b, lang), lang));
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
