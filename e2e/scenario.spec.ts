// Переходы каталог ↔ сценарий — SPEC §4.3 (полоса схемы A2, «‹ Сценарии» в
// строке подписи), §4.4:271–283 (карточка шага A3), §4.10:358 (ширина
// 1024–1920, при нехватке высоты страница прокручивается, а не
// сворачивается). DN-ysk: полосы A0 больше нет ни на одном экране, название
// сценария и Tag «общий»/«мой» нигде не показываются. Юнит-уровень (пропы,
// зонд стора, число вызовов fetchFn) — tests/App.test.tsx; здесь — то, что
// нельзя увидеть в jsdom: реальная геометрия (getBoundingClientRect,
// getComputedStyle), настоящая сеть и прокрутка страницы.
//
// Данные — из public/scenarios/{index,deployment-demo}.json (predev →
// npm run scenarios, как в e2e/catalog.spec.ts) и tests/fixtures/deployment-demo.json
// (эталон содержания, CLAUDE.md: не придумывать содержание сценария).
// «Мои» — тот же приём seedMyScenarios/localScenario, что в
// e2e/catalog.spec.ts:118–142 (общий хелпер не заводим — риск конфликта при
// мёрже с параллельными задачами).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ru } from '../src/i18n/ru';
import { LIBRARY_KEY } from '../src/state/library';

const FIXTURE_JSON_PATH = fileURLToPath(
  new URL('../tests/fixtures/deployment-demo.json', import.meta.url),
);
const fixture = JSON.parse(readFileSync(FIXTURE_JSON_PATH, 'utf8')) as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

const block1 = fixture.blocks[0];
if (block1 === undefined) {
  throw new Error('фикстура: нет блока 1');
}
const block1Steps = block1.steps as { id: string; title: string }[];
const s11 = block1Steps[0];
const s110 = block1Steps[9];
if (s11 === undefined || s110 === undefined) {
  throw new Error('фикстура: нет шагов 1.1 и 1.10 в блоке 1');
}

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

/** Копия localScenario из e2e/catalog.spec.ts:107-123. */
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

/** Копия seedMyScenarios из e2e/catalog.spec.ts:126-141: пишет «Мои» до первого скрипта страницы. */
async function seedMyScenarios(page: Page): Promise<void> {
  const mine = localScenario(
    'my-deployment-demo',
    new Date().toISOString(),
    'deployment-demo.xlsx',
  );
  await page.addInitScript(
    (args: { key: string; items: LocalScenarioJson[] }) => {
      window.localStorage.setItem(args.key, JSON.stringify({ schema: 1, items: args.items }));
    },
    { key: LIBRARY_KEY, items: [mine] },
  );
}

