// A slider that moves in whole steps, 0 to `max` (D-088): a row of tappable steps that also works
// as one adjustable control for a screen reader or the keyboard (increment / decrement).
import { StyleSheet, View } from 'react-native';

import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type Props = {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
};

/**
 * @example <StepSlider label="Meals per day" value={3} max={6} onChange={setMeals} />
 */
export function StepSlider({ label, value, max, onChange }: Props) {
  const theme = useTheme();
  const move = (by: number) => {
    const next = Math.min(max, Math.max(0, value + by));
    if (next !== value) onChange(next);
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => move(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={styles.box}>
      <View style={styles.header}>
        <Text variant="label">{label}</Text>
        <Text variant="subtitle" testID={`value-${label}`}>
          {value}
        </Text>
      </View>
      <View style={styles.track}>
        {Array.from({ length: max + 1 }, (_, step) => (
          <Tappable
            key={step}
            testID={`step-${label}-${step}`}
            onPress={() => onChange(step)}
            style={[
              styles.step,
              { backgroundColor: step <= value ? theme.primary : theme.surfaceMuted },
            ]}>
            <Text
              variant="helper"
              style={{ color: step <= value ? theme.onPrimary : theme.textSecondary }}>
              {step}
            </Text>
          </Tappable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { flexDirection: 'row', gap: 2, borderRadius: radius.md, overflow: 'hidden' },
  step: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
});
