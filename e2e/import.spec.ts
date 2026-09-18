// Окно загрузки A4 — SPEC §4.8. ТК 19 (§8:415, дословно): «файл с E04 →
// «Добавить в мои» disabled, подсказка видна;
// «Отмена» — прежний сценарий на месте». §10.4 (:550-553, visual-qa) сюда не
// входит — только поведение. Строки — из src/i18n/ru.ts (эталон), книги
// E04/R13 собираются writeWorkbook (src/excel/write.ts), как FIX —
// tests/fixtures/deployment-demo.xlsx (CLAUDE.md: не выдумывать содержание).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { ru } from '../src/i18n/ru';
import { writeWorkbook, type SheetSpec } from '../src/excel/write';

const FIXTURE_PATH = fileURLToPath(
  new URL('../tests/fixtures/deployment-demo.xlsx', import.meta.url),
);
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Книга с E04 (SPEC §8:415) — пустой «Шаг» в строке 1.1, как в tests/ImportModal.test.tsx. */
async function e04Buffer(): Promise<Buffer> {
  const sheets: SheetSpec[] = [
    {
      name: 'Блок 1',
      rows: [
        ['№ шага', 'Шаг', 'Ссылка'],
        ['1.1', '', 'https://a.example'],
        ['1.2', 'B', 'https://b.example'],
      ],
    },
  ];
  return Buffer.from(await writeWorkbook(sheets));
}

/** Книга из 5 шагов без ссылок — отчёт 13 строк (5×W02 + I03 + 7×I02), SPEC §4.8:339. */
async function r13Buffer(): Promise<Buffer> {
  const rows: (string | number)[][] = [['№ шага', 'Шаг']];
  for (let i = 1; i <= 5; i += 1) rows.push([`1.${i}`, `Шаг ${i}`]);
  return Buffer.from(await writeWorkbook([{ name: 'Блок 1', rows }]));
}

test.describe('E1 — ТК 19 (SPEC §8:415)', () => {
  test('загрузка чистого файла, ошибка блокирует кнопку, «Отмена» оставляет прежний сценарий', async ({
    page,
  }) => {
    await page.goto('/');
    // Скоуп на <header> (role="banner"): A5.1 (пустые «Мои») тоже рисует
    // primary «Загрузить из Excel» тем же текстом (SPEC §4.2:257), без
    // скоупа locator находит два элемента (strict mode violation).
    const header = page.getByRole('banner');
    await header.getByRole('button', { name: ru.header.upload }).click();
    const dialog = page.getByRole('dialog', { name: ru.importModal.title });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: ru.importModal.dropPrompt })).toBeFocused();

    const input = dialog.locator('input[type="file"]');
    await input.setInputFiles(FIXTURE_PATH);
    await expect(
      dialog.getByText(ru.summary.text({ sheets: 3, blocks: 3, steps: 29, withLink: 24 })),
    ).toBeVisible();

    const submit = dialog.getByRole('button', { name: ru.importModal.submitAdd });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toHaveText(ru.importModal.added(29));
    await expect(page.getByRole('banner')).toContainText('Deployment — демо-сценарий');

    // Повторное открытие: файл с E04 блокирует primary и показывает подсказку.
    await header.getByRole('button', { name: ru.header.upload }).click();
    await expect(dialog).toBeVisible();
    await input.setInputFiles({ name: 'bad.xlsx', mimeType: XLSX_MIME, buffer: await e04Buffer() });
    await expect(dialog.getByText(ru.report.levels.danger)).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(dialog.getByText(ru.importModal.fixErrors)).toBeVisible();

    // «Отмена» — прежний сценарий на месте (карточка не рендерится, DN-24/26 — проверка по шапке).
    await dialog.getByRole('button', { name: ru.importModal.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('banner')).toContainText('Deployment — демо-сценарий');
    await expect(header.getByRole('button', { name: ru.header.upload })).toBeFocused();
  });
});

test.describe('E2 — шаблон (SPEC §6:368, §7:381)', () => {
  test('«Скачать шаблон» отдаёт xlsx с ожидаемым именем', async ({ page }) => {
    await page.goto('/');
    // Скоуп на <header>: см. комментарий в E1 выше.
    await page.getByRole('banner').getByRole('button', { name: ru.header.upload }).click();
    const dialog = page.getByRole('dialog', { name: ru.importModal.title });

    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: ru.importModal.downloadTemplate }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(ru.template.fileName);
    const streamPath = await download.path();
    if (streamPath === null) throw new Error('путь скачанного файла отсутствует');
    const head = readFileSync(streamPath).subarray(0, 4);
    expect([...head]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

test.describe('E3 — прокрутка отчёта (SPEC §4.8:339)', () => {
  test('R13 (13 строк) — max-height 360px и overflow-y auto', async ({ page }) => {
    await page.goto('/');
    // Скоуп на <header>: см. комментарий в E1 выше.
    await page.getByRole('banner').getByRole('button', { name: ru.header.upload }).click();
    const dialog = page.getByRole('dialog', { name: ru.importModal.title });
    const input = dialog.locator('input[type="file"]');
    await input.setInputFiles({ name: 'r13.xlsx', mimeType: XLSX_MIME, buffer: await r13Buffer() });
    await expect(dialog.getByText(ru.importModal.step2)).toBeVisible();

    const scrollBox = dialog.locator('[data-scroll="true"]');
    await expect(scrollBox).toBeVisible();
    const styles = await scrollBox.evaluate((el) => {
      const computed = getComputedStyle(el);
      return { maxHeight: computed.maxHeight, overflowY: computed.overflowY };
    });
    expect(styles.maxHeight).toBe('360px');
    expect(styles.overflowY).toBe('auto');
  });
});

test.describe('E4 — высота зоны выбора во время разбора (SPEC §4.8:337)', () => {
  test('«Проверяю файл…» не меняет высоту зоны: ссылка и подвал не прыгают', async ({ page }) => {
    // SheetJS задерживается, пока не снята мерка: состояние разбора держится сколько нужно.
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/xlsx\.js(\?|$)/, async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto('/');
    // Скоуп на <header>: см. комментарий в E1 выше.
    await page.getByRole('banner').getByRole('button', { name: ru.header.upload }).click();
    const dialog = page.getByRole('dialog', { name: ru.importModal.title });
    const zoneHeight = async (name: string): Promise<number> => {
      const box = await dialog.getByRole('button', { name }).boundingBox();
      if (box === null) throw new Error(`зона «${name}» не видна`);
      return box.height;
    };

    const emptyHeight = await zoneHeight(ru.importModal.dropPrompt);
    await dialog.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
    await expect(dialog.getByRole('button', { name: ru.importModal.checking })).toBeVisible();
    expect(await zoneHeight(ru.importModal.checking)).toBe(emptyHeight);

    release();
    await expect(dialog.getByText(ru.importModal.step2)).toBeVisible();
    expect(await zoneHeight('deployment-demo.xlsx')).toBe(emptyHeight);
  });
});
