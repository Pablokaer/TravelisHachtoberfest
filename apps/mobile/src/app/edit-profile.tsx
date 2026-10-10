import { zodResolver } from '@hookform/resolvers/zod';
import { profileFormSchema, type ProfileForm } from '@wayfarer/shared';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen, Section } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { FormError } from '@/features/auth/components';
import { profileSaveError, useProfile, useSaveProfile, type Profile } from '@/features/profile/api';
import {
  NameAndPreferencesFields,
  NationalityFields,
  PassportFields,
} from '@/features/profile/profile-fields';
import { ProfilePhotoEditor } from '@/features/profile/profile-photo-editor';
import { spacing } from '@/theme/colors';

function EditProfileForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const save = useSaveProfile();
  const { control, handleSubmit } = useForm<ProfileForm>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: profile.displayName ?? '',
      nickname: profile.nickname ?? '',
      language: profile.language,
      units: profile.units,
      homeCountry: profile.homeCountry ?? '',
      nationalities: profile.nationalities,
      passportExpiry: profile.passportExpiry,
    },
  });
  const onSave = handleSubmit((form) => save.mutate(form, { onSuccess: () => router.back() }));
  return (
    <Screen
      width="form"
      edges={['left', 'right']}
      footer={
        <Button
          label={t('common.save')}
          loading={save.isPending}
          onPress={onSave}
          testID="save-profile"
          style={styles.save}
        />
      }>
      <Section title={t('profile.photo.title')}>
        <Card style={styles.fields}>
          <ProfilePhotoEditor profile={profile} />
        </Card>
      </Section>
      <Section title={t('onboarding.step1Title')}>
        <Card style={styles.fields}>
          <NameAndPreferencesFields control={control} />
        </Card>
      </Section>
      <Section title={t('onboarding.step2Title')}>
        <Card style={styles.fields}>
          <NationalityFields control={control} />
        </Card>
      </Section>
      <Section title={t('onboarding.step3Title')}>
        <Card style={styles.fields}>
          <PassportFields control={control} />
        </Card>
      </Section>
      <FormError message={profileSaveError(save.error, t)} />
    </Screen>
  );
}

export default function EditProfileScreen() {
  const profile = useProfile();
  if (profile.isPending) return <LoadingState />;
  if (profile.isError) return <ErrorState onRetry={() => profile.refetch()} />;
  return <EditProfileForm profile={profile.data} />;
}

const styles = StyleSheet.create({
  fields: { gap: spacing.lg },
  save: { flex: 1 },
});
