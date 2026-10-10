// Plans (D-047), /plans: Free and Premium side by side, from the `plans` table. "Upgrade to
// Premium" is where checkout will start (`startCheckout`); no payment is taken yet. While paid
// plans are hidden (D-065) the address sends the user home instead.
import { ROUTE_MAX_STOPS } from '@wayfarer/shared';
import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, Card } from '@/components/card';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { PageHeader, Screen } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { startCheckout, useMySubscription, usePlans, type Plan } from '@/features/subscription/api';
import { planFeatures, planName, planPrice } from '@/features/subscription/plan-text';
import { useFeatures } from '@/lib/features';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

function PlanCard({
  plan,
  current,
  onUpgrade,
}: {
  plan: Plan;
  current: boolean;
  onUpgrade?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const featured = plan.priceCents > 0;
  return (
    <Card
      testID={`plan-${plan.id}`}
      style={[styles.card, featured && { borderColor: theme.primary, borderWidth: 2 }]}>
      <View style={styles.row}>
        <Text variant="heading">{planName(plan, t)}</Text>
        {featured ? <Badge tone="accent" icon="sparkles" label={t('plans.recommended')} /> : null}
        {current ? <Badge label={t('plans.current')} /> : null}
      </View>
      <Text variant="display">{planPrice(plan, t, t('common.locale'))}</Text>
      <View style={styles.features}>
        {planFeatures(plan, t).map((line) => (
          <View key={line} style={styles.row}>
            <Icon name="check" size={16} color={theme.primary} />
            <Text>{line}</Text>
          </View>
        ))}
      </View>
      {onUpgrade ? (
        <Button icon="sparkles" label={t('plans.upgradeCta')} onPress={onUpgrade} />
      ) : null}
    </Card>
  );
}

/**
 * The route: the plans when paid plans are on, otherwise home (D-065).
 * @example router.push('/plans')
 */
export default function PlansRoute() {
  return useFeatures().paidPlans ? <PlansScreen /> : <Redirect href="/" />;
}

function PlansScreen() {
  const { t } = useTranslation();
  const plans = usePlans();
  const subscription = useMySubscription();
  const [notice, setNotice] = useState<string | null>(null);
  if (plans.isPending || subscription.isPending) return <LoadingState />;
  if (plans.isError || subscription.isError)
    return (
      <ErrorState onRetry={() => void Promise.all([plans.refetch(), subscription.refetch()])} />
    );
  const currentId = subscription.data.plan.id;
  const upgrade = (plan: Plan) => async () => {
    const result = await startCheckout(plan.id);
    if (result.status === 'unavailable') setNotice(t('plans.comingSoon'));
  };
  return (
    <Screen edges={['left', 'right']} width="wide">
      <Stack.Screen options={{ title: t('plans.title') }} />
      <PageHeader title={t('plans.title')} subtitle={t('plans.subtitle')} />
      <View style={styles.grid}>
        {plans.data.map((plan) => (
          <View key={plan.id} style={styles.cell}>
            <PlanCard
              plan={plan}
              current={plan.id === currentId}
              onUpgrade={
                plan.priceCents > subscription.data.plan.priceCents ? upgrade(plan) : undefined
              }
            />
          </View>
        ))}
      </View>
      {notice ? (
        <Card muted>
          <Text accessibilityLiveRegion="polite">{notice}</Text>
        </Card>
      ) : null}
      <Text variant="helper" secondary>
        {t('plans.routeNote', { max: ROUTE_MAX_STOPS })}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  cell: { flexGrow: 1, flexBasis: 300 },
  card: { gap: spacing.md, borderRadius: radius.xl },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  features: { gap: spacing.sm },
});
