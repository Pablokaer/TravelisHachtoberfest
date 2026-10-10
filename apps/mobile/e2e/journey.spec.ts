import { expect, test } from '@playwright/test';

import {
  addLisbonPlaces,
  byTestIdOn,
  openLisbonAttractions,
  roleOn,
  signUpAndOnboard,
} from './helpers';

/**
 * Full journey against a local Supabase stack with seeds loaded and functions served:
 *   pnpm db:start && pnpm functions:serve & pnpm build:web && E2E_BACKEND=1 pnpm e2e
 */
test.skip(!process.env.E2E_BACKEND, 'needs the local Supabase stack (set E2E_BACKEND=1)');
test.describe.configure({ mode: 'serial' });

test('sign up, onboard, explore, check, build and save a walk', async ({ page }) => {
  test.setTimeout(120_000);
  const byTestId = byTestIdOn(page);
  const role = roleOn(page);
  await signUpAndOnboard(page);
  await addLisbonPlaces(page, 2);

  // Checklist
  await byTestId('open-checklist').click();
  await expect(byTestId('section-visa')).toBeVisible({ timeout: 30_000 });
  await expect(byTestId('section-visa')).toContainText(/Visa-free|Free movement|citizen/);
  await expect(byTestId('section-power')).toBeVisible();
  await page.goBack();

  // Route
  await byTestId('open-route').click();
  await byTestId('optimize').click();
  // Wait for the optimiser's answer: the distance switches from "–" to a value.
  await expect(byTestId('route-distance')).toContainText(/\d+(\.\d+)? (km|m|mi)\b/, {
    timeout: 30_000,
  });
  await byTestId('trip-name').fill('E2E walk');
  await byTestId('save-trip').click();
  await expect(role('heading', 'E2E walk').first()).toBeVisible();
  // The saved trip keeps the route totals.
  await expect(byTestId('route-distance')).toContainText(/\d+(\.\d+)? (km|m|mi)\b/);
  await expect(role('button', 'Open the whole walk in Google Maps')).toBeVisible();

  // My Trips
  await page.goto('/trips');
  await expect(page.getByText('E2E walk')).toBeVisible();
});

test('orders picks automatically, splits them into two routes and saves both', async ({ page }) => {
  test.setTimeout(150_000);
  const byTestId = byTestIdOn(page);
  await signUpAndOnboard(page);
  await addLisbonPlaces(page, 6);

  await byTestId('open-route').click();
  await expect(byTestId('route-order-notice')).toContainText('shortest walk');
  await byTestId('suggest-split').click();
  await expect(byTestId('route-heading-0')).toContainText('Route 1');
  await expect(byTestId('route-heading-1')).toContainText('Route 2');

  await byTestId('optimize').click();
  await expect(byTestId('route-distance').first()).toContainText(/\d+(\.\d+)? (km|m|mi)\b/, {
    timeout: 30_000,
  });
  await expect(byTestId('route-distance').nth(1)).toContainText(/\d+(\.\d+)? (km|m|mi)\b/);
  await byTestId('trip-name').fill('E2E split');
  await byTestId('save-trip').click();

  await expect(page.getByText('E2E split · Route 1')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('E2E split · Route 2')).toBeVisible();
});

test('reorders stops by dragging their grip', async ({ page }) => {
  test.setTimeout(120_000);
  const byTestId = byTestIdOn(page);
  await signUpAndOnboard(page);
  await addLisbonPlaces(page, 3);
  await byTestId('open-route').click();

  const grip = byTestId('drag-stop-0');
  // "Drag {name} to reorder"
  const first = (await grip.getAttribute('aria-label'))!.replace(/^Drag (.*) to reorder$/, '$1');
  const last = byTestId('route-0-stop-2');
  const from = (await grip.boundingBox())!;
  const to = (await last.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height - 4, { steps: 12 });
  await page.mouse.up();

  await expect(byTestId('route-order-notice')).toContainText('by hand');
  await expect(byTestId('route-0-stop-2')).toContainText(first);
  await expect(byTestId('drag-stop-2')).toHaveAttribute('aria-label', `Drag ${first} to reorder`);
});

