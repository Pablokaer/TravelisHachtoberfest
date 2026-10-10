import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { PageHeader, Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { WrapGrid } from '@/components/wrap-grid';
import { cityName, useCities, type City } from '@/features/destinations/api';
import { CityCard } from '@/features/destinations/city-card';
import { useFutureTrips, useRemoveFutureTrip, type FutureTrip } from '@/features/future-trips/api';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme/colors';

const openCity = (slug: string) => router.push({ pathname: '/short/[slug]', params: { slug } });

type Saved = { trip: FutureTrip; city: City };

function SavedCard({ saved }: { saved: Saved }) {
  const { t, i18n } = useTranslation();
  const remove = useRemoveFutureTrip();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { trip, city } = saved;
  return (
    <View style={styles.card}>
      <CityCard city={city} onPress={() => openCity(city.slug)} />
      {trip.reason ? <Text secondary>{trip.reason}</Text> : null}
      {trip.plannedFor ? (
        <Text variant="caption" secondary>
          {t('futureTrips.plannedFor', {
            date: formatDate(trip.plannedFor, lang === 'pt' ? 'pt-PT' : 'en-GB'),
          })}
        </Text>
      ) : null}
      <Button
        variant="ghost"
        icon="trash"
        label={t('futureTrips.removeShort')}
        accessibilityLabel={t('futureTrips.remove', { city: cityName(city, lang) })}
        loading={remove.isPending}
        onPress={() => remove.mutate(city.slug)}
      />
    </View>
  );
}

/**
 * Future trips (D-081): the destinations saved from the trip planner. Each card opens the city
 * page, with its lists, attractions and everything else any city has.
 */
export default function FutureTripsScreen() {
  const { t } = useTranslation();
  const trips = useFutureTrips();
  const cities = useCities();
  if (trips.isPending || cities.isPending) return <LoadingState />;
  if (trips.isError || cities.isError) return <ErrorState onRetry={() => void trips.refetch()} />;
  const saved = trips.data.flatMap((trip): Saved[] => {
    const city = cities.data.find((c) => c.slug === trip.citySlug);
    return city ? [{ trip, city }] : [];
  });
  return (
    <Screen width="wide">
      <PageHeader title={t('futureTrips.title')} subtitle={t('futureTrips.subtitle')} />
      {saved.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title={t('futureTrips.empty')}
          body={t('futureTrips.emptyBody')}
          action={
            <Button
              icon="sparkles"
              label={t('futureTrips.plan')}
              onPress={() => router.navigate('/plan')}
            />
          }
        />
      ) : (
        <WrapGrid
          items={saved}
          keyOf={(s) => s.city.slug}
          renderItem={(s) => <SavedCard saved={s} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ card: { gap: spacing.sm } });
