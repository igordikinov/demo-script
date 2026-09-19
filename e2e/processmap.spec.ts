// Секция «Карта процесса» и встроенная карта — SPEC §4.6:293–316, §4.9:354
// (открытие вкладки), §4.7:324 и ТК 14 (history.length не растёт), §4.10
// (без прокрутки страницы по горизонтали). Юнит-уровень — tests/StepCard.test.tsx
// и tests/ProcessMapSection.test.tsx; здесь — то, что нельзя увидеть в jsdom:
// настоящая сеть (заглушка вместо https://igordikinov.github.io), реальный
// popup, геометрия рамки и iframe.
//
// Данные — deployment-demo из public/scenarios/ (predev → npm run scenarios) и
// tests/fixtures/deployment-demo.json (эталон содержания, CLAUDE.md: не
// придумывать содержание сценария). Хелперы openShared/collectErrors — копии
// из e2e/navigation.spec.ts (общий хелпер не заводим — риск конфликта при
// мёрже с параллельными задачами).
//
// Заглушка ставится на весь BrowserContext (page.context().route), а не на
// page: window.open открывает вкладку в отдельном Page того же контекста, и
// заглушка на уровне page её не перехватила бы — тест ушёл бы в реальную сеть.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ru } from '../src/i18n/ru';

const FIXTURE_JSON_PATH = fileURLToPath(
  new URL('../tests/fixtures/deployment-demo.json', import.meta.url),
);
const fixture = JSON.parse(readFileSync(FIXTURE_JSON_PATH, 'utf8')) as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: { id: string; title: string; node: string }[] }[];
};

const allSteps = fixture.blocks.flatMap((block) => block.steps);

/** Заголовок шага по номеру — тексты берутся из фикстуры, а не придумываются. */
function title(stepId: string): string {
  const step = allSteps.find((candidate) => candidate.id === stepId);
  if (step === undefined) {
    throw new Error(`фикстура не знает шаг ${stepId}`);
  }
  return step.title;
}

/** Узел карты у шага — из фикстуры (CLAUDE.md: не придумывать содержание сценария). */
function nodeOf(stepId: string): string {
  const step = allSteps.find((candidate) => candidate.id === stepId);
  if (step === undefined || step.node === '') {
    throw new Error(`фикстура не знает узел шага ${stepId}`);
  }
  return step.node;
}

// Этап 4 карты snp — из src/data/pm/snp.json (см. tests/pmLink.test.ts); адрес —
// литералом (SPEC §4.6:298–301), не из src/config.ts.
const PM_STAGE4_TITLE = 'Расчёт плана пополнения (DRP/Deployment) + Транспортбилдер';
function pmUrl(node: string): string {
  return `https://igordikinov.github.io/process-map/?stage=4&node=${encodeURIComponent(node)}`;
}
const PM_URL_110 = pmUrl(nodeOf('1.10'));
const PM_URL_111 = pmUrl(nodeOf('1.11'));

/** Console errors/pageerror собираются в каждом тесте, в конце ожидается []. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Открывает общий deployment-demo на первом шаге (SPEC §4.7:318). */
async function openShared(page: Page): Promise<void> {
  await page.goto('/');
  const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
  const row = shared.locator('tr[data-scenario-id="deployment-demo"]');
  await row.getByRole('button', { name: fixture.title }).click();
  await expect(page.getByRole('heading', { level: 1, name: title('1.1') })).toBeVisible();
}

/** Заглушка карты процесса: не ходить в реальную сеть, помнить запрошенные адреса. */
async function stubProcessMap(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.context().route('https://igordikinov.github.io/**', (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>pm-stub</title>',
    });
  });
  return requests;
}

/**
 * Ждёт, пока `scrollY` не меняется 10 кадров подряд (предел — 300 кадров):
 * и плавная анимация «Показать на карте» (SPEC §4.6:311, DN-us0), и мгновенный
 * прыжок (reduce) успевают закончиться раньше предела — проба (окно 1440×1000,
 * заголовок карты на y≈1302) показала 34 разных кадра у smooth и 1 у auto/reduce.
 */
