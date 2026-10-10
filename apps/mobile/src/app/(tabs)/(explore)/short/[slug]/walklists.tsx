import { WALKLIST_SORTS, type WalklistSort } from '@wayfarer/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CardGrid } from '@/components/card-grid';
import { PageHeader, useGutter } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { Segmented } from '@/components/segmented';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { cityName, useCities, type City } from '@/features/destinations/api';
import { CityNotFound } from '@/features/destinations/city-not-found';
import { WalklistCardWithActions } from '@/features/trips/city-walklists-section';
import { useWalklistPages } from '@/features/trips/community-api';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { layout, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** Wait this long after the last key before asking the server (one request per pause). */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Every public walk list of a city (`/short/[slug]/walklists`, D-035): search by name, sort by
 * rating, number of reviews or date, a page at a time. `?kind=official` lists the official ones.
 */
export default function CityWalklistsScreen() {
  const { slug, kind } = useLocalSearchParams<{ slug: string; kind?: string }>();
  const cities = useCities();
  const city = cities.data?.find((c) => c.slug === slug);
  if (cities.isPending) return <LoadingState />;
  if (cities.isError) return <ErrorState onRetry={() => cities.refetch()} />;
  if (!city) return <CityNotFound />;
  return <WalklistBrowser city={city} official={kind === 'official'} />;
}

function WalklistBrowser({ city, official }: { city: City; official: boolean }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const gutter = useGutter();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<WalklistSort>('top');
  const search = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const lists = useWalklistPages({ citySlug: city.slug, official, search, sort });
  const name = cityName(city, i18n.resolvedLanguage ?? 'en');
  const title = t(official ? 'walklists.officialPageTitle' : 'walklists.pageTitle', { city: name });
  const header = (
    <View style={styles.header}>
      <PageHeader size="title" title={title} />
      <SearchField
        value={query}
        onChangeText={setQuery}
        label={t('walklists.search')}
        testID="walklist-search"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Segmented
          accessibilityLabel={t('walklists.sortLabel')}
          value={sort}
          onChange={setSort}
          options={WALKLIST_SORTS.map((s) => ({ value: s, label: t(`walklists.sort.${s}`) }))}
        />
      </ScrollView>
    </View>
  );
  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: true, title: name }} />
      {lists.isError ? (
        <ErrorState message={t('walklists.error')} onRetry={() => lists.refetch()} />
      ) : (
        <CardGrid
          testID="walklist-grid"
          items={lists.data?.pages.flat() ?? []}
          keyOf={(list) => list.id}
          maxWidth={layout.wide}
          gutter={gutter}
          header={header}
          renderCard={(list) => <WalklistCardWithActions list={list} city={city} />}
          empty={
            lists.isPending ? (
              <LoadingState />
            ) : search.trim() ? (
              <EmptyState icon="search" title={t('walklists.noMatch')} />
            ) : (
              <EmptyState
                icon="route"
                title={t(official ? 'walklists.officialEmpty' : 'walklists.communityEmpty')}
              />
            )
          }
          footer={
            lists.hasNextPage ? (
              <Button
                variant="secondary"
                label={t('walklists.loadMore')}
                loading={lists.isFetchingNextPage}
                onPress={() => void lists.fetchNextPage()}
              />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { gap: spacing.md, paddingTop: spacing.lg },
});
