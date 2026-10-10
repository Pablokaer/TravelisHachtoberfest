import { zodResolver } from '@hookform/resolvers/zod';
import { newPasswordSchema } from '@wayfarer/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { type Control, Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { Button } from '@/components/button';
import { LoadingState } from '@/components/states';
import { TextField } from '@/components/text-field';
import { AuthLayout, FormError } from '@/features/auth/components';
import { updatePassword } from '@/features/auth/recovery-api';
import { useRecoveryLink } from '@/features/auth/use-recovery-link';

type Form = z.infer<typeof newPasswordSchema>;

/**
 * Landing page of the password reset email (D-066): verifies the link (which signs the user in),
 * then takes the new password. Outside the route guards, so a fresh session is not sent into the
 * app before the password is set.
 */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const state = useRecoveryLink(useLocalSearchParams());
  if (state === 'verifying') return <LoadingState label={t('auth.verifyingResetLink')} />;
  if (state === 'invalid') return <InvalidLink />;
  return <NewPasswordForm />;
}

function InvalidLink() {
  const { t } = useTranslation();
  return (
    <AuthLayout title={t('auth.newPasswordTitle')}>
      <FormError message={t('auth.resetLinkInvalid')} />
      <Button label={t('auth.requestNewLink')} onPress={() => router.replace('/forgot-password')} />
    </AuthLayout>
  );
}

function NewPasswordForm() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const save = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await updatePassword(password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    }
  });

  return (
    <AuthLayout title={t('auth.newPasswordTitle')} subtitle={t('auth.passwordHint')}>
      <PasswordField control={control} name="password" label={t('auth.newPassword')} />
      <PasswordField
        control={control}
        name="confirm"
        label={t('auth.confirmPassword')}
        onSubmit={save}
      />
      <FormError message={error} />
      <Button label={t('auth.savePassword')} loading={formState.isSubmitting} onPress={save} />
    </AuthLayout>
  );
}

function PasswordField(props: {
  control: Control<Form>;
  name: keyof Form;
  label: string;
  onSubmit?: () => void;
}) {
  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field, fieldState }) => (
        <TextField
          label={props.label}
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={props.onSubmit}
          testID={props.name}
        />
      )}
    />
  );
}
