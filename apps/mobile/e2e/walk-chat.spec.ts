import { expect, test, type Browser } from '@playwright/test';

import {
  builtWith,
  byTestIdOn,
  chooseVisibility,
  roleOn,
  saveWalk,
  signUpAndOnboard,
  type Page,
} from './helpers';

/**
 * Walk list participation and group chat as one flow (D-043, D-044), against the local Supabase
 * stack with three people: an organiser and two travellers who say they are going to a public
 * list without a date. Everyone shares one chat, messages arrive live, survive a reload, and
 * leaving closes the chat.
 *   pnpm db:start && pnpm build:web && E2E_BACKEND=1 pnpm e2e walk-chat
 */
test.skip(!process.env.E2E_BACKEND, 'needs the local Supabase stack (set E2E_BACKEND=1)');
// The walk chat is hidden for now (D-065); see `builtWith` for running these against a build
// that turns it on. Its hidden state is covered in city-page.spec.ts.
test.skip(
  !builtWith.walkChat,
  'walk chat hidden (D-065): build with EXPO_PUBLIC_FEATURE_WALK_CHAT=true',
);

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** A signed-up traveller in a browser of their own, with console errors collected. */
async function traveller(browser: Browser, errors: string[]): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await signUpAndOnboard(page);
  return page;
}

async function join(page: Page, tripId: string) {
  const role = roleOn(page);
  await page.goto(`/shared?id=${tripId}`);
  await expect(role('button', 'Open group chat')).toHaveCount(0);
  await role('button', "I'm going").click();
  await expect(role('button', 'Not going')).toBeVisible();
  await role('button', 'Open group chat').click();
  await expect(page).toHaveURL(/\/walk-chat\?id=/);
}

async function say(page: Page, text: string) {
  await byTestIdOn(page)('chat-input').fill(text);
  await roleOn(page)('button', 'Send').click();
}

test('three people share one live chat that survives a reload; leaving closes it', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await signUpAndOnboard(page);
  const tripId = await saveWalk(page, `E2E group walk ${unique()}`);
  await chooseVisibility(page, 'Public');
  await expect(roleOn(page)('button', 'Share list')).toBeVisible();

  const ben = await traveller(browser, errors);
  const cid = await traveller(browser, errors);
  await join(ben, tripId);
  await join(cid, tripId);
  // The organiser opens the same chat from her list page.
  await roleOn(page)('button', 'Open group chat').click();
  await expect(page).toHaveURL(new RegExp(`/walk-chat\\?id=${tripId}`));
  await expect(byTestIdOn(page)('chat-participants')).toContainText('3 people');

  const hello = `Hello ${unique()}`;
  await say(ben, hello);
  for (const p of [page, cid]) await expect(p.getByText(hello)).toBeVisible({ timeout: 15_000 });
  const reply = `What time are we going? ${unique()}`;
  await say(cid, reply);
  for (const p of [page, ben]) await expect(p.getByText(reply)).toBeVisible({ timeout: 15_000 });
  const answer = `10:00 at the square ${unique()}`;
  await say(page, answer);
  for (const p of [ben, cid]) await expect(p.getByText(answer)).toBeVisible({ timeout: 15_000 });

  // A reload keeps the whole history, in order.
  await ben.reload();
  const bodies = byTestIdOn(ben)('chat-participants');
  await expect(bodies).toContainText('3 people');
  for (const text of [hello, reply, answer]) await expect(ben.getByText(text)).toBeVisible();

  // Ben leaves: the chat closes for him, the others keep it.
  await ben.goto(`/shared?id=${tripId}`);
  await roleOn(ben)('button', 'Not going').click();
  await expect(roleOn(ben)('button', "I'm going")).toBeVisible();
  await ben.goto(`/walk-chat?id=${tripId}`);
  await expect(ben.getByText('Only people going can chat')).toBeVisible();
  await expect(cid.getByText(answer)).toBeVisible();

  expect(errors, 'no console errors in any browser').toEqual([]);
});
