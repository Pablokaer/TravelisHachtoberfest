import { expect, test, type Browser } from '@playwright/test';

import {
  byTestIdOn,
  chooseVisibility,
  roleOn,
  saveWalk,
  signUpAndOnboard,
  type Page,
} from './helpers';

/**
 * Walk list visibility (D-031) against the local Supabase stack: the owner switches a saved trip
 * between private, public and password; a signed-out visitor opens the shared link.
 *   pnpm db:start && pnpm functions:serve & pnpm build:web && E2E_BACKEND=1 pnpm e2e sharing
 */
test.skip(!process.env.E2E_BACKEND, 'needs the local Supabase stack (set E2E_BACKEND=1)');

/** A signed-out visitor in a browser of their own. */
async function visitor(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test('a walk list is private, then public, then protected, then private again', async ({
  page,
  browser,
  context,
}) => {
  test.setTimeout(180_000);
  const role = roleOn(page);
  // No browser share sheet: the link is copied, and the test reads it back.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined }));

  await signUpAndOnboard(page);
  const id = await saveWalk(page, 'Shared E2E walk');
  await expect(page.getByRole('radio', { name: 'Private' })).toBeChecked();
  await expect(role('button', 'Share list')).toHaveCount(0);

  const guest = await visitor(browser);
  await guest.goto(`/shared?id=${id}`);
  await expect(guest.getByText('Walk list not available')).toBeVisible({ timeout: 20_000 });

  // Public: the share button copies the link, which opens for anyone.
  await chooseVisibility(page, 'Public');
  await role('button', 'Share list').click();
  await expect(page.getByText('Link copied.')).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(new RegExp(`/shared\\?id=${id}$`));
  await guest.goto(link);
  await expect(guest.getByText('Shared E2E walk').first()).toBeVisible({ timeout: 20_000 });
  await expect(roleOn(guest)('button', 'Plan your own walks')).toBeVisible();

  // Password: asked, a wrong one refused, the right one opens it.
  await chooseVisibility(page, 'With password', 'lisbon24');
  await expect(page.getByText('Leave blank to keep the current password.')).toBeVisible();
  await guest.reload();
  await expect(guest.getByText('This walk list is protected')).toBeVisible({ timeout: 20_000 });
  await byTestIdOn(guest)('shared-trip-password').fill('wrong');
  await roleOn(guest)('button', 'Open list').click();
  await expect(guest.getByText('Wrong password. Try again.')).toBeVisible();
  await byTestIdOn(guest)('shared-trip-password').fill('lisbon24');
  await roleOn(guest)('button', 'Open list').click();
  await expect(guest.getByText('Shared E2E walk').first()).toBeVisible();

  // Private again: the link stops working.
  await chooseVisibility(page, 'Private');
  await expect(role('button', 'Share list')).toHaveCount(0);
  await guest.reload();
  await expect(guest.getByText('Walk list not available')).toBeVisible({ timeout: 20_000 });
});
