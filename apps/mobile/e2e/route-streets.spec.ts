import { expect, test } from '@playwright/test';

import { addLisbonPlaces, byTestIdOn, signUpAndOnboard } from './helpers';

/**
 * Walking routes follow the streets (D-046), against the local stack and the real
 * OpenRouteService: the route drawn on the map is the walking path, with many points between
 * the stops — not straight lines — and "Estimated from straight-line distances" is not shown.
 *   pnpm db:start && pnpm build:web && E2E_BACKEND=1 pnpm e2e route-streets
 */
test.skip(!process.env.E2E_BACKEND, 'needs the local Supabase stack (set E2E_BACKEND=1)');

test('the optimised route is drawn along the streets', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const byTestId = byTestIdOn(page);
  await signUpAndOnboard(page);
  await addLisbonPlaces(page, 3);
  await byTestId('open-route').click();

  const answer = page.waitForResponse((r) => r.url().includes('/functions/v1/route-optimize'));
  await byTestId('optimize').click();
  const route = (await (await answer).json()) as {
    provider: string;
    isFallback: boolean;
    geometry: { coordinates: unknown[] };
  };
  expect(route.provider).toBe('openrouteservice');
  expect(route.isFallback).toBe(false);
  // Three stops in straight lines would be three points; a street path has many more.
  expect(route.geometry.coordinates.length).toBeGreaterThan(20);

  await expect(byTestId('route-distance')).toContainText(/\d/, { timeout: 30_000 });
  await expect(page.getByText(/Estimated from straight-line distances/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('route-map.png') });
});
