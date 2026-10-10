// "Walk together" on a public walk list (D-041, D-044): when it starts in the city time,
// the countdown, how many are going and — for signed-in travellers — "I'm going". Going (or
// organising) opens the group chat (D-043); others can just save the list instead. While the
// walk chat is hidden (D-065) the banner is attendance only: no chat button, no chat hint.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { isChatMember, walkChatHref } from '@/features/chat/membership';
import { cityName, useCities } from '@/features/destinations/api';
import { AttendButton } from '@/features/trips/attend-button';
import { countdownLabel, FALLBACK_TIME_ZONE, meetupWhen } from '@/features/trips/meetup-time';
import { useFeatures } from '@/lib/features';
import { useNow } from '@/lib/use-now';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type MeetupTrip = {
  id: string;
  name: string;
  citySlug: string;
  startsAt: string | null;
  attendeeCount: number;
  isAttending: boolean;
  isOwner: boolean;
  visibility: string;
};

/** Start in the city time, countdown and people going — or just the people for a list without a time. */
function WhenAndWho({ trip }: { trip: MeetupTrip }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const now = useNow();
  const city = useCities().data?.find((c) => c.slug === trip.citySlug);
  const going = t('meetups.going', { count: trip.attendeeCount });
  if (!trip.startsAt)
    return <Text style={{ color: theme.primary, fontWeight: '600' }}>{going}</Text>;
  const when = meetupWhen(
    trip.startsAt,
    city?.timezone ?? FALLBACK_TIME_ZONE,
    now,
    t('common.locale'),
  );
  const place = city ? cityName(city, i18n.resolvedLanguage ?? 'en') : trip.citySlug;
  return (
    <>
      <Text variant="heading">
        {when.local}{' '}
        <Text variant="caption" secondary>
          ({t('meetups.cityTime', { city: place })})
        </Text>
      </Text>
      <Text style={{ color: theme.primary, fontWeight: '600' }} accessibilityLiveRegion="polite">
        {countdownLabel(when.countdown, t)} · {going}
      </Text>
    </>
  );
}

/**
 * "Walk together" on every public walk list (D-044): when it starts (if it has a time), how many
 * are going, "I'm going" for other signed-in travellers — before or after the start — and, for
 * the organiser and everyone going, the group chat (when the walk chat is on, D-065). Nothing
 * on private or protected lists.
 * @example <MeetupBanner trip={shared} canJoin={signedIn} />
 */
export function MeetupBanner({ trip, canJoin }: { trip: MeetupTrip; canJoin: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { walkChat } = useFeatures();
  if (trip.visibility !== 'public') return null;
  const member = isChatMember(trip);
  const chatOpen = walkChat && canJoin && member;
  const chatHint = walkChat && canJoin && !member;
  return (
    <Card testID="meetup-banner" style={styles.card}>
      <View style={styles.row}>
        <Icon name="calendar" size={20} color={theme.primary} />
        <Text variant="subtitle">{t('meetups.meetupTitle')}</Text>
      </View>
      <WhenAndWho trip={trip} />
      {canJoin ? (
        <View style={styles.row}>
          <AttendButton trip={{ ...trip, isOwn: trip.isOwner }} />
          {chatOpen ? (
            <Button
              compact
              variant="secondary"
              icon="mail"
              label={t('chat.open')}
              onPress={() => router.push(walkChatHref(trip.id))}
            />
          ) : null}
        </View>
      ) : null}
      {chatHint ? (
        <Text variant="helper" secondary>
          {t('chat.joinHint')}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
