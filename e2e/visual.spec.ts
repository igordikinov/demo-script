// Снимки для сверки глазами (visual-qa), не попиксельные эталоны Playwright
// (`toHaveScreenshot` здесь нет — SPEC требует сверку глазами, а не автосравнение):
// ТК 21 (SPEC §8:417) — карточка 1.10 и окно с отчётом, 1440×1000, сверка с
// `design/v2-card.png` и `design/v2-import.png`; ТК 33 (SPEC §8:429) —
// каталог с данными, A5.1 и окно A4′, 1440×900, сверка с `design/v3-catalog.png`
// и `design/catalog-mockup.png`.
//
// Снимки лежат в test-results/visual/ (в .gitignore — CLAUDE.md: не класть
// снимки в репозиторий) и печатаются в отчёт (console.log + testInfo.attach)
// для visual-qa. Playwright стирает весь test-results/ в начале каждого
// прогона — снимки нужно смотреть сразу после запуска, до следующего.
//
// Внешние адреса (стенд из фикстуры, process-map) глушатся stubStand/
// stubProcessMap (e2e/helpers.ts) — тесты в реальную сеть не ходят. Экраны
// собираются в настоящем приложении (DN-24/DN-26): общие — из predev
// (npm run scenarios), «Мои» — через seedLibrary/localScenario в localStorage
// (SPEC §3.6:201), A4′ — загрузка фикстуры tests/fixtures/deployment-demo.xlsx
// при «моём» с тем же названием (SPEC §4.8:341).
//
// В каждом тесте — 1-2 обычных ассерта состояния (не про пиксели), чтобы
// снимок пустого/недособранного экрана делал тест красным, а не просто плохой
// картинкой без сигнала.
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { ru } from '../src/i18n/ru';
import { writeWorkbook, type SheetSpec } from '../src/excel/write';
import {
  fixture,
  localScenario,
  seedLibrary,
  stepTitle,
  stubProcessMap,
  stubStand,
} from './helpers';

const VISUAL_DIR = fileURLToPath(new URL('../test-results/visual', import.meta.url));
const FIXTURE_XLSX_PATH = fileURLToPath(
  new URL('../tests/fixtures/deployment-demo.xlsx', import.meta.url),
);
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Шрифты догружены и курсор мыши убран с угла — иначе первый снимок процесса иногда ловит FOUT/подсказку. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.mouse.move(0, 0);
}

/** Снимок страницы: путь в test-results/visual/, печать в отчёт для visual-qa. */
async function shot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  fullPage: boolean,
): Promise<void> {
  await settle(page);
  const path = join(VISUAL_DIR, name);
  await page.screenshot({ path, fullPage, animations: 'disabled', caret: 'hide' });
  console.log(`Снимок (ТК 21/33, visual-qa): ${path}`);
  await testInfo.attach(name, { path });
}

/** Снимок самого модального окна: `.overlay` (position: fixed — src/components/ui/Modal.module.css:8, SPEC §4.8:329 «Модальное окно 720 px…») выше вьюпорта 1440×900/1000. */
async function shotDialog(dialog: Locator, testInfo: TestInfo, name: string): Promise<void> {
  await settle(dialog.page());
  const path = join(VISUAL_DIR, name);
  await dialog.screenshot({ path, animations: 'disabled', caret: 'hide' });
  console.log(`Снимок (ТК 21/33, visual-qa): ${path}`);
  await testInfo.attach(name, { path });
}

/**
 * Книга с E04 (пустой «Шаг»), W01 (http://) и W02 (нет ссылки) — отчёт с
 * ошибкой, предупреждениями и I02/I03 (SPEC §3.5, как в e2e/import.spec.ts).
 */
async function reportBuffer(): Promise<Buffer> {
  const sheets: SheetSpec[] = [
    {
      name: 'Блок 1',
      rows: [
        ['№ шага', 'Шаг', 'Ссылка'],
        ['1.1', '', 'http://a.example'],
        ['1.2', 'Шаг без ссылки', ''],
      ],
    },
  ];
  return Buffer.from(await writeWorkbook(sheets));
}

