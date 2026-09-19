// Каталог A5/A5.1 в браузере — SPEC §4.2:243-259. Юнит-уровень (данные, поиск,
// состояния, зонд стора) — tests/Catalog.test.tsx; здесь — то, что нельзя
// увидеть в jsdom: реальный клик по произвольной ячейке строки (вся строка —
// кнопка, SPEC §4.2:254), фокус клавиатурой, Enter, вычисленные стили
// hover/фокуса, настоящее скачивание файла и сеть (ТК 31 — SPEC §8:427).
//
// «Общие» приходят из собранного public/scenarios/index.json (predev →
// npm run scenarios из scenarios/deployment-demo.xlsx, CLAUDE.md: не
// придумывать содержание сценария) — числа и title сверены с
// tests/fixture.test.ts (ТК 1, SPEC §8:397): 3 блока, 29 шагов, 24 со ссылкой.
// Дата «Обновлён» берётся из git-истории файла, поэтому проверяется
// регуляркой, а не точным значением.
//
// «Мои» — page.addInitScript пишет в localStorage два сценария на основе
// tests/fixtures/deployment-demo.json (эталон содержания, CLAUDE.md), только
// в тестах, которым нужны непустые «Мои» — иначе (C1, C6, C7) раздел должен
// остаться в состоянии A5.1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ru } from '../src/i18n/ru';
import { LIBRARY_KEY } from '../src/state/library';
import type { ScenarioIndex } from '../src/model/scenarioIndex';
import type { Scenario } from '../src/model/schema';

const FIXTURE_JSON_PATH = fileURLToPath(
  new URL('../tests/fixtures/deployment-demo.json', import.meta.url),
);
const fixture = JSON.parse(readFileSync(FIXTURE_JSON_PATH, 'utf8')) as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

// Собранные npm run scenarios файлы (predev перед playwright webServer) —
// та же пара, что читает браузер (SHARED_INDEX_URL, sharedScenarioUrl).
const INDEX_JSON_PATH = fileURLToPath(new URL('../public/scenarios/index.json', import.meta.url));
const SHARED_SCENARIO_JSON_PATH = fileURLToPath(
  new URL('../public/scenarios/deployment-demo.json', import.meta.url),
);

/** `new Date(y, m-1, d, h, min).toISOString()` — как в tests/date.test.ts: не зависит от TZ машины. */
function localIso(y: number, m: number, d: number, h: number, min: number): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

/** Не «сегодня» (18.09.2026) ни в одном разумном часовом поясе — SPEC §4.2:253 даёт «ДД.ММ.ГГГГ». */
const OLD_LOADED_AT = localIso(2020, 6, 15, 12, 0);
const OLD_LOADED_AT_TEXT = '15.06.2020';

/** index.json с «Обновлён» deployment-demo сдвинутым на OLD_LOADED_AT. */
function buildOldIndex(): ScenarioIndex {
  const original = JSON.parse(readFileSync(INDEX_JSON_PATH, 'utf8')) as ScenarioIndex;
  return {
    ...original,
    builtAt: OLD_LOADED_AT,
    items: original.items.map((item) =>
      item.id === 'deployment-demo' ? { ...item, loadedAt: OLD_LOADED_AT } : item,
    ),
  };
}

/** Полный файл общего сценария с тем же сдвинутым loadedAt, что и в index.json выше. */
function buildOldSharedScenario(): Scenario {
  const original = JSON.parse(readFileSync(SHARED_SCENARIO_JSON_PATH, 'utf8')) as Scenario;
  return { ...original, loadedAt: OLD_LOADED_AT };
}

interface CellBox {
  x: number;
  width: number;
}

/** x и ширина каждой `td` строки, округлённые до пикселя (антиалиасинг субпикселей). */
async function cellBoxes(row: Locator): Promise<CellBox[]> {
  return row.evaluate((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => {
      const rect = td.getBoundingClientRect();
      return { x: Math.round(rect.x), width: Math.round(rect.width) };
    }),
  );
}

/** 7-я ячейка (действие) — после toHaveLength(7) в вызывающем коде она точно есть. */
function actionColumn(boxes: CellBox[]): CellBox {
  const box = boxes[6];
  if (box === undefined) {
    throw new Error('нет 7-й колонки (действие)');
  }
  return box;
}