async function waitForScrollIdle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let lastY = window.scrollY;
        let idleFrames = 0;
        let frame = 0;
        function tick(): void {
          frame += 1;
          const y = window.scrollY;
          if (y === lastY) {
            idleFrames += 1;
          } else {
            idleFrames = 0;
            lastY = y;
          }
          if (idleFrames >= 10 || frame >= 300) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
  );
}

/** Начинает писать каждое значение window.scrollY (событие scroll) в массив на window. */
async function recordScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __dnScroll: number[] }).__dnScroll = [];
    window.addEventListener('scroll', () => {
      (window as unknown as { __dnScroll: number[] }).__dnScroll.push(window.scrollY);
    });
  });
}

/** Значения scrollY, записанные recordScroll с момента вызова. */
async function scrollPositions(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { __dnScroll: number[] }).__dnScroll);
}

test.describe('P1 — 1440×1000: секция «Карта процесса» и встроенная карта (SPEC §4.6, §4.9:354)', () => {
  test('«Показать на карте», смена шага, «нет узла», «Открыть в новой вкладке», перезагрузка', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const pmRequests = await stubProcessMap(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openShared(page);

    const scheme = page.getByRole('region', { name: ru.scheme.title });
    const article = page.getByRole('article');

    // 1. Схема 1.10.
    await scheme.locator('[data-step-id="1.10"]').click();
    await expect(page.getByRole('heading', { level: 1, name: title('1.10') })).toBeVisible();

    // 2. В article видны этап, узел и кнопка «Показать на карте» (свёрнута).
    await expect(article.getByText(ru.processMap.stage(4, PM_STAGE4_TITLE))).toBeVisible();
    await expect(article.getByText(ru.processMap.node(nodeOf('1.10')))).toBeVisible();
    const showButton = article.getByRole('button', { name: ru.processMap.show });
    await expect(showButton).toHaveAttribute('aria-expanded', 'false');

    // 3. Клик по «Показать на карте» → «Скрыть карту».
    await showButton.click();
    const hideButton = article.getByRole('button', { name: ru.processMap.hide });
    await expect(hideButton).toHaveAttribute('aria-expanded', 'true');
    // DN-us0 (SPEC §4.6:311): клик запускает плавную прокрутку к заголовку
    // встроенной карты — ждём её конца, иначе boundingBox в шаге 5 снимается
    // в произвольный момент анимации и допуск в 1px становится нестабильным.
    await waitForScrollIdle(page);

    // 4. iframe: src, loading, referrerpolicy.
    const iframe = page.getByTitle(ru.processMap.iframeTitle);
    await expect(iframe).toHaveAttribute('src', PM_URL_110);
    await expect(iframe).toHaveAttribute('loading', 'lazy');
    await expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');

    // 5. Геометрия: секция карты под карточкой, высота iframe 760, ширина
    // рамки — вся ширина main минус паддинги по 32 (SPEC §4.6:311, v2:171–181).
    const region = page.getByRole('region', { name: ru.processMap.embedTitle });
    const articleBox = await article.boundingBox();
    const regionBox = await region.boundingBox();
    const iframeBox = await iframe.boundingBox();
    if (articleBox === null || regionBox === null || iframeBox === null) {
      throw new Error('нет boundingBox у article, региона карты или iframe');
    }
    expect(regionBox.y).toBeGreaterThanOrEqual(articleBox.y + articleBox.height + 24 - 1);
    expect(Math.round(iframeBox.height)).toBe(760);
    const frame = iframe.locator('..');
    const frameBox = await frame.boundingBox();
    if (frameBox === null) {
      throw new Error('нет boundingBox у рамки карты');
    }
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.round(frameBox.width)).toBe(clientWidth - 64);

    // 6. Запрос ушёл в заглушку (в реальную сеть не ходили); запоминаем history.length.
    await iframe.scrollIntoViewIfNeeded();
    await expect.poll(() => pmRequests).toContain(PM_URL_110);
    const historyLengthBefore = await page.evaluate(() => history.length);

    // 7. → на 1.11: src сменился, history.length не вырос (SPEC §4.7:324, ТК 14).
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('1.11') })).toBeVisible();
    await expect(iframe).toHaveAttribute('src', PM_URL_111);
    await iframe.scrollIntoViewIfNeeded();
    await expect.poll(() => pmRequests).toContain(PM_URL_111);
    const historyLengthAfter = await page.evaluate(() => history.length);
    expect(historyLengthAfter).toBe(historyLengthBefore);

    // 8. Схема 3.7 (узел пуст в фикстуре) — «не сопоставлен», кнопок и iframe нет.
    await scheme.locator('[data-step-id="3.7"]').click();
    await expect(page.getByRole('heading', { level: 1, name: title('3.7') })).toBeVisible();
    await expect(article.getByText(ru.processMap.notMapped)).toBeVisible();
    await expect(article.getByRole('button', { name: ru.processMap.show })).toHaveCount(0);
    await expect(article.getByRole('button', { name: ru.processMap.hide })).toHaveCount(0);
    await expect(page.getByTitle(ru.processMap.iframeTitle)).toHaveCount(0);

    // 9. Схема 1.10 — признак «карта раскрыта» сохранился (SPEC §4.6:313), iframe снова есть.
    await scheme.locator('[data-step-id="1.10"]').click();
    await expect(page.getByRole('heading', { level: 1, name: title('1.10') })).toBeVisible();
    await expect(page.getByTitle(ru.processMap.iframeTitle)).toHaveAttribute('src', PM_URL_110);

    // 10. «Скрыть карту» — iframe нет.
    await article.getByRole('button', { name: ru.processMap.hide }).click();
    await expect(page.getByTitle(ru.processMap.iframeTitle)).toHaveCount(0);

    // 11. «Открыть в новой вкладке»: popup без opener, тоста блокировки нет.
    const popupPromise = page.waitForEvent('popup');
    await article.getByRole('button', { name: ru.processMap.openInNewTab }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(popup.url()).toBe(PM_URL_110);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await expect(page.getByText(ru.openScreen.popupBlocked)).toHaveCount(0);

    // 12. Перезагрузка — признак не сохраняется между перезагрузками (SPEC §4.6:315).
    await page.reload();
    await openShared(page);
    await scheme.locator('[data-step-id="1.10"]').click();
    await expect(page.getByRole('heading', { level: 1, name: title('1.10') })).toBeVisible();
    await expect(article.getByRole('button', { name: ru.processMap.show })).toBeVisible();
    await expect(page.getByTitle(ru.processMap.iframeTitle)).toHaveCount(0);

    // 13.
    expect(errors).toEqual([]);
  });
});

