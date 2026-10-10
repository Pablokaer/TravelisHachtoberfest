import { zodResolver } from '@hookform/resolvers/zod';
import {
  DEFAULT_LANGUAGE,
  profileFormSchema,
  type Language,
  type ProfileForm,
} from '@wayfarer/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { FormError } from '@/features/auth/components';
import { profileSaveError, useProfile, useSaveProfile } from '@/features/profile/api';
import { NameAndPreferencesFields, NationalityFields } from '@/features/profile/profile-fields';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

// The passport expiry step was removed: the passport is assumed valid (still editable in the profile).
const STEP_FIELDS = [
  ['displayName', 'nickname', 'language', 'units'],
  ['nationalities', 'homeCountry'],
] as const satisfies readonly (readonly (keyof ProfileForm)[])[];

export default function OnboardingScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const profile = useProfile();
  const save = useSaveProfile();
  const [step, setStep] = useState(0);

  const { control, trigger, handleSubmit } = useForm<ProfileForm>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: profile.data?.displayName ?? '',
      nickname: profile.data?.nickname ?? '',
      language: (i18n.resolvedLanguage as Language) ?? DEFAULT_LANGUAGE,
      units: profile.data?.units ?? 'metric',
      homeCountry: profile.data?.homeCountry ?? '',
      nationalities: profile.data?.nationalities ?? [],
      passportExpiry: profile.data?.passportExpiry ?? null,
    },
  });

  const next = async () => {
    if (await trigger([...STEP_FIELDS[step]!])) setStep((s) => s + 1);
  };
  const finish = handleSubmit((form) => save.mutate(form));

  const titles = [t('onboarding.step1Title'), t('onboarding.step2Title')];
  const lastStep = titles.length - 1;

  return (
    <Screen width="form" edges={['left', 'right']}>
      <View style={styles.progress}>
        <View style={styles.bars}>
          {titles.map((_, i) => (
            <View
              key={i}
              style={[styles.bar, { backgroundColor: i <= step ? theme.primary : theme.border }]}
            />
          ))}
        </View>
        <Text variant="label" secondary style={styles.centerText} accessibilityLiveRegion="polite">
          {t('onboarding.progress', { step: step + 1, total: titles.length })}
        </Text>
      </View>
      <Text variant="title" style={styles.centerText}>
        {titles[step]}
      </Text>
      <Card style={styles.fields}>
        {step === 0 ? <NameAndPreferencesFields control={control} /> : null}
        {step === 1 ? <NationalityFields control={control} /> : null}
      </Card>
      <FormError message={profileSaveError(save.error, t)} />
      <View style={styles.actions}>
        {step > 0 ? (
          <Button
            variant="secondary"
            label={t('common.back')}
            onPress={() => setStep((s) => s - 1)}
            style={styles.flex}
          />
        ) : null}
        {step < lastStep ? (
          <Button label={t('common.next')} onPress={() => void next()} style={styles.flex} />
        ) : (
          <Button
            label={t('onboarding.finish')}
            loading={save.isPending}
            onPress={finish}
            style={styles.flex}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerText: { textAlign: 'center' },
  progress: { gap: spacing.sm },
  bars: { flexDirection: 'row', gap: spacing.xs },
  bar: { flex: 1, height: 4, borderRadius: radius.pill },
  fields: { gap: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