/** «сегодня, ЧЧ:ММ» либо «ДД.ММ.ГГГГ» (SPEC §4.2:253) — дата общего берётся из git. */
const DATE_RE = /^(сегодня, \d{2}:\d{2}|\d{2}\.\d{2}\.\d{4})$/;

interface LocalScenarioJson {
  schema: 1;
  id: string;
  source: 'local';
  title: string;
  module: string;
  map: string;
  fileName: string;
  loadedAt: string;
  blocks: { n: number; title: string; sheet: string; steps: Record<string, unknown>[] }[];
}

function localScenario(id: string, loadedAt: string, fileName: string): LocalScenarioJson {
  return {
    schema: 1,
    id,
    source: 'local',
    title: fixture.title,
    module: fixture.module,
    map: fixture.map,
    fileName,
    loadedAt,
    blocks: fixture.blocks.map((b, i) => ({
      n: i + 1,
      title: b.title,
      sheet: `Блок ${i + 1}`,
      steps: b.steps,
    })),
  };
}

/** Пишет «Мои» в localStorage до первого скрипта страницы (SPEC §3.6:201). Новее — сверху (§3.6:204). */
async function seedMyScenarios(page: Page): Promise<void> {
  const older = localScenario('my-deploy-pilot', '2026-09-15T12:00:00.000Z', 'pilot.xlsx');
  const newer = localScenario(
    'my-deployment-demo',
    new Date().toISOString(),
    'Deployment_demo_v2.xlsx',
  );
  await page.addInitScript(
    (args: { key: string; items: LocalScenarioJson[] }) => {
      window.localStorage.setItem(args.key, JSON.stringify({ schema: 1, items: args.items }));
    },
    { key: LIBRARY_KEY, items: [older, newer] },
  );
}

test.describe('C1 — каталог с данными (ТК 26, SPEC §8:422)', () => {
  test('h1, строка общего с числами и датой, «Мои» пусты (A5.1), клик по ячейке открывает сценарий', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();

    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    const row = shared.locator('tr[data-scenario-id="deployment-demo"]');
    await expect(row).toContainText('Deployment — демо-сценарий');
    await expect(row).toContainText('deployment-demo.xlsx');
    await expect(row).toContainText('SNP');
    await expect(row.locator('td').nth(2)).toHaveText('3');
    await expect(row.locator('td').nth(3)).toHaveText('29');
    await expect(row.locator('td').nth(4)).toHaveText('24');
    await expect(row.locator('td').nth(5)).toHaveText(DATE_RE);
    await expect(shared.locator('[data-count]')).toHaveText('1');

    const local = page.getByRole('region', { name: ru.catalog.localTitle });
    await expect(local.getByText(ru.catalog.localEmpty)).toBeVisible();

    // Клик по ячейке «Шагов» (не по названию) — вся строка кнопка (SPEC §4.2:254).
    await row.locator('td').nth(3).click();
    await expect(page.getByRole('banner')).toContainText('Deployment — демо-сценарий');
    // Каталог скрыт: его h1 «Сценарии» больше не в документе. Не любой h1 —
    // открытая карточка шага рисует свой h1 с названием шага (SPEC §4.4:273, DN-26).
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});

test.describe('C2 — Enter и фокус строки (SPEC §4.2:254)', () => {
  test('Tab из поиска фокусирует первую строку; фокус даёт акцент/фон/шеврон; Enter открывает', async ({
    page,
  }) => {
    await page.goto('/');

    // Пока index.json не отдан, «Общие» показывают скелеты без фокусируемых
    // элементов (SPEC §4.2:256) — под параллельной нагрузкой e2e-раннера
    // (несколько воркеров бьют в один dev-сервер) загрузка иногда не успевает
    // завершиться к моменту Tab, и фокус уходит дальше, в «Мои» (A5.1,
    // всегда отрисованы). Дожидаемся настоящей строки, чтобы Tab был
    // детерминирован.
    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    const row = shared.locator('tr[data-scenario-id="deployment-demo"]');
    await expect(row).toBeVisible();

    await page.getByRole('searchbox', { name: ru.catalog.searchPlaceholder }).click();
    await page.keyboard.press('Tab');

    const openButton = row.getByRole('button', { name: 'Deployment — демо-сценарий' });
    await expect(openButton).toBeFocused();

    const cell = row.locator('td').first();
    const computed = await cell.evaluate((el) => {
      const style = getComputedStyle(el);
      return { boxShadow: style.boxShadow, background: style.backgroundColor };
    });
    expect(computed.boxShadow).toContain('inset');
    expect(computed.boxShadow).toContain('3px');
    expect(computed.background).toBe('rgb(250, 243, 255)');
    await expect(row.locator('svg[data-icon="chevron-right"]')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('banner')).toContainText('Deployment — демо-сценарий');
  });
});

test.describe('C3 — «Мои» (SPEC §3.6:204, §4.2:255)', () => {
  test('новые сверху, дата первой — «сегодня, ЧЧ:ММ», корзина не открывает сценарий, поиск фильтрует «Мои»', async ({
    page,
  }) => {
    await seedMyScenarios(page);
    await page.goto('/');

    const local = page.getByRole('region', { name: ru.catalog.localTitle });
    const rows = local.locator('tr[data-scenario-id]');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute('data-scenario-id', 'my-deployment-demo');
    await expect(rows.nth(0).locator('td').nth(5)).toHaveText(/^сегодня, \d{2}:\d{2}$/);

    await rows.nth(0).getByRole('button', { name: ru.catalog.deleteFromBrowser }).click();
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();
    await expect(page.getByRole('banner')).not.toContainText(ru.header.back);

    const search = page.getByRole('searchbox', { name: ru.catalog.searchPlaceholder });
    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });

    await search.fill('DEPLOY');
    // Оба «мои» унаследовали fixture.title («Deployment — демо-сценарий»,
    // seedMyScenarios выше) — «DEPLOY» совпадает с обоими, не с одним.
    await expect(local.locator('tr[data-scenario-id]')).toHaveCount(2);
    await expect(shared.locator('tr[data-scenario-id]')).toHaveCount(1);

    await search.fill('деплой');
    await expect(local.getByText(ru.catalog.notFound)).toBeVisible();
    await expect(shared.getByText(ru.catalog.notFound)).toBeVisible();
  });
});