test.describe('P2 — 1024×768: рамка карты прокручивается по горизонтали, страница — нет (SPEC §4.10)', () => {
  test('frame.scrollWidth > frame.clientWidth; documentElement.scrollWidth === clientWidth', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await stubProcessMap(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await openShared(page);

    const scheme = page.getByRole('region', { name: ru.scheme.title });
    await scheme.locator('[data-step-id="1.10"]').click();
    const article = page.getByRole('article');
    await article.getByRole('button', { name: ru.processMap.show }).click();

    const iframe = page.getByTitle(ru.processMap.iframeTitle);
    await iframe.scrollIntoViewIfNeeded();
    const frame = iframe.locator('..');
    const frameMetrics = await frame.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(frameMetrics.scrollWidth).toBeGreaterThan(frameMetrics.clientWidth);

    const docMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(docMetrics.scrollWidth).toBe(docMetrics.clientWidth);

    expect(errors).toEqual([]);
  });
});

test.describe('P3 — 1440×1000: прокрутка к встроенной карте (SPEC §4.6:311; DN-us0)', () => {
  test('E1: «Показать на карте» плавно прокручивает страницу к заголовку встроенной карты', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await stubProcessMap(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openShared(page);

    const scheme = page.getByRole('region', { name: ru.scheme.title });
    const article = page.getByRole('article');
    await scheme.locator('[data-step-id="1.10"]').click();
    await expect(page.getByRole('heading', { level: 1, name: title('1.10') })).toBeVisible();

    const scrollYBefore = await page.evaluate(() => window.scrollY);
    expect(scrollYBefore).toBe(0);
    await recordScroll(page);

    await article.getByRole('button', { name: ru.processMap.show }).click();

    // Заголовок встроенной карты (SPEC §4.6:307) целиком в видимой области —
    // без реализации DN-us0 он остаётся на y≈1302, тест красный.
    const mapHeading = page.getByRole('heading', { name: ru.processMap.embedTitle });
    await expect(mapHeading).toBeInViewport({ ratio: 1 });

    await waitForScrollIdle(page);
    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(scrollYAfter).toBeGreaterThan(scrollYBefore);

    // Плавная прокрутка проходит через несколько разных положений (проба:
    // 34 кадра у smooth против 1 у auto/reduce, см. waitForScrollIdle выше).
    const positions = await scrollPositions(page);
    expect(new Set(positions).size).toBeGreaterThan(1);

    expect(errors).toEqual([]);
  });

  test('E2: смена шага при раскрытой карте её не прокручивает (SPEC §4.5:291 и §4.6:311 работают независимо)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await stubProcessMap(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openShared(page);

    const scheme = page.getByRole('region', { name: ru.scheme.title });
    const article = page.getByRole('article');
    await scheme.locator('[data-step-id="1.10"]').click();
    await expect(page.getByRole('heading', { level: 1, name: title('1.10') })).toBeVisible();
    await article.getByRole('button', { name: ru.processMap.show }).click();
    await waitForScrollIdle(page);

    // Возврат наверх — дальше проверяем, что сама смена шага к карте не тянет.
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForScrollIdle(page);
    const mapHeading = page.getByRole('heading', { name: ru.processMap.embedTitle });
    await expect(mapHeading).not.toBeInViewport();

    // → на 1.11: шапка карточки видна (значит, и правило §4.5:291 не сработало),
    // src сменился, scrollY не растёт — карта не прокручивает страницу.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('1.11') })).toBeInViewport();
    const iframe = page.getByTitle(ru.processMap.iframeTitle);
    await expect(iframe).toHaveAttribute('src', PM_URL_111);
    await waitForScrollIdle(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // Схема 3.7 (узел пуст, §4.6:314) — iframe нет; возврат на 1.10 —
    // секция монтируется заново, а признак «карта раскрыта» не менялся
    // (DN-us0: значит, это тоже не должно прокручивать страницу).
    await scheme.locator('[data-step-id="3.7"]').click();
    await expect(page.getByTitle(ru.processMap.iframeTitle)).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForScrollIdle(page);

    await scheme.locator('[data-step-id="1.10"]').click();
    await expect(iframe).toHaveAttribute('src', PM_URL_110);
    await waitForScrollIdle(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    expect(errors).toEqual([]);
  });

  test('E3: prefers-reduced-motion: reduce — прокрутка к карте мгновенная', async ({ page }) => {
    const errors = collectErrors(page);
    await stubProcessMap(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openShared(page);

    const scheme = page.getByRole('region', { name: ru.scheme.title });
    const article = page.getByRole('article');
    await scheme.locator('[data-step-id="1.10"]').click();
    await expect(page.getByRole('heading', { level: 1, name: title('1.10') })).toBeVisible();

    await recordScroll(page);
    await article.getByRole('button', { name: ru.processMap.show }).click();
    await waitForScrollIdle(page);

    const mapHeading = page.getByRole('heading', { name: ru.processMap.embedTitle });
    await expect(mapHeading).toBeInViewport({ ratio: 1 });

    // Мгновенный прыжок — ровно одно положение scrollY за всё время (проба: 1
    // против 34 у smooth).
    const positions = await scrollPositions(page);
    expect(new Set(positions).size).toBe(1);

    expect(errors).toEqual([]);
  });
});
