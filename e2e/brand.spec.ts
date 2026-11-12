import { expect, test, type Page } from '@playwright/test';
import { ru } from '../src/i18n/ru';
import { collectErrors, fixture, localScenario, seedLibrary, stepTitle } from './helpers';

/** Проверяем отрисовку, а не наличие нового CSS поверх неиспользуемых токенов. */
async function expectBrand(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator('body')).toHaveCSS('font-family', /^["']?Manrope\b/);
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(4, 20, 58)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 246, 250)');

  const oldColors = await page.evaluate(() => {
    const purple = new Set([
      'rgb(250, 243, 255)',
      'rgb(244, 227, 255)',
      'rgb(234, 205, 255)',
      'rgb(216, 153, 255)',
      'rgb(196, 108, 255)',
      'rgb(175, 53, 255)',
      'rgb(156, 15, 255)',
      'rgb(144, 0, 255)',
      'rgb(111, 0, 206)',
      'rgb(79, 0, 150)',
      'rgb(65, 0, 118)',
    ]);
    const found: string[] = [];
    for (const element of document.querySelectorAll('body, body *')) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        for (const property of [
          'color',
          'background-color',
          'border-top-color',
          'border-left-color',
          'outline-color',
        ]) {
          const color = style.getPropertyValue(property);
          if (purple.has(color)) {
            found.push(`${element.tagName}${pseudo ?? ''} ${property}: ${color}`);
          }
        }
      }
    }
    return found;
  });
  expect(oldColors).toEqual([]);
}

for (const width of [1024, 1440]) {
  test(`фирменная тема: каталог, диалог и карточка при ширине ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = collectErrors(page);
    const localId = 'my-brand-check';
    await seedLibrary(page, [localScenario(localId, '2026-11-12T06:00:00Z', 'brand-check.xlsx')]);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: ru.catalog.title, level: 1 })).toBeVisible();
    await expectBrand(page);
    await page.screenshot({ path: `test-results/brand/catalog-${width}.png`, fullPage: true });

    const row = page.locator(`tr[data-scenario-id="${localId}"]`);
    await row.getByRole('button', { name: ru.catalog.exportToShared }).click();
    const dialog = page.getByRole('dialog', { name: ru.exportDialog.title });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('background-color', 'rgb(244, 246, 250)');
    await expect(dialog.getByRole('link', { name: ru.exportDialog.uploadManual })).toHaveCSS(
      'color',
      'rgb(71, 105, 255)',
    );
    await expectBrand(page);
    await page.screenshot({ path: `test-results/brand/export-${width}.png` });
    await dialog.getByRole('button', { name: ru.exportDialog.cancel }).click();

    await row.getByRole('button', { name: fixture.title, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: stepTitle('1.1') })).toBeVisible();
    await expectBrand(page);
    const open = page.getByRole('button', { name: ru.card.openScreen, exact: true });
    await open.focus();
    // После клика мышью focus() не включает :focus-visible. Проверяем
    // возвращение к кнопке клавиатурой, как при реальной навигации.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(open).toBeFocused();
    await expect(open).toHaveCSS('outline-color', 'rgb(71, 105, 255)');
    await expect(open).toHaveCSS('outline-style', 'solid');
    await page.screenshot({ path: `test-results/brand/card-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await info.attach(`Тема ${width}`, { path: `test-results/brand/card-${width}.png` });
  });
}
