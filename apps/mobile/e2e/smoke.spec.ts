import { expect, test } from '@playwright/test';

// Runs without a backend: only screens that don't need data.
test('signed-out visitors land on the landing page (D-072)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(
    page.getByRole('heading', { name: 'Turn any city into your personal travel list' }),
  ).toBeVisible();
  await expect(page.getByTestId('phone-mockups').filter({ visible: true })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('the landing page leads to sign-in, which can switch language', async ({ page }) => {
  await page.goto('/welcome');
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Log in' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Português' }).click();
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
});

test('about screen shows data attribution', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByText(/OpenStreetMap contributors/)).toBeVisible();
  await expect(page.getByText(/Open-Meteo/)).toBeVisible();
});
