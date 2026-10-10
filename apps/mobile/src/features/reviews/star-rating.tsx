// Five-star controls for reviews (D-028). Stars are the ★ glyph in gold (filled, `theme.star`)
// or the strong border colour (empty): one glyph renders the same on web, iOS and Android.
import { REVIEW_RATING_MAX } from '@wayfarer/shared';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { MIN_TOUCH } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const STAR_VALUES = Array.from({ length: REVIEW_RATING_MAX }, (_, i) => i + 1);

function StarGlyph({ filled, size }: { filled: boolean; size: number }) {
  const theme = useTheme();
  return (
    <Text
      aria-hidden
      testID={filled ? 'star-glyph-filled' : 'star-glyph-empty'}
      style={{
        fontSize: size,
        lineHeight: size * 1.15,
        color: filled ? theme.star : theme.borderStrong,
      }}>
      ★
    </Text>
  );
}

/**
 * Picks a whole rating from 1 to 5: five pressable stars, announced as a radio group.
 * @example <StarRating value={rating} onChange={setRating} />
 */
export function StarRating({
  value,
  onChange,
  style,
}: {
  value: number;
  onChange: (v: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('reviews.pickRating')}
      testID="star-rating"
      style={[styles.row, style]}>
      {STAR_VALUES.map((star) => (
        <Tappable
          key={star}
          accessibilityRole="radio"
          accessibilityLabel={t('reviews.stars', { count: star })}
          accessibilityState={{ checked: star === value }}
          onPress={() => onChange(star)}
          pressScale={0.85}
          testID={`star-${star}`}
          style={styles.touch}>
          <StarGlyph filled={star <= value} size={32} />
        </Tappable>
      ))}
    </View>
  );
}

/**
 * Read-only stars for a rating, with a spoken "Rated 4 out of 5".
 * @example <Stars rating={4} />
 */
export function Stars({
  rating,
  size = 14,
  style,
  testID,
}: {
  rating: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityLabel={t('reviews.ratingLabel', { rating })}
      testID={testID}
      style={[styles.row, style]}>
      {STAR_VALUES.map((star) => (
        <StarGlyph key={star} filled={star <= rating} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  touch: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
