import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Badge } from '@/components/card';
import { categoryIcon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import {
  localizedName,
  useAttraction,
  type AttractionDetail,
  type AttractionSummary,
} from '@/features/destinations/api';
import {
  AttractionAbout,
  AttractionDetailsSkeleton,
  AttractionLinks,
} from '@/features/destinations/attraction-details';
import { routeNotice } from '@/features/route/notice';
import { useRatingSummary } from '@/features/reviews/api';
import { RatingSummaryLine } from '@/features/reviews/components';
import { ReviewsSection } from '@/features/reviews/reviews-section';
import { useRouteStore } from '@/features/route/store';
import { radius, spacing } from '@/theme/colors';
import { useBreakpoint } from '@/theme/use-theme';

/**
 * An attraction's page (`/attraction/[id]`). Opened from a city list, the header (photo, name,
 * category, visit time) shows at once from the cached list row; the rest has a skeleton until
 * its full row arrives (D-062).
 */
export default function AttractionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const attraction = useAttraction(id);
  const inRoute = useRouteStore((s) => s.stops.some((x) => x.id === id));
  const toggle = useRouteStore((s) => s.toggle);
  const [notice, setNotice] = useState<string | null>(null);

  if (attraction.isPending) return <LoadingState />;
  if (attraction.isError) return <ErrorState onRetry={() => attraction.refetch()} />;
  const { summary: a, detail } = attraction.data;
  const toggleRoute = () => {
    setNotice(routeNotice(toggle(detail ?? a), t));
  };

  return (
    <Screen
      edges={['left', 'right']}
      footer={<VisitFooter a={a} inRoute={inRoute} notice={notice} onToggleRoute={toggleRoute} />}>
      <AttractionHeader a={a} detail={detail} />
      {detail ? <AttractionAbout a={detail} /> : <AttractionDetailsSkeleton />}
      <ReviewsSection target={{ kind: 'attraction', id: a.id }} />
      {detail ? <AttractionLinks a={detail} /> : null}
      <Text variant="helper" secondary>
        {t('attraction.dataCredit')}
      </Text>
    </Screen>
  );
}

/** Visit time, the route notice and Add / Remove from the route. */
function VisitFooter({
  a,
  inRoute,
  notice,
  onToggleRoute,
}: {
  a: AttractionSummary;
  inRoute: boolean;
  notice: string | null;
  onToggleRoute: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.footerText}>
        <Text variant="subtitle">
          {t('attraction.visitMinutes', { minutes: a.avgVisitMinutes })}
        </Text>
        {notice ? (
          <Text variant="helper" secondary accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : (
          <Text variant="helper" secondary numberOfLines={1}>
            {t('attraction.visitTime')}
          </Text>
        )}
      </View>
      <Button
        label={inRoute ? t('route.removeStop') : t('route.addStop')}
        variant={inRoute ? 'secondary' : 'primary'}
        onPress={onToggleRoute}
        testID="toggle-route"
      />
    </>
  );
}

/** Photo with its credit (once the full row has it), name, rating and badges. */
function AttractionHeader({
  a,
  detail,
}: {
  a: AttractionSummary;
  detail: AttractionDetail | null;
}) {
  const { t, i18n } = useTranslation();
  const name = localizedName(a, i18n.resolvedLanguage ?? 'en');
  const { isTablet } = useBreakpoint();
  const rating = useRatingSummary({ kind: 'attraction', id: a.id });
  return (
    <>
      <Stack.Screen options={{ title: name }} />
      {a.imageUrl ? (
        <View style={styles.hero}>
          <Image
            source={a.imageUrl}
            style={styles.image}
            contentFit="cover"
            accessibilityLabel={t('attraction.photoOf', { name })}
            transition={200}
          />
          {/* Same height before the credit is known, so nothing jumps when it arrives. */}
          <Text variant="helper" secondary>
            {detail
              ? t('attraction.photoCredit', {
                  author: detail.imageAuthor ?? t('attraction.unknownAuthor'),
                  license: detail.imageLicense ?? '',
                })
              : ' '}
          </Text>
        </View>
      ) : null}

      <View
        style={[styles.titleBlock, !isTablet && styles.titleBlockPhone]}
        testID="attraction-title">
        <Text variant="display" style={!isTablet && styles.centerText}>
          {name}
        </Text>
        {rating.data ? <RatingSummaryLine summary={rating.data} /> : null}
        <View style={[styles.badges, !isTablet && styles.badgesPhone]}>
          <Badge icon={categoryIcon(a.category)} label={t(`category.${a.category}`)} />
          {a.isUnesco ? <Badge icon="globe" label={t('attraction.unesco')} /> : null}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm },
  image: { width: '100%', aspectRatio: 16 / 10, maxHeight: 460, borderRadius: radius.xl },
  titleBlockPhone: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  badgesPhone: { justifyContent: 'center' },
  titleBlock: { gap: spacing.md - 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footerText: { flex: 1, gap: spacing.xxs },
});
