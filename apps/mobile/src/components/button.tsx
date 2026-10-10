import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Tappable, type TappableProps } from './tappable';
import { Text } from './text';

import { MIN_TOUCH, radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

type Props = Omit<TappableProps, 'children'> & {
  label: string;
  /** primary – the one main action · secondary – outlined · ghost – quiet text action · danger – destructive. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  compact?: boolean;
  icon?: IconName;
};

export function Button({
  label,
  variant = 'primary',
  loading,
  disabled,
  compact,
  icon,
  style,
  accessibilityLabel,
  ...rest
}: Props) {
  const theme = useTheme();
  const shadows = useShadows();
  const isDisabled = disabled || loading;
  const filled = variant === 'primary' || variant === 'danger';
  const fg = filled ? theme.onPrimary : theme.text;

  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      pressScale={variant === 'ghost' ? 1 : 0.97}
      style={(state) => [
        styles.base,
        compact && styles.compact,
        variant === 'primary' && {
          backgroundColor: state.pressed || state.hovered ? theme.primaryPressed : theme.primary,
          boxShadow: state.hovered ? shadows.card : undefined,
        },
        variant === 'danger' && { backgroundColor: theme.danger },
        variant === 'secondary' && {
          backgroundColor: state.hovered || state.pressed ? theme.surfaceMuted : theme.surface,
          borderColor: state.hovered ? theme.text : theme.borderStrong,
        },
        variant === 'ghost' && {
          backgroundColor: state.hovered || state.pressed ? theme.surfaceMuted : 'transparent',
        },
        isDisabled && !loading && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <View style={[styles.content, loading && styles.hidden]}>
        {icon ? <Icon name={icon} size={compact ? 16 : 18} color={fg} /> : null}
        <Text
          variant="label"
          style={[styles.label, !compact && styles.labelLarge, { color: fg }]}
          numberOfLines={1}>
          {label}
        </Text>
      </View>
      {loading ? <ActivityIndicator color={fg} style={StyleSheet.absoluteFill} /> : null}
    </Tappable>
  );
}

/** Circular icon-only action (close, reorder, remove…). */
export function IconButton({
  icon,
  accessibilityLabel,
  variant = 'plain',
  size = 18,
  disabled,
  style,
  color,
  ...rest
}: Omit<TappableProps, 'children'> & {
  icon: IconName;
  accessibilityLabel: string;
  variant?: 'plain' | 'outlined' | 'elevated';
  size?: number;
  color?: string;
}) {
  const theme = useTheme();
  const shadows = useShadows();
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      pressScale={0.92}
      style={(state) => [
        styles.icon,
        {
          backgroundColor:
            state.hovered || state.pressed
              ? theme.surfaceMuted
              : variant === 'plain'
                ? 'transparent'
                : theme.surface,
          borderColor: variant === 'outlined' ? theme.borderStrong : 'transparent',
          boxShadow: variant === 'elevated' ? shadows.card : undefined,
        },
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <Icon name={icon} size={size} color={color ?? theme.text} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: MIN_TOUCH - 4, paddingHorizontal: spacing.md, borderRadius: radius.sm + 2 },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hidden: { opacity: 0 },
  label: { textAlign: 'center' },
  labelLarge: { fontSize: 16, lineHeight: 22 },
  disabled: { opacity: 0.4 },
  icon: {
    width: MIN_TOUCH - 4,
    height: MIN_TOUCH - 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
