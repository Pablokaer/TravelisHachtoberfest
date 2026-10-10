import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

import { radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

/** Static content container: white surface, generous radius, soft shadow. */
export function Card({
  children,
  style,
  muted,
  testID,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; muted?: boolean; testID?: string }>) {
  const theme = useTheme();
  const shadows = useShadows();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        muted
          ? { backgroundColor: theme.surfaceMuted, borderColor: 'transparent' }
          : { backgroundColor: theme.surface, borderColor: theme.border, boxShadow: shadows.card },
        style,
      ]}>
      {children}
    </View>
  );
}

/** Small key figure: icon, label and value on a muted tile. */
export function StatTile({
  icon,
  label,
  value,
  testID,
}: {
  icon: IconName;
  label: string;
  value: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[styles.stat, { backgroundColor: theme.surfaceMuted }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
      testID={testID}>
      <Icon name={icon} size={18} color={theme.textSecondary} />
      <Text variant="helper" secondary>
        {label}
      </Text>
      <Text variant="subtitle">{value}</Text>
    </View>
  );
}

/** Compact pill for status and metadata ("UNESCO", "3 stops"). */
export function Badge({
  label,
  icon,
  tone = 'neutral',
  style,
  testID,
}: {
  label: string;
  icon?: IconName;
  tone?: 'neutral' | 'accent' | 'overlay';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  const bg = { neutral: theme.surfaceMuted, accent: theme.primary, overlay: theme.surface }[tone];
  const fg = tone === 'accent' ? theme.onPrimary : theme.text;
  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: bg }, tone === 'overlay' && styles.overlay, style]}>
      {icon ? <Icon name={icon} size={12} color={fg} /> : null}
      <Text variant="helper" style={{ color: fg, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg - 4,
    gap: spacing.md - 4,
  },
  stat: {
    flexGrow: 1,
    flexBasis: 120,
    borderRadius: radius.md,
    padding: spacing.md - 2,
    gap: spacing.xxs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  overlay: { boxShadow: '0px 1px 4px rgba(0,0,0,0.18)' },
});
