import { zodResolver } from '@hookform/resolvers/zod';
import { passwordResetRequestSchema } from '@wayfarer/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { AuthLayout, FormError, TextLink } from '@/features/auth/components';
import { requestPasswordReset } from '@/features/auth/recovery-api';

type Form = z.infer<typeof passwordResetRequestSchema>;

/** "Forgot password?" (D-066): emails a reset link; the confirmation never reveals accounts. */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: '' },
  });

  const send = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await requestPasswordReset(email);
      setSentTo(email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    }
  });

  return (
    <AuthLayout
      title={t('auth.forgotPasswordTitle')}
      subtitle={
        sentTo ? t('auth.resetLinkSent', { email: sentTo }) : t('auth.forgotPasswordSubtitle')
      }>
      {sentTo ? null : (
        <>
          <Controller
            control={control}
            name="email"
            render={({ field, fieldState }) => (
              <TextField
                label={t('auth.email')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                autoCapitalize="none"
                autoCorrect={false}
                icon="mail"
                autoComplete="email"
                keyboardType="email-address"
                onSubmitEditing={send}
                testID="email"
              />
            )}
          />
          <FormError message={error} />
          <Button label={t('auth.sendResetLink')} loading={formState.isSubmitting} onPress={send} />
        </>
      )}
      <TextLink href="/sign-in" label={t('auth.backToSignIn')} />
    </AuthLayout>
  );
}
