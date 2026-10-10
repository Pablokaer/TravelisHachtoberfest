// How many reviews gave each number of stars (D-034): one bar per star, 5 stars first.
import { REVIEW_RATING_MAX } from '@wayfarer/shared';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { centring, useCentredOnPhone } from '@/components/phone-centring';
import { Text } from '@/components/text';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const STARS_DESCENDING = Array.from({ length: REVIEW_RATING_MAX }, (_, i) => REVIEW_RATING_MAX - i);

function DistributionBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const share = total ? count / total : 0;
  return (
    <View
      accessible
      accessibilityLabel={`${t('reviews.stars', { count: stars })}: ${t('reviews.reviewCount', { count })}`}
      testID={`rating-bar-${stars}`}
      style={styles.row}>
      <Text variant="caption" secondary style={styles.label}>
        {stars} <Text style={{ color: theme.star }}>★</Text>
      </Text>
      <View style={[styles.track, { backgroundColor: theme.surfaceMuted }]}>
        <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: theme.star }]} />
      </View>
      <Text variant="caption" secondary style={styles.count}>
        {count}
      </Text>
    </View>
  );
}

/**
 * Bars for the reviews per star; `distribution[0]` is 1 star … `[4]` is 5 stars.
 * @example <RatingDistribution distribution={[0, 0, 1, 3, 9]} />
 */
export function RatingDistribution({ distribution }: { distribution: readonly number[] }) {
  const total = distribution.reduce((sum, n) => sum + n, 0);
  const centred = useCentredOnPhone();
  return (
    <View testID="rating-distribution" style={[styles.list, centred && centring.block]}>
      {STARS_DESCENDING.map((stars) => (
        <DistributionBar
          key={stars}
          stars={stars}
          count={distribution[stars - 1] ?? 0}
          total={total}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs, maxWidth: 420 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { width: 32 },
  track: { flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  count: { minWidth: 28, textAlign: 'right' },
});
