// "Before you go" on the city page (D-033): the checklist page's sections for a trip starting
// today, with a way to the full page to choose the dates. Nothing is recomputed here.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { centring, useCentredOnPhone } from '@/components/phone-centring';
import { Section } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { ChecklistSections } from '@/features/checklist/checklist-sections';
import { useCityChecklist, type TripDates } from '@/features/checklist/use-city-checklist';
import { todayIso } from '@/lib/format';
import { spacing } from '@/theme/colors';

function SectionBody({ citySlug }: { citySlug: string }) {
  const { t } = useTranslation();
  // Fixed for the page's lifetime so the query key does not change on every render.
  const [today] = useState<TripDates>(() => ({ arrival: todayIso(), departure: null }));
  const { profile, checklist, needsNationality } = useCityChecklist(citySlug, today);
  if (needsNationality) {
    return (
      <View style={styles.actions}>
        <Text secondary>{t('checklist.needNationality')}</Text>
        <Button
          variant="secondary"
          label={t('profile.edit')}
          onPress={() => router.push('/edit-profile')}
        />
      </View>
    );
  }
  if (profile.isPending || checklist.isPending)
    return <LoadingState label={t('checklist.loading')} />;
  if (checklist.isError || !checklist.data)
    return <ErrorState message={t('checklist.error')} onRetry={() => checklist.refetch()} />;
  return <ChecklistSections data={checklist.data} units={profile.data?.units ?? 'metric'} />;
}

/**
 * @example <BeforeYouGoSection citySlug={city.slug} />
 */
export function BeforeYouGoSection({ citySlug }: { citySlug: string }) {
  const { t } = useTranslation();
  const centred = useCentredOnPhone();
  const openChecklist = () =>
    router.push({ pathname: '/checklist/[city]', params: { city: citySlug } });
  return (
    <Section
      title={t('checklist.title')}
      action={
        <Button
          compact
          variant="ghost"
          icon="calendar"
          label={t('cityHub.changeDates')}
          onPress={openChecklist}
        />
      }>
      <Text secondary style={centred && centring.text}>
        {t('cityHub.beforeYouGoIntro')}
      </Text>
      <SectionBody citySlug={citySlug} />
    </Section>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, alignItems: 'flex-start' },
});
