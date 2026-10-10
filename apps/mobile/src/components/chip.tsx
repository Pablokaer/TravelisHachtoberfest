import { StyleSheet } from 'react-native';

import { Icon, type IconName } from './icon';
import { Tappable } from './tappable';
import { Text } from './text';

import { MIN_TOUCH, radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  icon?: IconName;
};

export function Chip({ label, selected, onPress, onRemove, icon }: Props) {
  const theme = useTheme();
  const handler = onRemove ?? onPress;
  const fg = selected ? theme.onPrimary : theme.text;
  return (
    <Tappable
      onPress={handler}
      accessibilityRole={onRemove ? 'button' : 'checkbox'}
      accessibilityLabel={label}
      accessibilityState={onRemove ? undefined : { checked: !!selected }}
      hitSlop={6}
      pressScale={0.95}
      style={({ hovered, pressed }) => [
        styles.chip,
        {
          backgroundColor: selected
            ? theme.primary
            : hovered || pressed
              ? theme.surfaceMuted
              : theme.surface,
          borderColor: selected ? theme.primary : hovered ? theme.text : theme.borderStrong,
        },
      ]}>
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text variant="label" style={{ color: fg }}>
        {label}
      </Text>
      {onRemove ? <Icon name="close" size={14} color={fg} /> : null}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
});