test.describe('V1 — ТК 21 (SPEC §8:417): карточка 1.10, 1440×1000 — design/v2-card.png', () => {
  test('card-1.10-1440x1000.png', async ({ page }, testInfo) => {
    await stubStand(page);
    await stubProcessMap(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/?scenario=deployment-demo&step=1.10');

    const heading = page.getByRole('heading', { level: 1, name: stepTitle('1.10') });
    await expect(heading).toBeVisible();

    // fullPage: карточка целиком (шапка + полоса схемы) выше вьюпорта 1000px —
    // без fullPage кадр обрезал бы низ карточки (см. design/v2-card.png, 1440×1310).
    await shot(page, testInfo, 'card-1.10-1440x1000.png', true);
  });
});

test.describe('V2 — ТК 21 (SPEC §8:417): окно с отчётом, 1440×1000 — design/v2-import.png', () => {
  test('import-report-1440x1000.png и import-report-dialog.png', async ({ page }, testInfo) => {
    await stubStand(page);
    await stubProcessMap(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/?scenario=deployment-demo&step=1.10');
    await expect(page.getByRole('heading', { level: 1, name: stepTitle('1.10') })).toBeVisible();

    await page.getByRole('banner').getByRole('button', { name: ru.header.upload }).click();
    const dialog = page.getByRole('dialog', { name: ru.importModal.title });
    await expect(dialog).toBeVisible();

    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'report.xlsx',
      mimeType: XLSX_MIME,
      buffer: await reportBuffer(),
    });
    await expect(dialog.getByText(ru.report.codes.E04())).toBeVisible();
    const submit = dialog.getByRole('button', { name: ru.importModal.submitAdd });
    await expect(submit).toBeDisabled();
    await expect(dialog.getByText(ru.importModal.fixErrors)).toBeVisible();

    await shot(page, testInfo, 'import-report-1440x1000.png', false);

    // Окно (`.overlay`, position: fixed — src/components/ui/Modal.module.css:8,
    // SPEC §4.8:329 «Модальное окно 720 px…») выше вьюпорта: подвал
    // с «Отмена» и primary изначально ниже видимой области. Без прокрутки к
    // нему locator.screenshot() на элементе, часть которого лежит за
    // пределами исходного вьюпорта, отдаёт только фон подвала без текста
    // кнопок (проверено пробой) — прокручиваем перед снимком самого окна, как
    // в V5 ниже.
    const cancelButton = dialog.getByRole('button', { name: ru.importModal.cancel });
    await cancelButton.scrollIntoViewIfNeeded();
    await shotDialog(dialog, testInfo, 'import-report-dialog.png');
  });
});

test.describe('V3 — ТК 33 (SPEC §8:429): каталог с данными, 1440×900 — design/v3-catalog.png', () => {
  test('catalog-1440x900.png', async ({ page }, testInfo) => {
    await stubStand(page);
    await stubProcessMap(page);
    // «Обновлён» «сегодня, ЧЧ:ММ» и «15.09.2026» — оба формата даты SPEC §4.2:251, 253.
    await seedLibrary(page, [
      localScenario('my-deploy-pilot', '2026-09-15T12:00:00.000Z', 'pilot.xlsx'),
      localScenario('my-deployment-demo', new Date().toISOString(), 'Deployment_demo_v2.xlsx'),
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();
    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    await expect(shared.locator('tr[data-scenario-id="deployment-demo"]')).toBeVisible();
    const local = page.getByRole('region', { name: ru.catalog.localTitle });
    await expect(local.locator('tr[data-scenario-id]')).toHaveCount(2);

    await shot(page, testInfo, 'catalog-1440x900.png', true);
  });
});

test.describe('V4 — ТК 33 (SPEC §8:429, §4.2:257): A5.1, 1440×900 — design/catalog-mockup.png', () => {
  test('catalog-a5-1-1440x900.png', async ({ page }, testInfo) => {
    await stubStand(page);
    await stubProcessMap(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const local = page.getByRole('region', { name: ru.catalog.localTitle });
    await expect(local.getByText(ru.catalog.localEmpty)).toBeVisible();

    await shot(page, testInfo, 'catalog-a5-1-1440x900.png', true);
  });
});

test.describe('V5 — ТК 33 (SPEC §8:429, §4.8:341): окно A4′, 1440×900 — design/v3-catalog.png', () => {
  test('a4-prime-1440x900.png и a4-prime-dialog.png', async ({ page }, testInfo) => {
    await stubStand(page);
    await stubProcessMap(page);
    await seedLibrary(page, [
      localScenario('my-deployment-demo', new Date().toISOString(), 'Deployment_demo_v2.xlsx'),
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByRole('banner').getByRole('button', { name: ru.header.upload }).click();
    const dialog = page.getByRole('dialog', { name: ru.importModal.title });
    await expect(dialog).toBeVisible();

    await dialog.locator('input[type="file"]').setInputFiles(FIXTURE_XLSX_PATH);
    const radiogroup = dialog.getByRole('radiogroup');
    await radiogroup.waitFor();
    // Окно (`.overlay`, position: fixed — src/components/ui/Modal.module.css:8,
    // SPEC §4.8:329 «Модальное окно 720 px…») выше вьюпорта: без
    // прокрутки A4′ и подвал остаются за кадром.
    await radiogroup.scrollIntoViewIfNeeded();

    await expect(dialog.getByText(ru.importModal.replaceOption)).toBeVisible();
    await expect(
      dialog.getByText(
        ru.importModal.addAsNewOption(ru.importModal.numberedTitle(fixture.title, 2)),
      ),
    ).toBeVisible();

    await shot(page, testInfo, 'a4-prime-1440x900.png', false);
    await shotDialog(dialog, testInfo, 'a4-prime-dialog.png');
  });
});
