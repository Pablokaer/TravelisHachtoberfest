import { expect, test } from '@playwright/test';

import {
  addLisbonPlaces,
  builtWith,
  byTestIdOn,
  makePremium,
  roleOn,
  signUpAndOnboard,
  type Page,
} from './helpers';

/**
 * Plans and subscriptions (D-047) with the plan limits lifted and the paid plans UI hidden for
 * now (D-065), against the local stack: every account saves lists of more than 5 places, a sixth
 * list, and deletes its own — in the app and with a direct request; no Upgrade, no /plans, no
 * Settings → Subscription. The paid plans UI itself is tested against a build that turns it on
 * (see `builtWith`).
 *   pnpm db:start && pnpm build:web && E2E_BACKEND=1 pnpm e2e subscription
 */
test.skip(!process.env.E2E_BACKEND, 'needs the local Supabase stack (set E2E_BACKEND=1)');

/** A REST request to the local stack as the signed-in user (bypassing the app); its status. */
async function restAsUser(
  page: Page,
  method: 'POST' | 'DELETE',
  path: string,
  body?: object,
): Promise<number> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))!;
      const token = (JSON.parse(localStorage.getItem(key)!) as { access_token: string })
        .access_token;
      const anon = (window as unknown as { __E2E_ANON__?: string }).__E2E_ANON__;
      const res = await fetch(`http://127.0.0.1:54321/rest/v1/${path}`, {
        method,
        headers: {
          apikey: anon ?? token,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.status;
    },
    { method, path, body },
  );
}

test('every account saves a sixth list of 6 places and deletes its own lists', async ({ page }) => {
  test.setTimeout(240_000);
  const byTestId = byTestIdOn(page);
  const role = roleOn(page);
  await signUpAndOnboard(page);

  // Five lists from before, written directly as the user (the old Free maximum).
  for (let i = 1; i <= 5; i++) {
    const status = await restAsUser(page, 'POST', 'trips', {
      city_slug: 'lisbon',
      name: `E2E old list ${i}`,
    });
    expect(status).toBe(201);
  }

  // A sixth, of six places, through the app: no plan notice anywhere on the way.
  await addLisbonPlaces(page, 6);
  await expect(page.getByText(/places per list|plan limit/)).toHaveCount(0);
  await byTestId('open-route').click();
  await byTestId('trip-name').fill('E2E sixth list');
  await byTestId('save-trip').click();
  await expect(page).toHaveURL(/\/trip\/[0-9a-f-]{36}$/);
  const tripId = page.url().split('/').pop()!;
  await expect(page.getByText(/Premium/)).toHaveCount(0);

  // The owner deletes it in the app...
  await role('button', 'Delete trip').click();
  await page.getByRole('button', { name: 'Yes, delete trip' }).filter({ visible: true }).click();
  await expect(page).not.toHaveURL(new RegExp(tripId));
  // ...and one of the old lists with a direct request.
  await page.goto('/trips');
  await expect(role('button', /^E2E old list 1, /)).toBeVisible();
  await role('button', /^E2E old list 1, /).click();
  const oldId = page.url().split('/').pop()!;
  expect(await restAsUser(page, 'DELETE', `trips?id=eq.${oldId}`)).toBe(204);
  await page.goto('/trips');
  await expect(role('button', /^E2E sixth list, /)).toHaveCount(0);
  await expect(role('button', /^E2E old list 1, /)).toHaveCount(0);
  await expect(role('button', /^E2E old list 2, /)).toBeVisible();
});

test('the paid plans UI is hidden: no Upgrade, no /plans, no Settings → Subscription', async ({
  page,
}) => {
  test.skip(builtWith.paidPlans, 'this build shows paid plans (EXPO_PUBLIC_FEATURE_PAID_PLANS)');
  test.setTimeout(120_000);
  await signUpAndOnboard(page);
  await expect(roleOn(page)('button', 'Upgrade')).toHaveCount(0);
  await addLisbonPlaces(page, 2);
  await expect(roleOn(page)('button', 'Upgrade')).toHaveCount(0);

  await page.goto('/plans');
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await expect(page.getByText('Where to next?').filter({ visible: true })).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByText('Units').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Subscription')).toHaveCount(0);
  await expect(page.getByText(/Current plan/)).toHaveCount(0);
});

test('with paid plans on: Upgrade → plans, Settings → Subscription, Premium', async ({ page }) => {
  test.skip(
    !builtWith.paidPlans,
    'paid plans hidden (D-065): build with EXPO_PUBLIC_FEATURE_PAID_PLANS=true',
  );
  test.setTimeout(180_000);
  const byTestId = byTestIdOn(page);
  const role = roleOn(page);
  await signUpAndOnboard(page);

  // Upgrade → plans (no payment yet).
  await role('button', 'Upgrade').first().click();
  await expect(page).toHaveURL(/\/plans$/);
  await expect(byTestId('plan-free')).toContainText('Current plan');
  await expect(byTestId('plan-premium')).toContainText('€5.00 / month');
  await role('button', 'Upgrade to Premium').click();
  await expect(page.getByText(/Payments are coming soon/)).toBeVisible();

  // Settings → Subscription.
  await page.goto('/profile');
  await expect(page.getByText('Current plan: Free')).toBeVisible();

  // Premium: plan and validity in Settings, and no Upgrade.
  await makePremium(page);
  await page.goto('/profile');
  await expect(page.getByText('Current plan: Premium')).toBeVisible();
  await expect(page.getByText('€5.00 / month')).toBeVisible();
  await expect(page.getByText(/^Valid until: /)).toBeVisible();
  await expect(role('button', 'Upgrade')).toHaveCount(0);
});
