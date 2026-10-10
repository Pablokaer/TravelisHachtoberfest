import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { useMySubscription } from '@/features/subscription/api';
import { useFeatures } from '@/lib/features';

/**
 * "Upgrade" in the top bar (D-047): opens the plans. Shown on the default (free) plan only —
 * a paid plan has nothing to upgrade to yet — and only while paid plans are on (D-065).
 * @example <UpgradeButton />
 */
export function UpgradeButton() {
  // Gated before the plan is read: a hidden button costs no `my_subscription` request.
  return useFeatures().paidPlans ? <UpgradeForFreePlan /> : null;
}

function UpgradeForFreePlan() {
  const { t } = useTranslation();
  const subscription = useMySubscription();
  if (!subscription.data || subscription.data.plan.priceCents > 0) return null;
  return (
    <Button
      compact
      variant="secondary"
      icon="sparkles"
      label={t('plans.upgrade')}
      onPress={() => router.push('/plans')}
      testID="upgrade"
    />
  );
}
