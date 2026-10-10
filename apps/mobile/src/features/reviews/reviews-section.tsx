// The Reviews section of an attraction (D-028), a city or a walk list (D-034): summary, reviews
// per star, the user's own review form and every published review, newest first.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { centring, useCentredOnPhone } from '@/components/phone-centring';
import { Section } from '@/components/screen';
import { LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import {
  useDeleteReview,
  useRatingSummary,
  useReviews,
  useSaveReview,
  type Review,
  type ReviewTarget,
} from '@/features/reviews/api';
import { RatingSummaryLine, ReviewCard } from '@/features/reviews/components';
import { RatingDistribution } from '@/features/reviews/rating-distribution';
import { ReviewForm } from '@/features/reviews/review-form';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** The signed-in user's review form, wired to save and delete. */
function OwnReview({ target, own }: { target: ReviewTarget; own: Review | undefined }) {
  const { t } = useTranslation();
  const save = useSaveReview(target);
  const remove = useDeleteReview(target);
  const [saved, setSaved] = useState(false);
  const centred = useCentredOnPhone();
  const error = save.error ?? remove.error;
  return (
    <View style={styles.list}>
      <ReviewForm
        // Remounts with the server's values once a review is published, edited or deleted.
        key={own ? `${own.id}:${own.updatedAt}` : 'new'}
        initial={own ? { rating: own.rating, comment: own.comment ?? '' } : null}
        onSave={(form) => save.mutate(form, { onSuccess: () => setSaved(true) })}
        onDelete={() => own && remove.mutate(own.id, { onSuccess: () => setSaved(false) })}
        saving={save.isPending}
        deleting={remove.isPending}
        error={error ? t('errors.generic') : null}
        kind={target.kind}
      />
      {saved && own ? (
        <Text
          variant="helper"
          secondary
          accessibilityLiveRegion="polite"
          style={centred && centring.text}>
          {t('reviews.saved')}
        </Text>
      ) : null}
    </View>
  );
}

/** Every review, separated by hairlines, or an invitation to write the first one. */
function ReviewList({ reviews, kind }: { reviews: Review[]; kind: ReviewTarget['kind'] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const centred = useCentredOnPhone();
  if (reviews.length === 0) {
    return (
      <Text secondary style={centred && centring.text}>
        {t('reviews.noneBody', { context: kind })}
      </Text>
    );
  }
  return (
    <View>
      {reviews.map((review, i) => (
        <View
          key={review.id}
          style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border }}>
          <ReviewCard review={review} />
        </View>
      ))}
    </View>
  );
}

/**
 * Reviews of one target: average and count, reviews per star, the user's review form (unless
 * `canReview` is false, e.g. on the owner's own walk list), then the list.
 * @example <ReviewsSection target={{ kind: 'city', id: city.slug }} />
 */
export function ReviewsSection({
  target,
  canReview = true,
}: {
  target: ReviewTarget;
  canReview?: boolean;
}) {
  const { t } = useTranslation();
  const reviews = useReviews(target);
  const summary = useRatingSummary(target);
  const own = reviews.data?.find((r) => r.isOwn);
  const distribution = summary.data?.count ? summary.data.distribution : undefined;
  const centred = useCentredOnPhone();
  return (
    <Section title={t('reviews.title')}>
      {summary.data ? (
        <RatingSummaryLine
          summary={summary.data}
          variant="heading"
          style={centred && centring.text}
        />
      ) : null}
      {distribution ? <RatingDistribution distribution={distribution} /> : null}
      {canReview ? (
        <OwnReview target={target} own={own} />
      ) : (
        <Text secondary style={centred && centring.text}>
          {t('reviews.ownTrip')}
        </Text>
      )}
      {reviews.isPending ? <LoadingState /> : null}
      {reviews.error ? (
        <Text secondary style={centred && centring.text}>
          {t('reviews.error')}
        </Text>
      ) : null}
      {reviews.data ? <ReviewList reviews={reviews.data} kind={target.kind} /> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
});
