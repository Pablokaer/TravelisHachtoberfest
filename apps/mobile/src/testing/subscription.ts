// Test fixtures for plans and subscriptions (D-047): the two rows of the `plans` table as the
// database returns them, and a subscription of each plan.
import { subscriptionFrom, type Subscription } from '@/features/subscription/api';

export const freePlanRow = {
  id: 'free',
  price_cents: 0,
  currency: 'EUR',
  billing_interval: null,
  // No limits since D-065 (migration 20261006000100_plan_limits_lifted).
  max_lists: null,
  max_items_per_list: null,
  can_delete_lists: true,
};

export const premiumPlanRow = {
  id: 'premium',
  price_cents: 500,
  currency: 'EUR',
  billing_interval: 'month',
  max_lists: null,
  max_items_per_list: null,
  can_delete_lists: true,
};

/** A Free user (no subscription) with `listCount` lists. */
export function freeSubscription(listCount = 0): Subscription {
  return subscriptionFrom({
    plan: freePlanRow,
    status: 'free',
    started_at: null,
    valid_until: null,
    list_count: listCount,
  });
}

/** A Premium user with an active subscription valid until 31 Oct 2026. */
export function premiumSubscription(listCount = 0): Subscription {
  return subscriptionFrom({
    plan: premiumPlanRow,
    status: 'active',
    started_at: '2026-09-01T10:00:00Z',
    valid_until: '2026-10-31T10:00:00Z',
    list_count: listCount,
  });
}