test.describe('C4 — ТК 31 в браузере (SPEC §8:427)', () => {
  test('404 у index.json → текст и «Повторить»; «Мои» открываются; после починки — строка появилась', async ({
    page,
  }) => {
    await seedMyScenarios(page);
    await page.route('**/scenarios/index.json', (route) =>
      route.fulfill({ status: 404, body: 'not found' }),
    );
    await page.goto('/');

    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    await expect(shared.getByText(ru.shared.loadFailed)).toBeVisible();
    const retry = shared.getByRole('button', { name: ru.shared.retry });
    await expect(retry).toBeVisible();

    const local = page.getByRole('region', { name: ru.catalog.localTitle });
    await local
      .locator('tr[data-scenario-id="my-deployment-demo"]')
      .getByRole('button', { name: 'Deployment — демо-сценарий' })
      .click();
    await expect(page.getByRole('banner')).toContainText('Deployment — демо-сценарий');

    // page.goto('/'), не page.reload(): после DN-16 адрес открытого «моего»
    // хранит ?scenario=...&step=... (SPEC §4.7:320,325), и reload() снова
    // открыл бы карточку из адреса вместо каталога с 404 у index.json —
    // не то, что проверяет этот тест (ТК 31, C4).
    await page.goto('/');
    await expect(shared.getByText(ru.shared.loadFailed)).toBeVisible();
    await page.unroute('**/scenarios/index.json');
    await retry.click();
    await expect(shared.locator('tr[data-scenario-id="deployment-demo"]')).toBeVisible();
  });
});

