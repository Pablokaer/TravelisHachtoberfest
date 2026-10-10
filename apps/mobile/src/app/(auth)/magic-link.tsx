import { zodResolver } from '@hookform/resolvers/zod';
import { magicLinkSchema, otpSchema } from '@wayfarer/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { sendMagicLink, verifyEmailCode } from '@/features/auth/api';
import { AuthLayout, FormError, TextLink } from '@/features/auth/components';

export default function MagicLinkScreen() {
  const { t } = useTranslation();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emailForm = useForm<z.infer<typeof magicLinkSchema>>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: '' },
  });
  const codeForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
  });

  const send = emailForm.handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await sendMagicLink(email.trim());
      setSentTo(email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    }
  });

  const verify = codeForm.handleSubmit(async ({ code }) => {
    setError(null);
    try {
      await verifyEmailCode(sentTo!, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    }
  });

  return (
    <AuthLayout
      title={t('auth.magicLinkTitle')}
      subtitle={sentTo ? t('auth.magicLinkSent', { email: sentTo }) : t('auth.magicLinkSubtitle')}>
      {!sentTo ? (
        <>
          <Controller
            control={emailForm.control}
            name="email"
            render={({ field, fieldState }) => (
              <TextField
                label={t('auth.email')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                autoCapitalize="none"
                icon="mail"
                autoComplete="email"
                keyboardType="email-address"
                onSubmitEditing={send}
                testID="email"
              />
            )}
          />
          <FormError message={error} />
          <Button
            label={t('auth.sendLink')}
            loading={emailForm.formState.isSubmitting}
            onPress={send}
          />
        </>
      ) : (
        <>
          <Controller
            control={codeForm.control}
            name="code"
            render={({ field, fieldState }) => (
              <TextField
                label={t('auth.code')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                onSubmitEditing={verify}
                testID="code"
              />
            )}
          />
          <FormError message={error} />
          <Button
            label={t('auth.verifyCode')}
            loading={codeForm.formState.isSubmitting}
            onPress={verify}
          />
          <Button
            variant="ghost"
            label={t('auth.useAnotherEmail')}
            onPress={() => setSentTo(null)}
          />
        </>
      )}
      <TextLink href="/sign-in" label={t('auth.backToSignIn')} />
    </AuthLayout>
  );
}
