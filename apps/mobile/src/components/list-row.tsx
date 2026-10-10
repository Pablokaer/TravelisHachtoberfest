import { Children, Fragment, isValidElement, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Tappable } from './tappable';
import { Text } from './text';

import { MIN_TOUCH, radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

type Props = {
  label: string;
  value?: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
  role?: 'button' | 'radio' | 'link';
  icon?: IconName;
  /** Opens outside the app: shows an external-link glyph instead of a chevron. */
  external?: boolean;
};

/** A settings-style row. Place rows inside a `RowGroup` for the grouped card look. */
export function ListRow({
  label,
  value,
  selected,
  onPress,
  accessibilityHint,
  role = 'button',
  icon,
  external,
}: Props) {
  const theme = useTheme();
  return (
    <Tappable
      onPress={onPress}
      disabled={!onPress}
      pressScale={1}
      accessibilityRole={role}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={role === 'radio' ? { checked: !!selected } : undefined}
      style={({ pressed, hovered }) => [
        styles.row,
        { backgroundColor: pressed || hovered ? theme.surfaceMuted : 'transparent' },
      ]}>
      {icon ? (
        <View style={[styles.iconTile, { backgroundColor: theme.surfaceMuted }]}>
          <Icon name={icon} size={18} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant={value ? 'caption' : 'body'} secondary={!!value}>
          {label}
        </Text>
        {value ? <Text style={styles.value}>{value}</Text> : null}
      </View>
      {role === 'radio' ? (
        <View
          style={[
            styles.radio,
            { borderColor: selected ? theme.primary : theme.borderStrong },
            selected && { borderWidth: 6 },
          ]}
          importantForAccessibility="no"
        />
      ) : onPress ? (
        <Icon name={external ? 'external' : 'chevronRight'} size={16} color={theme.textSecondary} />
      ) : null}
    </Tappable>
  );
}

/** Groups rows into a single rounded card with hairline dividers. */
export function RowGroup({ children }: PropsWithChildren) {
  const theme = useTheme();
  const shadows = useShadows();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={[
        styles.group,
        { backgroundColor: theme.surface, borderColor: theme.border, boxShadow: shadows.card },
      ]}>
      {items.map((child, i) => (
        <Fragment key={child.key ?? i}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xxs },
  value: { fontWeight: '500' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md },
});
