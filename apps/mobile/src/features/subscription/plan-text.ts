// How a plan reads in the UI (D-047): its name, price and limits, from the plan's own values —
// no limit or price is written in the interface.
import type { TFunction } from 'i18next';

import type { Plan } from '@/features/subscription/api';

/** "Free", "Premium" — a plan without a translated name shows its id. */
export function planName(plan: Pick<Plan, 'id'>, t: TFunction): string {
  return t(`plans.name.${plan.id}`, { defaultValue: plan.id });
}

/**
 * "€0", "€5.00 / month".
 * @example planPrice(premium, t, 'en-GB') // '€5.00 / month'
 */
export function planPrice(plan: Plan, t: TFunction, locale: string): string {
  if (plan.priceCents === 0)
    return t('plans.freePrice', { price: formatMoney(0, plan.currency, locale, 0) });
  const price = formatMoney(plan.priceCents, plan.currency, locale, 2);
  return t(`plans.per.${plan.billingInterval ?? 'month'}`, { price });
}

function formatMoney(cents: number, currency: string, locale: string, digits: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
}

/** The plan's features as short lines ("Up to 5 lists", "Unlimited places per list", …). */
export function planFeatures(plan: Plan, t: TFunction): string[] {
  const { maxLists, maxItemsPerList, canDeleteLists } = plan.rules;
  const lines = [
    maxLists === null ? t('plans.unlimitedLists') : t('plans.lists', { count: maxLists }),
    maxItemsPerList === null
      ? t('plans.unlimitedItems')
      : t('plans.items', { count: maxItemsPerList }),
  ];
  if (canDeleteLists) lines.push(t('plans.deleteLists'));
  return lines;
}
