import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema } from '@wayfarer/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { NicknameLockedError, signInWithLogin } from '@/features/auth/api';
import {
  AuthFooter,
  AuthLayout,
  FormError,
  OAuthButtons,
  TextLink,
} from '@/features/auth/components';

type Form = z.infer<typeof signInSchema>;

export default function SignInScreen() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(signInSchema),
    defaultValues: { login: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ login, password }) => {
    setError(null);
    try {
      await signInWithLogin(login, password);
    } catch (e) {
      if (e instanceof NicknameLockedError) setError(t('auth.nicknameLocked'));
      else setError(e instanceof Error ? e.message : t('errors.generic'));
    }
  });

  return (
    <AuthLayout
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
      footer={<AuthFooter />}>
      <Controller
        control={control}
        name="login"
        render={({ field, fieldState }) => (
          // Email or nickname (D-048). The testID stays "email" for existing E2E helpers.
          <TextField
            label={t('auth.login')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoCapitalize="none"
            autoCorrect={false}
            icon="mail"
            autoComplete="username"
            textContentType="username"
            testID="email"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            label={t('auth.password')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={onSubmit}
            testID="password"
          />
        )}
      />
      <TextLink href="/forgot-password" label={t('auth.forgotPassword')} />
      <FormError message={error} />
      <Button label={t('auth.signIn')} loading={formState.isSubmitting} onPress={onSubmit} />
      <TextLink href="/magic-link" label={t('auth.useMagicLink')} />
      <OAuthButtons onError={setError} />
      <TextLink href="/sign-up" label={t('auth.noAccount')} />
    </AuthLayout>
  );
}
