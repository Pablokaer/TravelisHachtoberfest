import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Tappable } from './tappable';
import { Text } from './text';

import { MIN_TOUCH, radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

type Option<T extends string> = { value: T; label: string; icon?: IconName };

/** Pill-shaped single-choice control (radio group). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  floating,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** Adds the floating shadow used over maps and lists. */
  floating?: boolean;
}) {
  const theme = useTheme();
  const shadows = useShadows();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.group,
        {
          backgroundColor: floating ? theme.surface : theme.surfaceMuted,
          borderColor: theme.border,
          boxShadow: floating ? shadows.floating : undefined,
        },
      ]}>
      {options.map((o) => {
        const selected = o.value === value;
        const fg = selected ? theme.onPrimary : theme.text;
        return (
          <Tappable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            pressScale={0.95}
            style={({ hovered }) => [
              styles.option,
              {
                backgroundColor: selected
                  ? theme.primary
                  : hovered
                    ? theme.surfaceMuted
                    : 'transparent',
              },
            ]}>
            {o.icon ? <Icon name={o.icon} size={16} color={fg} /> : null}
            <Text variant="label" style={{ color: fg }}>
              {o.label}
            </Text>
          </Tappable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignSelf: 'center',
    padding: spacing.xs,
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    minHeight: MIN_TOUCH - 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
});
