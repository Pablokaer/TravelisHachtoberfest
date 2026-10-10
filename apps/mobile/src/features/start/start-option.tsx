// One big answer of the first question (D-079): an icon, a title and a line of explanation.
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

type Props = { icon: IconName; title: string; body: string; onPress: () => void; testID?: string };

/**
 * @example <StartOption icon="pin" title="My city" body="Use your location…" onPress={go} />
 */
export function StartOption({ icon, title, body, onPress, testID }: Props) {
  const theme = useTheme();
  const shadows = useShadows();
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      testID={testID}
      style={[
        styles.option,
        { backgroundColor: theme.surface, borderColor: theme.border, boxShadow: shadows.card },
      ]}>
      <View style={[styles.badge, { backgroundColor: theme.surfaceMuted }]}>
        <Icon name={icon} size={32} color={theme.primary} />
      </View>
      <View style={styles.text}>
        <Text variant="heading">{title}</Text>
        <Text secondary>{body}</Text>
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xs },
});
