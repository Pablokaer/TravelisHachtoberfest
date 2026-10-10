// Settings → Subscription (D-047): the current plan and, for a paid plan, its price, validity
// and "Manage subscription" (the plans page until billing management arrives). Hidden, with the
// rest of the paid plans UI, while `FEATURES.paidPlans` is off (D-065).
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Section } from '@/components/screen';
import { LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { useMySubscription } from '@/features/subscription/api';
import { planName, planPrice } from '@/features/subscription/plan-text';
import { useFeatures } from '@/lib/features';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme/colors';

/**
 * @example <SubscriptionSection />
 */
export function SubscriptionSection() {
  return useFeatures().paidPlans ? <CurrentSubscription /> : null;
}

function CurrentSubscription() {
  const { t } = useTranslation();
  const subscription = useMySubscription();
  const s = subscription.data;
  const locale = t('common.locale');
  return (
    <Section title={t('plans.settingsTitle')}>
      {subscription.isPending ? <LoadingState /> : null}
      {subscription.isError ? <Text secondary>{t('errors.generic')}</Text> : null}
      {s ? (
        <View style={styles.body} testID="subscription-section">
          <Text variant="subtitle">{t('plans.currentPlan', { plan: planName(s.plan, t) })}</Text>
          {s.plan.priceCents > 0 ? (
            <>
              <Text secondary>{planPrice(s.plan, t, locale)}</Text>
              {s.validUntil ? (
                <Text secondary>
                  {t('plans.validUntil', { date: formatDate(s.validUntil, locale) })}
                </Text>
              ) : null}
              <View style={styles.row}>
                <Button
                  variant="secondary"
                  label={t('plans.manage')}
                  onPress={() => router.push('/plans')}
                />
              </View>
            </>
          ) : (
            <View style={styles.row}>
              <Button
                variant="secondary"
                icon="sparkles"
                label={t('plans.seePlans')}
                onPress={() => router.push('/plans')}
              />
            </View>
          )}
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xs },
  row: { flexDirection: 'row', marginTop: spacing.xs },
});