/** Console errors/pageerror собираются в каждом тесте, в конце ожидается []. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('S1 — общий: каталог → сценарий → шаг 1.10 → «‹ Сценарии» (SPEC §4.3:263, §4.4)', () => {
  test('полный путь без ошибок консоли', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    const row = shared.locator('tr[data-scenario-id="deployment-demo"]');
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: fixture.title }).click();

    // DN-ysk: баннера нет, название сценария и Tag «общий»/«мой» нигде не показываются.
    await expect(page.getByRole('banner')).toHaveCount(0);

    const scheme = page.getByRole('region', { name: ru.scheme.title });
    await expect(scheme).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: s11.title })).toBeVisible();
    await expect(scheme.locator('[data-step-id="1.1"]')).toHaveAttribute('aria-current', 'step');

    await scheme.locator('[data-step-id="1.10"]').click();
    await expect(page.getByRole('heading', { level: 1, name: s110.title })).toBeVisible();
    await expect(page.getByText(ru.card.position(1, 10, 11))).toBeVisible();

    await page.getByRole('button', { name: ru.scheme.back }).click();
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();
    await expect(page.getByRole('region', { name: ru.scheme.title })).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});

test.describe('S2 — «мой»: строка в «Моих» → сценарий → «‹ Сценарии» (SPEC §4.3:263)', () => {
  test('без баннера (DN-ysk), после возврата строка снова видна в «Моих»', async ({ page }) => {
    const errors = collectErrors(page);
    await seedMyScenarios(page);
    await page.goto('/');

    const local = page.getByRole('region', { name: ru.catalog.localTitle });
    const row = local.locator('tr[data-scenario-id="my-deployment-demo"]');
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: fixture.title }).click();

    await expect(page.getByRole('heading', { level: 1, name: s11.title })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);

    await page.getByRole('button', { name: ru.scheme.back }).click();
    await expect(
      page
        .getByRole('region', { name: ru.catalog.localTitle })
        .locator('tr[data-scenario-id="my-deployment-demo"]'),
    ).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('S3 — раскладка 1440×1000 (v2:43-90, SPEC §4.3, §4.4:273)', () => {
  test('полоса схемы во всю ширину под шапкой; карточка max-width 840 с отступом 32; main не режет страницу', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    await shared
      .locator('tr[data-scenario-id="deployment-demo"]')
      .getByRole('button', { name: fixture.title })
      .click();
    const scheme = page.getByRole('region', { name: ru.scheme.title });
    await scheme.locator('[data-step-id="1.10"]').click();
    await expect(page.getByRole('heading', { level: 1, name: s110.title })).toBeVisible();

    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const schemeBox = await scheme.boundingBox();
    if (schemeBox === null) {
      throw new Error('нет boundingBox у полосы схемы');
    }
    expect(Math.round(schemeBox.x)).toBe(0);
    // DN-ysk: полосы A0 нет — схема начинается от самого верха страницы.
    expect(Math.round(schemeBox.y)).toBe(0);
    expect(Math.round(schemeBox.width)).toBe(clientWidth);

    const article = page.getByRole('article');
    const articleBox = await article.boundingBox();
    if (articleBox === null) {
      throw new Error('нет boundingBox у карточки');
    }
    expect(Math.round(articleBox.x)).toBe(32);
    expect(Math.round(articleBox.y)).toBe(Math.round(schemeBox.y + schemeBox.height) + 32);
    expect(Math.round(articleBox.width)).toBe(840);

    const mainStyle = await page.getByRole('main').evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        overflowY: style.overflowY,
      };
    });
    // §4.10:358: при нехватке высоты ничего не сворачивается — страница
    // прокручивается, поэтому overflow-y не auto/scroll (в отличие от v2:83).
    expect(mainStyle).toEqual({
      paddingTop: '32px',
      paddingRight: '32px',
      paddingBottom: '32px',
      paddingLeft: '32px',
      overflowY: 'visible',
    });

    expect(errors).toEqual([]);
  });
});

test.describe('S4 — раскладка 1024×768: карточка не сжимается, скроллится страница (SPEC §4.10:358)', () => {
  test('нет горизонтальной прокрутки; после scrollTo страница прокручена', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');

    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    await shared
      .locator('tr[data-scenario-id="deployment-demo"]')
      .getByRole('button', { name: fixture.title })
      .click();
    await expect(page.getByRole('article')).toBeVisible();

    const dims = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth);
    expect(dims.scrollHeight).toBeGreaterThan(768);

    const articleBox = await page.getByRole('article').boundingBox();
    if (articleBox === null) {
      throw new Error('нет boundingBox у карточки');
    }
    expect(Math.round(articleBox.width)).toBe(840);

    await page.evaluate(() => window.scrollTo(0, 10000));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });
});

// S5 — стиль Tag источника в шапке — удалён (DN-ysk): Tag «общий»/«мой»
// нигде на экране больше не показывается, примитив ui/Tag не рендерится.
//
// S6 — длинное название в шапке, обрезка многоточием — удалён (DN-ysk):
// название сценария на экране не показывается, проверять обрезку негде.

test.describe('S7 — повторное открытие общего без повторного fetch (SPEC §3.7:230)', () => {
  test('переоткрытие того же сценария не добавляет запросов index.json/deployment-demo.json', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    let indexRequests = 0;
    let scenarioRequests = 0;
    page.on('request', (request) => {
      const url = request.url();
      if (url.endsWith('/scenarios/index.json')) indexRequests += 1;
      if (url.endsWith('/scenarios/deployment-demo.json')) scenarioRequests += 1;
    });

    await page.goto('/');
    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    const row = shared.locator('tr[data-scenario-id="deployment-demo"]');
    await row.getByRole('button', { name: fixture.title }).click();
    await expect(page.getByRole('heading', { level: 1, name: s11.title })).toBeVisible();

    // Счётчики фиксируются после первого открытия, а не как абсолютная
    // единица: dev-сервер Playwright (`npm run dev`) поднимает StoreProvider
    // под React.StrictMode (src/main.tsx), который в dev-режиме умышленно
    // запускает эффект загрузки индекса дважды (src/state/store.tsx:84-97,
    // комментарий «Флаг отмены… StrictMode запускает эффект дважды») — это не
    // повторный fetch при переоткрытии, а особенность dev-сборки. §3.7:230
    // требует «результат держится в памяти до перезагрузки», то есть нулевую
    // разницу запросов между первым и вторым открытием — это и проверяется.
    const indexAfterFirstOpen = indexRequests;
    const scenarioAfterFirstOpen = scenarioRequests;

    await page.getByRole('button', { name: ru.scheme.back }).click();
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();

    await shared
      .locator('tr[data-scenario-id="deployment-demo"]')
      .getByRole('button', { name: fixture.title })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: s11.title })).toBeVisible();

    expect(indexRequests).toBe(indexAfterFirstOpen);
    expect(scenarioRequests).toBe(scenarioAfterFirstOpen);
    expect(errors).toEqual([]);
  });
});

test.describe('S8 — открытие из прокрученного каталога 1024×768 (design/v2-card.png, SPEC §4.3:263, §4.10:358)', () => {
  test('сценарий и возврат в каталог — с верха страницы: «‹ Сценарии» и подпись схемы в окне', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    // 12 «Моих» — каталог длиннее окна 768 px, его можно прокрутить вниз.
    const items = Array.from({ length: 12 }, (_, i) =>
      localScenario(
        `my-deployment-demo-${String(i + 1).padStart(2, '0')}`,
        new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
        'deployment-demo.xlsx',
      ),
    );
    await page.addInitScript(
      (args: { key: string; items: LocalScenarioJson[] }) => {
        window.localStorage.setItem(args.key, JSON.stringify({ schema: 1, items: args.items }));
      },
      { key: LIBRARY_KEY, items },
    );
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');

    const rows = page
      .getByRole('region', { name: ru.catalog.localTitle })
      .locator('tr[data-scenario-id]');
    await expect(rows).toHaveCount(12);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await rows.last().getByRole('button', { name: fixture.title }).click();
    const scheme = page.getByRole('region', { name: ru.scheme.title });
    await expect(page.getByRole('heading', { level: 1, name: s11.title })).toBeVisible();
    await expect(scheme.locator('[data-step-id="1.1"]')).toHaveAttribute('aria-current', 'step');

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // DN-ysk: баннера нет — «‹ Сценарии» (первый фокусируемый элемент экрана
    // сценария) теперь единственный ориентир «в окне с самого верха».
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: ru.scheme.back })).toBeInViewport({ ratio: 1 });
    await expect(scheme.getByRole('heading', { level: 2, name: ru.scheme.title })).toBeInViewport({
      ratio: 1,
    });

    // Экран сценария прокручен вниз — «‹ Сценарии» возвращает каталог тоже с
    // верха. dispatchEvent, а не click(): click() сам докрутил бы кнопку в окно.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.getByRole('button', { name: ru.scheme.back }).dispatchEvent('click');
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeInViewport({
      ratio: 1,
    });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    expect(errors).toEqual([]);
  });
});

test.describe('S9 — полосы A0 нет ни на одном экране (SPEC §4.1, DN-ysk)', () => {
  test('баннера нет ни в каталоге, ни на экране сценария; входа в загрузку с открытым сценарием нет', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);

    const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
    await shared
      .locator('tr[data-scenario-id="deployment-demo"]')
      .getByRole('button', { name: fixture.title })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: s11.title })).toBeVisible();

    // §4.8:350: окно загрузки открывается только из каталога — на экране
    // открытого сценария входа в загрузку нет вовсе.
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: ru.catalog.upload })).toHaveCount(0);
    await expect(page.locator('[data-upload="catalog"]')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
