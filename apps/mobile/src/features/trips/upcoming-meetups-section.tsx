// "Upcoming meetups" on the city page (D-041): the next public walk lists with a date and time,
// soonest first, each with a live countdown; "View all meetups" opens every one by day.
import { MEETUP_PREVIEW_COUNT } from '@wayfarer/shared';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Section } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import type { City } from '@/features/destinations/api';
import { openWalklist } from '@/features/trips/city-walklists-section';
import { useWalklistPreview } from '@/features/trips/community-api';
import { MeetupRow } from '@/features/trips/meetup-row';
import { FALLBACK_TIME_ZONE } from '@/features/trips/meetup-time';
import { spacing } from '@/theme/colors';

/** The query of a city's meetups, shared by the preview and the meetups page. */
export const cityMeetupsQuery = (citySlug: string) =>
  ({ citySlug, upcoming: true, sort: 'soonest' }) as const;

function MeetupRanking({ city }: { city: City }) {
  const { t } = useTranslation();
  const preview = useWalklistPreview(cityMeetupsQuery(city.slug), MEETUP_PREVIEW_COUNT);
  if (preview.isPending) return <LoadingState />;
  if (preview.isError)
    return <ErrorState message={t('meetups.error')} onRetry={() => preview.refetch()} />;
  if (preview.data.items.length === 0)
    return <EmptyState icon="calendar" title={t('meetups.empty')} body={t('meetups.emptyBody')} />;
  const openAll = () =>
    router.push({ pathname: '/short/[slug]/meetups', params: { slug: city.slug } });
  return (
    <>
      <View style={styles.list}>
        {preview.data.items.map((meetup, i) => (
          <MeetupRow
            key={meetup.id}
            meetup={meetup}
            rank={i + 1}
            timeZone={city.timezone ?? FALLBACK_TIME_ZONE}
            onOpen={openWalklist}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <Button
          variant="secondary"
          icon="calendar"
          label={t('meetups.viewAll')}
          onPress={openAll}
        />
      </View>
    </>
  );
}

/**
 * @example <UpcomingMeetupsSection city={lisbon} />
 */
export function UpcomingMeetupsSection({ city }: { city: City }) {
  const { t } = useTranslation();
  return (
    <View testID="meetups-upcoming">
      <Section title={t('meetups.title')}>
        <Card muted style={styles.card}>
          <Text secondary>{t('meetups.subtitle')}</Text>
          <MeetupRanking city={city} />
        </Card>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  list: { gap: spacing.sm },
  actions: { flexDirection: 'row' },
});
