import { expect, test } from '@playwright/test';

import {
  builtWith,
  byTestIdOn,
  chooseVisibility,
  openLisbon,
  roleOn,
  saveWalk,
  signUpAndOnboard,
  type Page,
} from './helpers';

/**
 * City page hub (D-033 – D-036) against the local Supabase stack: About, rating the city,
 * a community walk list found, saved and rated by another traveller, and the way on to the
 * attractions.
 *   pnpm db:start && pnpm functions:serve & pnpm build:web && E2E_BACKEND=1 pnpm e2e city-page
 */
test.skip(!process.env.E2E_BACKEND, 'needs the local Supabase stack (set E2E_BACKEND=1)');

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function rate(page: Page, stars: number, comment: string) {
  const form = byTestIdOn(page)('review-form');
  await form.getByLabel(`${stars} stars`).click();
  await form.getByLabel('Your comment (optional)').fill(comment);
  await byTestIdOn(page)('save-review').click();
  await expect(page.getByText(comment)).toBeVisible();
}

test('the city page shows About, takes a review and leads to the attractions', async ({ page }) => {
  test.setTimeout(120_000);
  const role = roleOn(page);
  await signUpAndOnboard(page);
  await openLisbon(page);

  await expect(byTestIdOn(page)('city-hero').getByText('Lisbon')).toBeVisible();
  await expect(page.getByText('From Wikipedia · CC BY-SA 4.0')).toBeVisible();
  await expect(role('heading', /^Top community walk lists$/)).toBeVisible();
  await expect(role('heading', /^Official walk lists$/)).toBeVisible();
  await expect(page.getByText('Before you go').first()).toBeVisible();

  await expect(page.getByText('Rate this city')).toBeVisible();
  await rate(page, 5, `E2E city review ${unique()}`);
  await expect(byTestIdOn(page)('rating-bar-5')).toBeVisible();

  await role('button', 'Explore attractions').click();
  await expect(page).toHaveURL(/\/city\/lisbon$/);
});

test('a public walk list is found on the city page, saved and rated by another traveller', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const name = `E2E community walk ${unique()}`;
  await signUpAndOnboard(page);
  await saveWalk(page, name);
  await chooseVisibility(page, 'Public');
  // "Share list" appears once the saved visibility is public.
  await expect(roleOn(page)('button', 'Share list')).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  const byTestId = byTestIdOn(other);
  const role = roleOn(other);
  await signUpAndOnboard(other);
  await openLisbon(other);
  await role('button', 'View all walk lists').click();
  await expect(other).toHaveURL(/\/short\/lisbon\/walklists$/);
  await byTestId('walklist-search').fill(name);
  // Earlier runs left lists by the same author: look at this run's card only.
  const card = byTestId('walklist-grid').getByRole('button', { name: `${name}, Lisbon` });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText('by E2E Traveller')).toBeVisible();

  await role('button', `Save ${name}`).click();
  await expect(role('button', `Remove ${name} from saved`)).toBeVisible();

  await role('button', `View ${name}`).click();
  await expect(other).toHaveURL(/\/shared\?id=/);
  await expect(other.getByText('Rate this walk list')).toBeVisible();
  await rate(other, 4, `E2E walk review ${unique()}`);

  await other.goto('/trips');
  await role('radio', 'Saved').click();
  await expect(other.getByText(name)).toBeVisible();
});

test('a walk list with a date and time is a meetup other travellers join', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const name = `E2E meetup ${unique()}`;
  // Tomorrow in Lisbon at 10:00: always in the future.
  const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await signUpAndOnboard(page);
  await saveWalk(page, name, { date, time: '10:00' });
  await expect(byTestIdOn(page)('schedule-time')).toHaveValue('10:00');
  await chooseVisibility(page, 'Public');
  await expect(roleOn(page)('button', 'Share list')).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  const role = roleOn(other);
  await signUpAndOnboard(other);
  await openLisbon(other);
  await expect(byTestIdOn(other)('meetups-upcoming')).toBeVisible();
  await role('button', 'View all meetups').click();
  await expect(other).toHaveURL(/\/short\/lisbon\/meetups$/);
  const row = byTestIdOn(other)('meetups-page').getByRole('button', { name: new RegExp(name) });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText('10:00');
  await expect(row).toContainText(/Starts in/);

  await row.click();
  await expect(other).toHaveURL(/\/shared\?id=/);
  const banner = byTestIdOn(other)('meetup-banner');
  await expect(banner).toContainText('0 going');
  await role('button', "I'm going").click();
  await expect(banner).toContainText('1 going');
  await expect(role('button', 'Not going')).toBeVisible();
  if (builtWith.walkChat) return;
  // While the walk chat is hidden (D-065): going says nothing about a chat and opens none, and
  // the chat's address leads back to the list.
  await expect(banner).not.toContainText(/chat/i);
  await expect(role('button', 'Open group chat')).toHaveCount(0);
  const listUrl = other.url();
  await other.goto(listUrl.replace('/shared?', '/walk-chat?'));
  await expect(other).toHaveURL(/\/shared\?id=/);
  await expect(byTestIdOn(other)('meetup-banner')).toContainText('1 going');
});

test('going opens the group chat, where messages arrive instantly (D-043)', async ({
  page,
  browser,
}) => {
  test.skip(
    !builtWith.walkChat,
    'walk chat hidden (D-065): build with EXPO_PUBLIC_FEATURE_WALK_CHAT=true',
  );
  test.setTimeout(240_000);
  const name = `E2E chat walk ${unique()}`;
  const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await signUpAndOnboard(page);
  const tripId = await saveWalk(page, name, { date, time: '10:00' });
  await chooseVisibility(page, 'Public');
  await expect(roleOn(page)('button', 'Share list')).toBeVisible();

  // Someone else opens the list: no chat before going.
  const other = await (await browser.newContext()).newPage();
  const role = roleOn(other);
  await signUpAndOnboard(other);
  await other.goto(`/shared?id=${tripId}`);
  await expect(role('button', 'Open group chat')).toHaveCount(0);
  await role('button', "I'm going").click();
  await role('button', 'Open group chat').click();
  await expect(other).toHaveURL(/\/walk-chat\?id=/);
  await expect(other.getByText('No messages yet. Say hello!')).toBeVisible();

  // The organiser opens the same chat from the list page.
  await roleOn(page)('button', 'Open group chat').click();
  await expect(page).toHaveURL(/\/walk-chat\?id=/);

  const hello = `Hello from the square ${unique()}`;
  await byTestIdOn(other)('chat-input').fill(hello);
  await role('button', 'Send').click();
  await expect(page.getByText(hello)).toBeVisible({ timeout: 15_000 });

  const reply = `See you at 10 ${unique()}`;
  await byTestIdOn(page)('chat-input').fill(reply);
  await roleOn(page)('button', 'Send').click();
  await expect(other.getByText(reply)).toBeVisible({ timeout: 15_000 });
});
