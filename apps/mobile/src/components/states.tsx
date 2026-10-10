import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';

import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

export function LoadingState({ label }: { label?: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View
      style={[styles.center, { backgroundColor: theme.background }]}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('common.loading')}>
      <ActivityIndicator color={theme.primary} size="large" />
      <Text variant="caption" secondary style={styles.text}>
        {label ?? t('common.loading')}
      </Text>
    </View>
  );
}

/** Circular icon medallion used by empty and error states. */
function Medallion({ icon, color }: { icon: IconName; color?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.medallion, { backgroundColor: theme.surfaceMuted }]}>
      <Icon name={icon} size={28} color={color ?? theme.text} />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Medallion icon="error" color={theme.danger} />
      <Text style={[styles.text, styles.narrow]}>{message ?? t('errors.generic')}</Text>
      {onRetry ? (
        <Button label={t('common.retry')} variant="secondary" compact onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon = 'map',
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon?: IconName;
}) {
  return (
    <View style={styles.center}>
      <Medallion icon={icon} />
      <View style={[styles.copy, styles.narrow]}>
        <Text variant="heading" style={styles.text}>
          {title}
        </Text>
        {body ? (
          <Text secondary style={styles.text}>
            {body}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  medallion: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { gap: spacing.sm },
  narrow: { maxWidth: 360 },
  text: { textAlign: 'center' },
});
