import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { PageHeader, useGutter } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useCities, type City } from '@/features/destinations/api';
import { useTrips } from '@/features/trips/api';
import { useWalklistPages } from '@/features/trips/community-api';
import { SaveWalklistButton } from '@/features/trips/save-walklist-button';
import { TripCard, type TripCardData } from '@/features/trips/trip-card';
import { layout, spacing } from '@/theme/colors';
import { useBreakpoint, useTheme } from '@/theme/use-theme';

const GRID_GAP = spacing.lg;

type Tab = 'mine' | 'saved';

const openOwnTrip = (id: string) => router.push({ pathname: '/trip/[id]', params: { id } });
// Someone else's list opens read-only by its link, like any shared list (D-031).
const openSharedTrip = (id: string) => router.push({ pathname: '/shared', params: { id } });

/**
 * My Trips: the user's own walk lists and, on the Saved tab, other travellers' lists they
 * saved (D-035).
 */
export default function TripsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('mine');
  const [listWidth, setListWidth] = useState(0);
  const header = (
    <View style={styles.header}>
      <PageHeader title={t('trips.title')} subtitle={t('trips.subtitle')} />
      <Segmented
        accessibilityLabel={t('trips.tabsLabel')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'mine', label: t('trips.mineTab'), icon: 'luggage' },
          { value: 'saved', label: t('trips.savedTab'), icon: 'bookmarked' },
        ]}
      />
    </View>
  );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safe, { backgroundColor: theme.background }]}
      onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}>
      {tab === 'mine' ? (
        <OwnTrips header={header} width={listWidth} />
      ) : (
        <SavedTrips header={header} width={listWidth} />
      )}
    </SafeAreaView>
  );
}

function OwnTrips({ header, width }: { header: ReactElement; width: number }) {
  const { t } = useTranslation();
  const trips = useTrips();
  if (trips.isPending) return <LoadingState />;
  if (trips.isError) return <ErrorState onRetry={() => trips.refetch()} />;
  return (
    <TripGrid
      items={trips.data}
      width={width}
      header={header}
      onOpen={openOwnTrip}
      refreshing={trips.isRefetching}
      onRefresh={() => trips.refetch()}
      empty={
        <EmptyState
          icon="luggage"
          title={t('trips.emptyTitle')}
          body={t('trips.empty')}
          action={
            <Button icon="map" label={t('trips.explore')} onPress={() => router.navigate('/')} />
          }
        />
      }
    />
  );
}

function SavedTrips({ header, width }: { header: ReactElement; width: number }) {
  const { t } = useTranslation();
  const saved = useWalklistPages({ saved: true, sort: 'newest' });
  if (saved.isPending) return <LoadingState />;
  if (saved.isError) return <ErrorState onRetry={() => saved.refetch()} />;
  return (
    <TripGrid
      items={saved.data.pages.flat()}
      width={width}
      header={header}
      onOpen={openSharedTrip}
      actions={(list) => <SaveWalklistButton trip={list} />}
      footer={
        saved.hasNextPage ? (
          <Button
            variant="secondary"
            label={t('walklists.loadMore')}
            loading={saved.isFetchingNextPage}
            onPress={() => void saved.fetchNextPage()}
          />
        ) : null
      }
      empty={
        <EmptyState
          icon="bookmark"
          title={t('trips.savedEmptyTitle')}
          body={t('trips.savedEmpty')}
        />
      }
    />
  );
}

type GridProps<T extends TripCardData> = {
  items: T[];
  width: number;
  header: ReactElement;
  empty: ReactElement;
  onOpen: (id: string) => void;
  actions?: (item: T) => ReactElement;
  footer?: ReactElement | null;
  refreshing?: boolean;
  onRefresh?: () => void;
};

/** Up to three columns of trip cards in the wide page container. */
function TripGrid<T extends TripCardData>(props: GridProps<T>) {
  const gutter = useGutter();
  const { columns } = useBreakpoint();
  const cities = useCities();
  const cols = Math.min(columns, 3);
  const inner = { maxWidth: layout.wide + gutter * 2, paddingHorizontal: gutter };
  const itemWidth = props.width
    ? (Math.min(props.width, layout.wide + gutter * 2) - gutter * 2 - GRID_GAP * (cols - 1)) / cols
    : undefined;
  const cityOf = (slug: string): City | undefined => cities.data?.find((c) => c.slug === slug);
  return (
    <FlatList
      key={cols}
      data={props.items}
      keyExtractor={(trip) => trip.id}
      numColumns={cols}
      columnWrapperStyle={cols > 1 ? { gap: GRID_GAP } : undefined}
      contentContainerStyle={[styles.list, inner]}
      refreshing={props.refreshing ?? false}
      onRefresh={props.onRefresh}
      ListHeaderComponent={props.header}
      ListEmptyComponent={props.empty}
      ListFooterComponent={props.footer}
      renderItem={({ item }) => (
        <View style={itemWidth ? { width: itemWidth } : styles.flex}>
          <TripCard
            trip={item}
            city={cityOf(item.citySlug)}
            onPress={() => props.onOpen(item.id)}
            actions={props.actions?.(item)}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { gap: spacing.md, alignItems: 'flex-start' },
  list: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: GRID_GAP,
    flexGrow: 1,
  },
});
