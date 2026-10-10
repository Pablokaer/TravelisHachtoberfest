// The owner's "Who can see this list" card on a trip (D-031): private, public or password,
// and the share button once the saved visibility lets others open the link.
import { zodResolver } from '@hookform/resolvers/zod';
import {
  TRIP_PASSWORD_MAX,
  TRIP_VISIBILITIES,
  tripVisibilityFormSchema,
  type TripVisibility,
  type TripVisibilityForm,
} from '@wayfarer/shared';
import { useMemo } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import type { IconName } from '@/components/icon';
import { Card } from '@/components/card';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { FormError } from '@/features/auth/components';
import type { ShareOutcome } from '@/features/trips/share-link';
import { spacing } from '@/theme/colors';

const VISIBILITY_ICONS: Record<TripVisibility, IconName> = {
  private: 'lock',
  public: 'globe',
  password: 'key',
};

/**
 * How My Trips marks a list others can open (private lists get no badge). `label` is an i18n key.
 * @example visibilityBadge('public') // { icon: 'globe', label: 'sharing.visibility.public' }
 */
export function visibilityBadge(v: TripVisibility): { icon: IconName; label: string } | null {
  return v === 'private' ? null : { icon: VISIBILITY_ICONS[v], label: `sharing.visibility.${v}` };
}

type Props = {
  /** The saved visibility; 'password' means the trip already has a password. */
  visibility: TripVisibility;
  onSave: (form: TripVisibilityForm) => void;
  onShare: () => void;
  saving?: boolean;
  error?: string | null;
  /** What the last share did ('copied' shows "Link copied."), or 'failed'. */
  shareNotice?: ShareOutcome | 'failed' | null;
};

function PasswordField({
  control,
  hasPassword,
}: {
  control: Control<TripVisibilityForm>;
  hasPassword: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Controller
      control={control}
      name="password"
      render={({ field, fieldState }) => (
        <TextField
          label={t('sharing.password')}
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          hint={hasPassword ? t('sharing.keepPassword') : t('sharing.passwordHint')}
          maxLength={TRIP_PASSWORD_MAX}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="off"
          testID="trip-password"
        />
      )}
    />
  );
}

function ShareRow({ onShare, notice }: { onShare: () => void; notice: Props['shareNotice'] }) {
  const { t } = useTranslation();
  return (
    <View style={styles.actions}>
      <Button
        variant="secondary"
        icon="share"
        label={t('sharing.share')}
        onPress={onShare}
        testID="share-trip"
      />
      {notice === 'copied' ? (
        <Text variant="caption" accessibilityLiveRegion="polite">
          {t('sharing.copied')}
        </Text>
      ) : null}
      {notice === 'failed' ? <FormError message={t('sharing.shareFailed')} /> : null}
    </View>
  );
}

/**
 * @example <VisibilityEditor visibility={trip.visibility} onSave={save.mutate} onShare={share} />
 */
export function VisibilityEditor({
  visibility,
  onSave,
  onShare,
  saving,
  error,
  shareNotice,
}: Props) {
  const { t } = useTranslation();
  const hasPassword = visibility === 'password';
  const schema = useMemo(() => tripVisibilityFormSchema(hasPassword), [hasPassword]);
  const { control, handleSubmit } = useForm<TripVisibilityForm>({
    resolver: zodResolver(schema),
    values: { visibility, password: '' },
  });
  const chosen = useWatch({ control, name: 'visibility' });
  const options = TRIP_VISIBILITIES.map((v) => ({
    value: v,
    label: t(`sharing.visibility.${v}`),
    icon: VISIBILITY_ICONS[v],
  }));

  return (
    <Card testID="trip-visibility">
      <Text variant="subtitle">{t('sharing.visibilityTitle')}</Text>
      <Controller
        control={control}
        name="visibility"
        render={({ field }) => (
          <Segmented
            options={options}
            value={field.value}
            onChange={field.onChange}
            accessibilityLabel={t('sharing.visibilityLabel')}
          />
        )}
      />
      <Text secondary>{t(`sharing.hint.${chosen}`)}</Text>
      {chosen === 'password' ? <PasswordField control={control} hasPassword={hasPassword} /> : null}
      <FormError message={error ?? null} />
      <View style={styles.actions}>
        <Button
          label={t('sharing.save')}
          loading={saving}
          onPress={handleSubmit(onSave)}
          testID="save-visibility"
        />
      </View>
      {visibility === 'private' ? null : <ShareRow onShare={onShare} notice={shareNotice} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
