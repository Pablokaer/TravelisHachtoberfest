// Read-only review pieces (D-028): the "4.6 ★ · 128 reviews" line and one review card.
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/card';
import { centring, useCentredOnPhone } from '@/components/phone-centring';
import { Text } from '@/components/text';
import { AuthorName } from '@/features/profile/author-name';
import type { RatingSummary, Review } from '@/features/reviews/api';
import { Stars } from '@/features/reviews/star-rating';
import { formatDate, formatRating } from '@/lib/format';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** Edits within a minute of publishing are not worth an "edited" note. */
const EDIT_GRACE_MS = 60_000;

/**
 * True when a review was changed after it was published.
 * @example wasEdited(review) // false for a review never edited
 */
export function wasEdited(review: Pick<Review, 'createdAt' | 'updatedAt'>): boolean {
  return Date.parse(review.updatedAt) - Date.parse(review.createdAt) > EDIT_GRACE_MS;
}

/**
 * Renders a translated rating string with its ★ in gold and the rest in the text colour.
 * @example <GoldStar text="4.6 ★ · 128 reviews" />
 */
function GoldStar({ text }: { text: string }) {
  const theme = useTheme();
  const at = text.indexOf('★');
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <Text testID="rating-star" style={{ color: theme.star }}>
        ★
      </Text>
      {text.slice(at + 1)}
    </>
  );
}

/**
 * "4.6 ★ · 128 reviews", or "No reviews yet".
 * @example <RatingSummaryLine summary={{ count: 128, average: 4.56 }} />
 */
export function RatingSummaryLine({
  summary,
  variant = 'subtitle',
  style,
}: {
  summary: RatingSummary;
  variant?: 'subtitle' | 'heading';
  style?: StyleProp<TextStyle>;
}) {
  const { t } = useTranslation();
  const locale = t('common.locale');
  if (summary.count === 0 || summary.average == null) {
    return (
      <Text variant="caption" secondary testID="rating-summary" style={style}>
        {t('reviews.none')}
      </Text>
    );
  }
  const values = { count: summary.count, average: formatRating(summary.average, locale) };
  return (
    <Text
      variant={variant}
      testID="rating-summary"
      style={style}
      accessibilityLabel={t('reviews.summaryLabel', values)}>
      <GoldStar text={t('reviews.summary', values)} />
    </Text>
  );
}

/**
 * The quiet "3.5 ★" beside a place's name on its card; nothing when it has no reviews.
 * @example <CardRating summary={{ count: 2, average: 3.5 }} />
 */
export function CardRating({ summary }: { summary: RatingSummary | undefined }) {
  const { t } = useTranslation();
  const label = ratingLabel(summary, t('common.locale'), t);
  if (!label) return null;
  return (
    <Text variant="caption" testID="card-rating" accessibilityLabel={label.spoken}>
      <GoldStar text={label.shown} />
    </Text>
  );
}

/**
 * What a rating shows ("3.5 ★") and says ("Rated 3.5 out of 5 from 2 reviews"); null when
 * there are no reviews.
 * @example ratingLabel({ count: 2, average: 3.5 }, 'en-GB', t)?.shown // '3.5 ★'
 */
export function ratingLabel(
  summary: RatingSummary | undefined,
  locale: string,
  t: TFunction,
): { shown: string; spoken: string } | null {
  if (!summary || summary.count === 0 || summary.average == null) return null;
  const average = formatRating(summary.average, locale);
  return {
    shown: `${average} ★`,
    spoken: t('reviews.summaryLabel', { count: summary.count, average }),
  };
}

/**
 * Author line of a review card: avatar, public name, "Your review", date. On phones the avatar
 * sits above the centred name and date (D-076).
 */
function ReviewAuthor({ review, centred }: { review: Review; centred: boolean }) {
  const { t } = useTranslation();
  const name = review.authorName ?? t('reviews.anonymous');
  const date = formatDate(review.createdAt, t('common.locale'));
  return (
    <View testID="review-author" style={[styles.author, centred && centring.stack]}>
      <Avatar name={name} uri={review.authorAvatarUrl} size={40} />
      <View style={centred ? styles.centredName : styles.flex}>
        <AuthorName name={name} publicId={review.authorPublicId} variant="subtitle" />
        <Text variant="caption" secondary style={centred && centring.text}>
          {wasEdited(review) ? `${date} · ${t('reviews.edited')}` : date}
        </Text>
      </View>
      {review.isOwn ? (
        <Badge
          label={t('reviews.yours')}
          testID="review-own-badge"
          style={centred && centring.self}
        />
      ) : null}
    </View>
  );
}

/**
 * One published review: author, stars, date and comment.
 * @example <ReviewCard review={review} />
 */
export function ReviewCard({ review }: { review: Review }) {
  const centred = useCentredOnPhone();
  return (
    <View style={styles.card} testID={`review-${review.id}`}>
      <ReviewAuthor review={review} centred={centred} />
      <Stars rating={review.rating} testID="review-stars" style={centred && centring.row} />
      {review.comment ? <Text style={centred && centring.text}>{review.comment}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.sm, paddingVertical: spacing.md },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
  centredName: { alignItems: 'center' },
});
