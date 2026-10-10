import { isoDateSchema } from '@wayfarer/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PageHeader, Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { ChecklistSections } from '@/features/checklist/checklist-sections';
import { useCityChecklist, type TripDates } from '@/features/checklist/use-city-checklist';
import { useCities } from '@/features/destinations/api';
import { todayIso } from '@/lib/format';
import { spacing } from '@/theme/colors';
import { useBreakpoint } from '@/theme/use-theme';

const valid = (v: string) => isoDateSchema.safeParse(v).success;

export default function ChecklistScreen() {
  const { city: citySlug } = useLocalSearchParams<{ city: string }>();
  const { t, i18n } = useTranslation();
  const { isTablet, isDesktop } = useBreakpoint();
  const cities = useCities();
  const city = cities.data?.find((c) => c.slug === citySlug);

  const [arrivalInput, setArrivalInput] = useState(todayIso());
  const [departureInput, setDepartureInput] = useState('');
  const [dates, setDates] = useState<TripDates>({
    arrival: todayIso(),
    departure: null,
  });
  const datesError =
    !valid(arrivalInput) ||
    (departureInput !== '' && (!valid(departureInput) || departureInput < arrivalInput))
      ? 'validation.date'
      : undefined;

  const { profile, checklist, needsNationality } = useCityChecklist(citySlug, dates);
  const cityName = city ? (i18n.resolvedLanguage === 'pt' ? city.namePt : city.nameEn) : '';

  if (profile.isPending) return <LoadingState />;
  if (needsNationality) {
    return (
      <EmptyState
        icon="passport"
        title={t('checklist.needNationality')}
        action={<Button label={t('profile.edit')} onPress={() => router.push('/edit-profile')} />}
      />
    );
  }

  return (
    <Screen edges={['left', 'right']} width={isDesktop ? 'wide' : 'content'}>
      <Stack.Screen options={{ title: t('checklist.titleFor', { city: cityName }) }} />
      <PageHeader size="title" title={cityName} subtitle={t('checklist.intro')} />
      <Card muted style={[styles.dates, isTablet && styles.datesWide]}>
        <View style={styles.flex}>
          <TextField
            icon="calendar"
            label={t('checklist.arrival')}
            value={arrivalInput}
            onChangeText={setArrivalInput}
            placeholder="YYYY-MM-DD"
            maxLength={10}
            testID="arrival"
          />
        </View>
        <View style={styles.flex}>
          <TextField
            icon="calendar"
            label={t('checklist.departure')}
            value={departureInput}
            onChangeText={setDepartureInput}
            placeholder={t('checklist.optional')}
            maxLength={10}
            testID="departure"
          />
        </View>
        <Button
          compact={isTablet}
          label={t('checklist.update')}
          disabled={!!datesError}
          onPress={() => setDates({ arrival: arrivalInput, departure: departureInput || null })}
        />
      </Card>
      {datesError ? (
        <Text variant="helper" secondary>
          {t('checklist.datesHint')}
        </Text>
      ) : null}

      {checklist.isPending ? (
        <LoadingState label={t('checklist.loading')} />
      ) : checklist.isError ? (
        <ErrorState message={t('checklist.error')} onRetry={() => checklist.refetch()} />
      ) : (
        <>
          <ChecklistSections data={checklist.data} units={profile.data?.units ?? 'metric'} />
          <Text variant="helper" secondary>
            {t('checklist.disclaimer')}
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dates: { gap: spacing.md },
  datesWide: { flexDirection: 'row', alignItems: 'flex-end' },
});
