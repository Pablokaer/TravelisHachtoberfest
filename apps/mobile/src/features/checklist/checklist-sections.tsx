import type { ChecklistResponse } from '@wayfarer/shared';
import { StyleSheet, View } from 'react-native';

import {
  MoneySection,
  PassportSection,
  PowerSection,
  PracticalSection,
  SafetySection,
  VisaSection,
  WeatherSection,
} from '@/features/checklist/sections';
import { spacing } from '@/theme/colors';
import { useBreakpoint } from '@/theme/use-theme';

/**
 * Every Before you go section card, in one column on phones and two balanced columns from
 * tablet width. Used by the checklist page and the city page (D-033).
 * @example <ChecklistSections data={checklist.data} units="metric" />
 */
export function ChecklistSections({
  data,
  units,
}: {
  data: ChecklistResponse;
  units: 'metric' | 'imperial';
}) {
  const { isTablet } = useBreakpoint();
  const sections = [
    <VisaSection key="visa" data={data.visa} />,
    <PassportSection key="passport" data={data.passport} />,
    <WeatherSection key="weather" data={data.weather} units={units} />,
    <PowerSection key="power" data={data.power} />,
    <MoneySection key="money" data={data.money} />,
    <SafetySection key="safety" data={data.safety} />,
    <PracticalSection key="practical" data={data.practical} />,
  ];
  if (!isTablet) return <View style={styles.column}>{sections}</View>;
  return (
    <View style={styles.columns}>
      {[0, 1].map((col) => (
        <View key={col} style={styles.column}>
          {sections.filter((_, i) => i % 2 === col)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  column: { flex: 1, gap: spacing.md },
});
