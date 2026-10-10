// Shared steps of the backend E2E specs (journey, sharing).
// Playwright runs these in Node (makePremium reads the local stack's keys with `supabase status`).
/// <reference types="node" />
import { execSync } from 'node:child_process';

import { expect } from '@playwright/test';

export type Page = import('@playwright/test').Page;

/**
 * Features hidden for now (D-065) that the web build under test turns on. Flags are baked in at
 * build time, so build and run with the same variables, e.g.
 *   EXPO_PUBLIC_FEATURE_WALK_CHAT=true pnpm build:web
 *   EXPO_PUBLIC_FEATURE_WALK_CHAT=true E2E_BACKEND=1 pnpm e2e walk-chat
 */
export const builtWith = {
  walkChat: process.env.EXPO_PUBLIC_FEATURE_WALK_CHAT === 'true',
  paidPlans: process.env.EXPO_PUBLIC_FEATURE_PAID_PLANS === 'true',
};

export const byTestIdOn = (page: Page) => (id: string) =>
  page.getByTestId(id).filter({ visible: true });
export const roleOn =
  (page: Page) => (r: Parameters<Page['getByRole']>[0], name: string | RegExp) =>
    page.getByRole(r, { name }).filter({ visible: true });

/** Signs up a fresh user with a Brazilian passport and lands on Explore. */
export async function signUpAndOnboard(page: Page) {
  const byTestId = byTestIdOn(page);
  const role = roleOn(page);
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

  await page.goto('/sign-up');
  await byTestId('displayName').fill('E2E Traveller');
  await byTestId('email').fill(email);
  // Nicknames are unique, 3–20 of a-z 0-9 _ (D-048).
  await byTestId('nickname').fill(
    `e2e_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
  );
  await byTestId('password').fill('correct-horse-battery');
  await role('button', 'Create account').click();

  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await role('button', 'Next').click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();
  await role('button', 'Choose a country').first().click();
  await page.getByLabel('Search countries').filter({ visible: true }).last().fill('Brazil');
  await role('checkbox', 'Brazil').click();
  await role('button', 'Done').click();
  await role('button', 'Choose a country').click();
  await page.getByLabel('Search countries').filter({ visible: true }).last().fill('Brazil');
  await role('radio', 'Brazil').click();
  // No passport expiry step since D-069: the second step finishes onboarding.
  await role('button', 'Start exploring').click();
  // Onboarding is saved before the Home opens: a test that reloads the page right away would
  // otherwise abort the save and leave the user not onboarded (protected screens then refuse it).
  await expect(page.getByText('Where to next?').filter({ visible: true })).toBeVisible();
}

/** Opens Lisbon's city page from the Home (D-033). */
export async function openLisbon(page: Page) {
  const byTestId = byTestIdOn(page);
  await byTestId('city-search').fill('Lisb');
  await byTestId('city-card-lisbon').click();
  await expect(page).toHaveURL(/\/short\/lisbon$/);
}

/** Opens Lisbon's attractions (Map / List) from the Home, through its city page. */
export async function openLisbonAttractions(page: Page) {
  await openLisbon(page);
  await roleOn(page)('button', 'Explore attractions').click();
  await expect(page).toHaveURL(/\/city\/lisbon$/);
}

/** Opens Lisbon from the Home in list view and adds the first `count` places to the route. */
export async function addLisbonPlaces(page: Page, count: number) {
  const byTestId = byTestIdOn(page);
  const role = roleOn(page);
  await openLisbonAttractions(page);
  await page.getByRole('radio', { name: 'List' }).or(role('checkbox', 'List')).click();
  const list = byTestId('attraction-list');
  await expect(list.getByRole('button').first()).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < count; i++) {
    await list.getByRole('button').nth(i).click();
    await byTestId('toggle-route').click();
    await expect(byTestId('toggle-route')).toHaveText('Remove from route');
    await page.goBack();
  }
  await expect(page.getByText(`${count} stops in your route`)).toBeVisible();
}

/**
 * Saves a two-stop Lisbon walk and returns its id (the owner stays on the trip page); with
 * `start` (Lisbon date and time) it is a meetup (D-041).
 */
export async function saveWalk(
  page: Page,
  name: string,
  start?: { date: string; time: string },
): Promise<string> {
  const byTestId = byTestIdOn(page);
  await addLisbonPlaces(page, 2);
  await byTestId('open-route').click();
  await byTestId('optimize').click();
  await expect(byTestId('route-distance')).toContainText(/\d/, { timeout: 30_000 });
  await byTestId('trip-name').fill(name);
  if (start) {
    await byTestId('trip-date').fill(start.date);
    await byTestId('trip-time').fill(start.time);
  }
  await byTestId('save-trip').click();
  await expect(page).toHaveURL(/\/trip\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

/** Picks a visibility on the owner's trip page and saves it (D-031). */
export async function chooseVisibility(page: Page, label: string, password?: string) {
  const role = roleOn(page);
  await role('radio', label).click();
  if (password) await byTestIdOn(page)('trip-password').fill(password);
  await role('button', 'Save visibility').click();
}

/** The local stack's API URL and service-role key (from `supabase status`), read once. */
let localStack: { url: string; serviceKey: string } | null = null;
function localSupabase() {
  if (localStack) return localStack;
  const status = JSON.parse(
    execSync('npx supabase status -o json', {
      cwd: '../..',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString(),
  ) as { API_URL: string; SERVICE_ROLE_KEY: string };
  localStack = { url: status.API_URL, serviceKey: status.SERVICE_ROLE_KEY };
  return localStack;
}

/**
 * Gives the signed-in user of `page` an active Premium subscription (D-047), as the payment
 * side will: a `subscriptions` row written with the service role. Local stack only.
 */
export async function makePremium(page: Page) {
  const userId = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
    return key
      ? (JSON.parse(localStorage.getItem(key)!) as { user: { id: string } }).user.id
      : null;
  });
  if (!userId) throw new Error('makePremium: no signed-in user in this page');
  const { url, serviceKey } = localSupabase();
  const res = await fetch(`${url}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      plan_id: 'premium',
      status: 'active',
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`makePremium: HTTP ${res.status} ${await res.text()}`);
  await page.reload();
}
