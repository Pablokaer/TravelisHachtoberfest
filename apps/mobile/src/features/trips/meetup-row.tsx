// One meetup in a ranked list (D-041): position, name, start in the city time, countdown,
// people going; the row opens the list, "I'm going" sits beside it (not nested in the row).
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { AttendButton } from '@/features/trips/attend-button';
import type { WalklistCard } from '@/features/trips/community-api';
import { countdownLabel, meetupWhen } from '@/features/trips/meetup-time';
import { authorLabel } from '@/features/trips/trip-card';
import { useNow } from '@/lib/use-now';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type Props = { meetup: WalklistCard; rank: number; timeZone: string; onOpen: (id: string) => void };

function RankBadge({ rank }: { rank: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.rank, { backgroundColor: theme.primarySoft }]} accessibilityElementsHidden>
      <Text variant="subtitle" style={{ color: theme.primary }}>
        {rank}
      </Text>
    </View>
  );
}

/**
 * @example <MeetupRow meetup={m} rank={1} timeZone="Europe/Lisbon" onOpen={openWalklist} />
 */
export function MeetupRow({ meetup, rank, timeZone, onOpen }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const now = useNow();
  const when = meetupWhen(meetup.startsAt!, timeZone, now, t('common.locale'));
  const left = countdownLabel(when.countdown, t);
  const going = t('meetups.going', { count: meetup.attendeeCount });
  return (
    <View
      testID={`meetup-rank-${rank}`}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={`${t('meetups.rank', { rank })}, ${meetup.name}, ${when.local}, ${left}, ${going}`}
        onPress={() => onOpen(meetup.id)}
        pressScale={0.98}
        style={styles.main}>
        <RankBadge rank={rank} />
        <View style={styles.text}>
          <Text variant="subtitle" numberOfLines={2}>
            {meetup.name}
          </Text>
          <Text variant="caption" secondary numberOfLines={1}>
            {when.local} · {authorLabel(meetup, t)}
          </Text>
          <View style={styles.meta}>
            <Icon name="clock" size={14} color={theme.primary} />
            <Text variant="caption" style={{ color: theme.primary, fontWeight: '600' }}>
              {left}
            </Text>
            <Text variant="caption" secondary>
              · {going}
            </Text>
          </View>
        </View>
      </Tappable>
      <AttendButton trip={meetup} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md - 4,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
  rank: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: spacing.xxs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
});