test('publishes, edits and deletes a review of an attraction', async ({ page }) => {
  test.setTimeout(120_000);
  const byTestId = byTestIdOn(page);
  const role = roleOn(page);
  await signUpAndOnboard(page);
  await openLisbonAttractions(page);
  await page.getByRole('radio', { name: 'List' }).or(role('checkbox', 'List')).click();
  const list = byTestId('attraction-list');
  await list.getByRole('button').first().click();

  // Unique per run: other E2E users may have reviewed the same place.
  const comment = `E2E review ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const form = byTestId('review-form');
  // Published review cards (review-<uuid>), not the form's text box.
  const cards = page.getByTestId(/^review-[0-9a-f-]{36}$/).filter({ visible: true });
  await form.getByLabel('4 stars').click();
  await form.getByLabel('Your comment (optional)').fill(comment);
  await byTestId('save-review').click();
  await expect(cards.filter({ hasText: comment })).toHaveCount(1, { timeout: 15_000 });
  await expect(byTestId('rating-summary').first()).toContainText('★ ·');
  await expect(form.getByLabel('4 stars')).toBeChecked();
  await expect(form.getByRole('button', { name: 'Update review' })).toBeVisible();

  // Back on the city page, the card of the reviewed place shows its average beside the name.
  await page.goBack();
  await expect(list.getByRole('button').first().getByTestId('card-rating')).toHaveText(
    /^\d\.\d ★$/,
    { timeout: 15_000 },
  );
  await list.getByRole('button').first().click();

  await form.getByLabel('5 stars').click();
  await byTestId('save-review').click();
  await expect(byTestId('review-form').getByLabel('5 stars')).toBeChecked({ timeout: 15_000 });
  await expect(cards.filter({ hasText: comment }).getByLabel('Rated 5 out of 5')).toBeVisible();

  await byTestId('delete-review').click();
  await role('button', 'Delete review').click();
  await expect(cards.filter({ hasText: comment })).toHaveCount(0, { timeout: 15_000 });
  await expect(byTestId('save-review')).toHaveText('Publish review');
});

test('map: photo markers open a compact card; + adds to the route; the card opens the place', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const byTestId = byTestIdOn(page);
  await signUpAndOnboard(page);
  await openLisbonAttractions(page);
  await page
    .getByRole('radio', { name: 'Map' })
    .or(page.getByRole('checkbox', { name: 'Map' }))
    .click();

  // Every place is a round photo marker (the city has hundreds).
  const markers = page.locator('.maplibregl-marker.wayfarer-marker');
  await expect(markers.first()).toBeVisible({ timeout: 20_000 });
  expect(await markers.count()).toBeGreaterThan(50);
  // maplibre's stylesheet is added when the map opens (no page links it up front, D-062).
  await expect(markers.first()).toHaveCSS('position', 'absolute');
  await expect(page.locator('.maplibregl-ctrl-group').first()).toHaveCSS('border-radius', '4px');
  // A small Commons thumbnail: 60 px on the 1× desktop, 120 px on the 2.6× phone (D-050, D-062).
  await expect(markers.first().locator('img').first()).toHaveAttribute('src', /\/(60|120)px-/);

  // Markers of dense areas overlap: use ones whose centre is not covered by another.
  const uncovered = await page.evaluate(() =>
    [...document.querySelectorAll('.wayfarer-marker')]
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el.contains(hit) && r.top > 120 ? i : -1;
      })
      .filter((i) => i >= 0),
  );
  expect(uncovered.length).toBeGreaterThan(1);

  // First press: a card over the map, no navigation.
  const first = markers.nth(uncovered[0]!);
  const name = (await first.getAttribute('aria-label'))!;
  await first.click();
  const popup = page.locator('.maplibregl-popup');
  await expect(popup).toHaveCount(1);
  await expect(popup).toContainText(name);
  await expect(page).toHaveURL(/\/city\/lisbon$/);
  await expect(first).toHaveAttribute('aria-pressed', 'true');

  // + adds it to the route and stays on the map.
  await popup.getByTestId('route-checkbox').click();
  await expect(page.getByText('1 stop in your route')).toBeVisible();
  await expect(popup.getByTestId('route-checkbox')).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/\/city\/lisbon$/);

  // The card is never hidden behind the Map/List switch or the route tray floating over the map.
  const cardBox = async () => (await popup.getByTestId(/^attraction-card-/).boundingBox())!;
  const controlsTop = async () =>
    (await page
      .getByRole('radio', { name: 'Map' })
      .or(page.getByRole('checkbox', { name: 'Map' }))
      .boundingBox())!.y;
  await expect
    .poll(async () => (await cardBox()).y + (await cardBox()).height <= (await controlsTop()), {
      timeout: 5_000,
    })
    .toBe(true);

  // Another marker: one card at a time.
  const second = markers.nth(uncovered[uncovered.length - 1]!);
  const other = (await second.getAttribute('aria-label'))!;
  await second.click({ force: true });
  await expect(popup).toHaveCount(1);
  await expect(popup).toContainText(other);
  await expect(first).toHaveAttribute('aria-pressed', 'false');

  // An empty spot closes it.
  const empty = await page.evaluate(() => {
    const canvas = document.querySelector('.maplibregl-canvas')!.getBoundingClientRect();
    for (let y = canvas.top + 60; y < canvas.bottom - 60; y += 23) {
      for (let x = canvas.left + 20; x < canvas.right - 60; x += 23) {
        if (document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas'))
          return { x, y };
      }
    }
    return null;
  });
  await page.mouse.click(empty!.x, empty!.y);
  await expect(popup).toHaveCount(0);

  // Pressing the card opens the attraction page.
  await second.click({ force: true });
  await popup
    .getByRole('button', { name: new RegExp(other) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/attraction\//);
});

test('a route holds up to 20 places: the 21st is refused with a notice; 20 are saved', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const byTestId = byTestIdOn(page);
  await signUpAndOnboard(page);
  await openLisbonAttractions(page);
  await page
    .getByRole('radio', { name: 'List' })
    .or(page.getByRole('checkbox', { name: 'List' }))
    .click();
  const boxes = byTestId('attraction-list').getByTestId('route-checkbox');
  await expect(boxes.first()).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 20; i++) await boxes.nth(i).click();
  await expect(page.getByText('20 stops in your route')).toBeVisible();
  await expect(page.getByText(/already has/)).toHaveCount(0);
  await boxes.nth(20).click();
  await expect(page.getByText('Your route already has 20 stops.')).toBeVisible();
  await expect(page.getByText('20 stops in your route')).toBeVisible();
  await expect(boxes.nth(20)).toHaveAttribute('aria-checked', 'false');

  await byTestId('open-route').click();
  await expect(page.getByTestId(/^route-0-stop-\d+$/).filter({ visible: true })).toHaveCount(20);
  await byTestId('trip-name').fill('E2E long walk');
  await byTestId('save-trip').click();
  await expect(page.getByText('E2E long walk').first()).toBeVisible({ timeout: 20_000 });
  // My Trips counts the saved stops.
  await page.goto('/trips');
  await expect(page.getByText('E2E long walk').first()).toBeVisible();
  await expect(page.getByText('20 stops').first()).toBeVisible();
});
