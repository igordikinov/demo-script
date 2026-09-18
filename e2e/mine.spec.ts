// «Мои» в браузере: запись при загрузке (SPEC §4.8:350, §3.6:203-205) и окно
// удаления A5.2 (SPEC §4.2:255). ТК 18 (SPEC §8:414) указывает
// e2e/import.spec.ts, но по решению оркестратора первая часть ТК 18 (до
// «сценарий открыт (название в шапке)») проверяется здесь — bd DN-25. Карточка
// 1.1, Tag «мой» в шапке и «‹ Сценарии» → строка в «Моих» довешиваются после
// слияния DN-26 (Tag и «‹ Сценарии» — src/components/Header/**, зона DN-26).
//
// Юнит-уровень того же поведения — tests/import.test.tsx (ТК 27/28) и
// tests/DeleteDialog.test.tsx; здесь — то, что видно только в браузере:
// реальные 480 px окна A5.2 и фокус после реального клика.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ru } from '../src/i18n/ru';
import { LIBRARY_KEY } from '../src/state/library';

const FIXTURE_PATH = fileURLToPath(
  new URL('../tests/fixtures/deployment-demo.xlsx', import.meta.url),
);
const FIXTURE_JSON_PATH = fileURLToPath(
  new URL('../tests/fixtures/deployment-demo.json', import.meta.url),
);
const fixture = JSON.parse(readFileSync(FIXTURE_JSON_PATH, 'utf8')) as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

/** SPEC §3.6:203: 'my-' + слаг названия фикстуры (см. tests/library.test.ts:26-28). */
const FIX_ID = 'my-deployment-demo-scenariy';

interface StoredLibrary {
  items: { id: string }[];
}

async function storedLibraryIds(page: Page): Promise<string[]> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), LIBRARY_KEY);
  if (raw === null) return [];
  return (JSON.parse(raw) as StoredLibrary).items.map((item) => item.id);
}

/** Один «мой» в localStorage до первого скрипта страницы — копия приёма e2e/catalog.spec.ts:109-135. */
async function seedOneMine(page: Page, id: string): Promise<void> {
  const scenario = {
    schema: 1,
    id,
    source: 'local',
    title: fixture.title,
    module: fixture.module,
    map: fixture.map,
    fileName: 'Deployment_demo_v2.xlsx',
    loadedAt: new Date().toISOString(),
    blocks: fixture.blocks.map((b, i) => ({
      n: i + 1,
      title: b.title,
      sheet: `Блок ${i + 1}`,
      steps: b.steps,
    })),
  };
  await page.addInitScript(
    (args: { key: string; scenario: unknown }) => {
      window.localStorage.setItem(args.key, JSON.stringify({ schema: 1, items: [args.scenario] }));
    },
    { key: LIBRARY_KEY, scenario },
  );
}

test.describe('M1 — ТК 18 (SPEC §8:414), часть 1: загрузка записывается в «Мои»', () => {
  test('пустые «Мои» → «Загрузить из Excel» → файл фикстуры → «Добавить в мои» → тост, сценарий открыт', async ({
    page,
  }) => {
    await page.goto('/');
    const local = page.getByRole('region', { name: ru.catalog.localTitle });
    await expect(local.getByText(ru.catalog.localEmpty)).toBeVisible();

    await page.getByRole('banner').getByRole('button', { name: ru.header.upload }).click();
    const dialog = page.getByRole('dialog', { name: ru.importModal.title });
    await expect(dialog).toBeVisible();

    await dialog.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
    await expect(dialog.getByText(ru.importModal.step2)).toBeVisible();
    // «Мои» пусты — блока совпадения названия (A4′) нет (SPEC §4.8:341).
    await expect(dialog.getByRole('radiogroup')).toHaveCount(0);

    const submit = dialog.getByRole('button', { name: ru.importModal.submitAdd });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toHaveText(ru.importModal.added(29));
    await expect(page.getByRole('banner')).toContainText(fixture.title);

    expect(await storedLibraryIds(page)).toEqual([FIX_ID]);
  });
});

test.describe('M2 — окно удаления A5.2 в браузере (SPEC §4.2:255)', () => {
  test('корзина → окно 480px, фокус на «Отмена»; «Удалить» → тост, «Мои» снова пусты', async ({
    page,
  }) => {
    await seedOneMine(page, FIX_ID);
    await page.goto('/');

    const local = page.getByRole('region', { name: ru.catalog.localTitle });
    const row = local.locator(`tr[data-scenario-id="${FIX_ID}"]`);
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: ru.catalog.deleteFromBrowser }).click();

    const dialog = page.getByRole('dialog', { name: ru.deleteDialog.title });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    if (box === null) throw new Error('окно A5.2 не видно');
    expect(Math.round(box.width)).toBe(480);

    await expect(dialog.getByRole('button', { name: ru.deleteDialog.cancel })).toBeFocused();
    await expect(dialog).toContainText(ru.deleteDialog.body(fixture.title));

    await dialog.getByRole('button', { name: ru.deleteDialog.confirm }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toHaveText(ru.deleteDialog.deleted);
    await expect(local.getByText(ru.catalog.localEmpty)).toBeVisible();
    expect(await storedLibraryIds(page)).toEqual([]);
  });
});
