import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { useToggleAttendance } from '@/features/trips/community-api';
import { useTheme } from '@/theme/use-theme';

type Meetup = { id: string; name: string; isAttending: boolean; isOwn: boolean };

/**
 * "I'm going" / "Not going" on another traveller's public walk list (D-041, D-044), with the
 * error when a request fails. Nothing for the organiser.
 * @example <AttendButton trip={meetup} />
 */
export function AttendButton({ trip }: { trip: Meetup }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const toggle = useToggleAttendance();
  if (trip.isOwn) return null;
  return (
    <View style={styles.wrap}>
      <Button
        compact
        variant={trip.isAttending ? 'secondary' : 'primary'}
        icon={trip.isAttending ? 'check' : 'person'}
        label={trip.isAttending ? t('meetups.leave') : t('meetups.join')}
        accessibilityState={{ selected: trip.isAttending }}
        loading={toggle.isPending}
        onPress={() => toggle.mutate({ id: trip.id, attending: !trip.isAttending })}
      />
      {/* The button always shows the server's state (refreshed after any outcome, D-044). */}
      {toggle.error ? (
        <Text variant="helper" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
          {t('meetups.attendError')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: 4 } });