test.describe('C5 — загрузка «Общих» (SPEC §4.2:256)', () => {
  test('пока index.json не отдан — 3 строки-скелета; после ответа — обычные строки', async ({
    page,
  }) => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Вызов через отдельно объявленную функцию — иначе TS сужает release до
    // `never` при чтении в той же области видимости, что и присвоение внутри
    // исполнителя Promise (особенность контроля потока TS, не относится к
    // проверяемому поведению).
    function releaseGate(): void {
      release?.();
    }
    await page.route('**/scenarios/index.json', async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto('/');
    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    await expect(shared.locator('tr[data-skeleton="true"]')).toHaveCount(3);

    // Высоты шапки раздела и строки не меняются после загрузки: шапка без числа
    // та же (design/catalog-mockup.html:41–43), скелет — как строка данных. Ширины
    // колонок не сравниваем: ширина даты зависит от git-даты файла (SPEC §3.7:218).
    const height = (selector: string) =>
      shared.evaluate(
        (section, css) => section.querySelector(css)?.getBoundingClientRect().height ?? 0,
        selector,
      );
    const headWhileLoading = await height(':scope > div');
    const skeletonRow = await height('tr[data-skeleton="true"]');

    releaseGate();
    await expect(shared.locator('tr[data-scenario-id]')).toHaveCount(1);
    expect(await height(':scope > div')).toBe(headWhileLoading);
    // У единственной строки данных нет нижней границы (design/catalog-mockup.html:48), у скелета она есть.
    expect(Math.abs((await height('tr[data-scenario-id]')) - skeletonRow)).toBeLessThanOrEqual(1);
  });

  test('колонки не сдвигаются после загрузки и совпадают у «Общих» и «Моих» при 1024×768, дата не «сегодня» (CAT:45, §4.2:252-253)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedMyScenarios(page);

    const oldIndex = buildOldIndex();
    const oldSharedScenario = buildOldSharedScenario();

    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    function releaseGate(): void {
      release?.();
    }
    await page.route('**/scenarios/index.json', async (route) => {
      await gate;
      await route.fulfill({ json: oldIndex });
    });
    // Сценарий не открывается в этом тесте — маршрут только держит index.json и файл
    // сценария согласованными (одинаковый loadedAt), как оба пишет npm run scenarios.
    await page.route('**/scenarios/deployment-demo.json', (route) =>
      route.fulfill({ json: oldSharedScenario }),
    );

    await page.goto('/');
    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    const local = page.getByRole('region', { name: ru.catalog.localTitle });

    // Раскладка колонок задаёт табличная шапка (table-layout: fixed, Catalog.module.css)
    // и не зависит от состояния: скелет — те же 7 `td`, что у строки данных.
    const skeletonRows = shared.locator('tr[data-skeleton="true"]');
    await expect(skeletonRows).toHaveCount(3);
    const loadingBoxes = await cellBoxes(skeletonRows.first());
    expect(loadingBoxes).toHaveLength(7);
    // Колонка действия 48 px (§4.2:252: 8 + 32 корзина/шеврон + 8) — уже во время загрузки.
    expect(actionColumn(loadingBoxes).width).toBe(48);

    releaseGate();
    const dataRow = shared.locator('tr[data-scenario-id="deployment-demo"]');
    await expect(dataRow).toBeVisible();
    await expect(dataRow.locator('td').nth(5)).toHaveText(OLD_LOADED_AT_TEXT);

    const loadedBoxes = await cellBoxes(dataRow);
    // x и ширина каждой колонки «Общих» — те же, что были у строки-скелета.
    expect(loadedBoxes).toEqual(loadingBoxes);

    const localRow = local.locator('tr[data-scenario-id]').first();
    await expect(localRow).toBeVisible();
    const localBoxes = await cellBoxes(localRow);
    // Границы колонок «Общих» и «Моих» совпадают (общая шапка-раскладка).
    expect(localBoxes).toEqual(loadedBoxes);
    expect(actionColumn(localBoxes).width).toBe(48);
  });
});

test.describe('C6 — шаблон из A5.1 (SPEC §6:368, §4.2:257)', () => {
  test('«Скачать шаблон» отдаёт файл с ожидаемым именем', async ({ page }) => {
    await page.goto('/');
    const local = page.getByRole('region', { name: ru.catalog.localTitle });

    const downloadPromise = page.waitForEvent('download');
    await local.getByRole('button', { name: ru.catalog.downloadTemplate }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(ru.template.fileName);
  });
});

test.describe('C7 — «Загрузить из Excel» из A5.1 (SPEC §4.2:257)', () => {
  test('открывает диалог «Загрузка из Excel»', async ({ page }) => {
    await page.goto('/');
    const local = page.getByRole('region', { name: ru.catalog.localTitle });

    await local.getByRole('button', { name: ru.catalog.upload }).click();
    await expect(page.getByRole('dialog', { name: ru.importModal.title })).toBeVisible();
  });
});
