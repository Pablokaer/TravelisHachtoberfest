import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { PageHeader, Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { cityName, useCities, type City } from '@/features/destinations/api';
import { CityNotFound } from '@/features/destinations/city-not-found';
import { openWalklist } from '@/features/trips/city-walklists-section';
import { useWalklistPages } from '@/features/trips/community-api';
import { MeetupRow } from '@/features/trips/meetup-row';
import {
  FALLBACK_TIME_ZONE,
  groupByLocalDay,
  meetupDayLabel,
  type MeetupDay,
} from '@/features/trips/meetup-time';
import { cityMeetupsQuery } from '@/features/trips/upcoming-meetups-section';
import { useNow } from '@/lib/use-now';
import { spacing } from '@/theme/colors';

/**
 * Every upcoming meetup of a city (`/short/[slug]/meetups`, D-041): public walk lists with a
 * future date and time, soonest first, grouped by day in the city's time, a page at a time.
 */
export default function CityMeetupsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const cities = useCities();
  const city = cities.data?.find((c) => c.slug === slug);
  if (cities.isPending) return <LoadingState />;
  if (cities.isError) return <ErrorState onRetry={() => cities.refetch()} />;
  if (!city) return <CityNotFound />;
  return <MeetupsByDay city={city} />;
}

function DayHeading({
  day,
  locale,
  timeZone,
}: {
  day: MeetupDay['day'];
  locale: string;
  timeZone: string;
}) {
  const { t } = useTranslation();
  const label =
    day === 'today' || day === 'tomorrow'
      ? t(`meetups.${day}`)
      : meetupDayLabel(day, locale, timeZone);
  return (
    <Text variant="heading" accessibilityRole="header">
      {label}
    </Text>
  );
}

function MeetupsByDay({ city }: { city: City }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const meetups = useWalklistPages(cityMeetupsQuery(city.slug));
  const name = cityName(city, i18n.resolvedLanguage ?? 'en');
  const timeZone = city.timezone ?? FALLBACK_TIME_ZONE;
  const days = groupByLocalDay(meetups.data?.pages.flat() ?? [], timeZone, now);
  let rank = 0;
  return (
    <Screen edges={['left', 'right']}>
      <Stack.Screen options={{ headerShown: true, title: name }} />
      <PageHeader
        size="title"
        title={t('meetups.pageTitle', { city: name })}
        subtitle={t('meetups.pageSubtitle', { city: name })}
      />
      <View testID="meetups-page" style={styles.days}>
        {meetups.isPending ? <LoadingState /> : null}
        {meetups.isError ? (
          <ErrorState message={t('meetups.error')} onRetry={() => meetups.refetch()} />
        ) : null}
        {meetups.data && days.length === 0 ? (
          <EmptyState icon="calendar" title={t('meetups.empty')} body={t('meetups.emptyBody')} />
        ) : null}
        {days.map((group) => (
          <View key={group.day} style={styles.day}>
            <DayHeading day={group.day} locale={t('common.locale')} timeZone={timeZone} />
            {group.items.map((meetup) => (
              <MeetupRow
                key={meetup.id}
                meetup={meetup}
                rank={++rank}
                timeZone={timeZone}
                onOpen={openWalklist}
              />
            ))}
          </View>
        ))}
        {meetups.hasNextPage ? (
          <Button
            variant="secondary"
            label={t('walklists.loadMore')}
            loading={meetups.isFetchingNextPage}
            onPress={() => void meetups.fetchNextPage()}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  days: { gap: spacing.lg },
  day: { gap: spacing.sm },
});
