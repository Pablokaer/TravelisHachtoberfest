// The owner's "Date and time" of a walk list (D-041): a date and a start time in the city's
// time; with both, a public list is listed as a meetup. Saved with `set_trip_schedule`.
import { clockTimeSchema, isoDateSchema, localDateTime, meetupStart } from '@wayfarer/shared';
import type { TripVisibility } from '@wayfarer/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Section } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { walkChatHref } from '@/features/chat/membership';
import { cityName, useCities } from '@/features/destinations/api';
import { useSetTripSchedule } from '@/features/trips/community-api';
import { FALLBACK_TIME_ZONE } from '@/features/trips/meetup-time';
import { useFeatures } from '@/lib/features';
import { spacing } from '@/theme/colors';

type ScheduledTrip = {
  id: string;
  citySlug: string;
  startsAt: string | null;
  visibility: TripVisibility;
};

type Errors = { date?: string; time?: string };

/** Field errors of the date and time, or the start to save. */
function scheduleFrom(date: string, time: string, timeZone: string): Errors | { startsAt: string } {
  const errors: Errors = {};
  if (!isoDateSchema.safeParse(date).success) errors.date = 'validation.date';
  if (!clockTimeSchema.safeParse(time).success) errors.time = 'validation.time';
  if (errors.date || errors.time) return errors;
  const start = meetupStart({ tripDate: date, startTime: time }, timeZone, new Date());
  if ('error' in start) return { time: start.error };
  return { startsAt: start.startsAt! };
}

/**
 * @example <ScheduleEditor trip={trip} />
 */
export function ScheduleEditor({ trip }: { trip: ScheduledTrip }) {
  const { t, i18n } = useTranslation();
  const { walkChat } = useFeatures();
  const city = useCities().data?.find((c) => c.slug === trip.citySlug);
  const timeZone = city?.timezone ?? FALLBACK_TIME_ZONE;
  const current = trip.startsAt ? localDateTime(trip.startsAt, timeZone) : null;
  const [date, setDate] = useState(current?.date ?? '');
  const [time, setTime] = useState(current?.time ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const schedule = useSetTripSchedule(trip.id);
  const place = city ? cityName(city, i18n.resolvedLanguage ?? 'en') : trip.citySlug;
  const save = () => {
    const result = scheduleFrom(date.trim(), time.trim(), timeZone);
    if ('startsAt' in result) {
      setErrors({});
      schedule.mutate(result.startsAt);
    } else setErrors(result);
  };
  return (
    <Section title={t('schedule.title')}>
      <Text secondary>{t('schedule.hint', { city: place })}</Text>
      {trip.visibility !== 'public' ? <Text secondary>{t('schedule.notPublic')}</Text> : null}
      <View style={styles.fields}>
        <View style={styles.field}>
          <TextField
            icon="calendar"
            label={t('schedule.date')}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            maxLength={10}
            error={errors.date}
            testID="schedule-date"
          />
        </View>
        <View style={styles.field}>
          <TextField
            icon="clock"
            label={t('schedule.time')}
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            maxLength={5}
            error={errors.time}
            testID="schedule-time"
          />
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          variant="secondary"
          label={t('schedule.save')}
          loading={schedule.isPending}
          onPress={save}
        />
        {walkChat && trip.visibility === 'public' ? (
          // The organiser is always in the group chat of a public list (D-043, D-044); hidden
          // while the walk chat is off (D-065).
          <Button
            variant="secondary"
            icon="mail"
            label={t('chat.open')}
            onPress={() => router.push(walkChatHref(trip.id))}
          />
        ) : null}
        {trip.startsAt ? (
          <Button
            variant="ghost"
            icon="close"
            label={t('schedule.remove')}
            onPress={() => schedule.mutate(null)}
          />
        ) : null}
      </View>
      {schedule.isSuccess ? (
        <Text variant="helper" secondary accessibilityLiveRegion="polite">
          {t('schedule.saved')}
        </Text>
      ) : null}
      {schedule.error ? <Text secondary>{t('errors.generic')}</Text> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { flexGrow: 1, flexBasis: 200 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
