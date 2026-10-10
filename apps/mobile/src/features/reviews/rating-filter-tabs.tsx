import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RATING_FILTER_OPTIONS } from './rating-filter';

import { Text } from '@/components/text';
import { FilterTab } from '@/features/destinations/components';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * "★ 3+ / 4+ / 5+" tabs after the category tabs, set apart by a thin divider. One at a time;
 * pressing the active one again shows every place.
 * @example <RatingFilterTabs value={minRating} onChange={setMinRating} />
 */
export function RatingFilterTabs({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (minRating: number | null) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('explore.ratingFilter')}
      style={styles.group}>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      {RATING_FILTER_OPTIONS.map((min) => (
        <FilterTab
          key={min}
          role="radio"
          label={`${min}+`}
          accessibilityLabel={t('explore.minRating', { count: min })}
          // Gold like every other star in the app; the label carries the active state.
          icon={() => <Text style={[styles.star, { color: theme.star }]}>★</Text>}
          selected={value === min}
          onPress={() => onChange(value === min ? null : min)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', gap: spacing.md },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginBottom: spacing.sm },
  // Same box as the 20 px category icons, so labels line up across the row.
  star: { fontSize: 18, lineHeight: 20, height: 20 },
});
