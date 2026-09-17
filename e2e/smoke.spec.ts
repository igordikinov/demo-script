import { expect, test } from '@playwright/test';

// Дымовой тест каркаса: страница открывается без ошибок в консоли,
// заголовок и главный ландмарк на месте.
test('empty app loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await expect(page).toHaveTitle('In.Plan Demo Navigator');
  await expect(page.locator('#root main')).toBeAttached();
  expect(errors).toEqual([]);
});
