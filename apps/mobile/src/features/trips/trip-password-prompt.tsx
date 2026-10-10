// Asks a visitor for the password of a protected walk list (D-031). The password is only kept
// in the screen's state: it is never stored on the device.
import { TRIP_PASSWORD_MAX } from '@wayfarer/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { FormError } from '@/features/auth/components';
import { spacing } from '@/theme/colors';

type Props = {
  onSubmit: (password: string) => void;
  /** The last password tried was refused. */
  wrong?: boolean;
  checking?: boolean;
};

/**
 * @example <TripPasswordPrompt wrong={status === 'wrong_password'} onSubmit={setPassword} />
 */
export function TripPasswordPrompt({ onSubmit, wrong, checking }: Props) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const submit = () => {
    if (password !== '') onSubmit(password);
  };
  return (
    <Card testID="trip-password-prompt">
      <Text variant="subtitle">{t('sharing.protectedTitle')}</Text>
      <Text secondary>{t('sharing.protectedBody')}</Text>
      <TextField
        label={t('sharing.password')}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
        maxLength={TRIP_PASSWORD_MAX}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="off"
        testID="shared-trip-password"
      />
      <FormError message={wrong ? t('sharing.wrongPassword') : null} />
      <View style={styles.actions}>
        <Button
          label={t('sharing.open')}
          loading={checking}
          onPress={submit}
          testID="open-shared-trip"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
});
