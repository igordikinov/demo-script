// Первая отрисовка < 1 с (SPEC §8:431, DN-18) — на собранном приложении:
// playwright.preview.config.ts поднимает `vite preview` на dist/, поэтому в
// замер попадает минифицированный бандл и относительный base (§7:380), а не
// dev-сервер с модулями по одному запросу.
//
// Строки — только из src/i18n/ru.ts, содержание сценария — только из
// tests/fixtures/deployment-demo.json через e2e/helpers.ts (CLAUDE.md).
import { expect, test, type Browser } from '@playwright/test';
import { ru } from '../src/i18n/ru';
import { collectErrors, stepTitle } from '../e2e/helpers';

/** Лимит первой отрисовки (SPEC §8:431). */
const LIMIT_MS = 1000;

/** Сколько загрузок усредняем медианой (SPEC §8:431). */
const RUNS = 3;

/**
 * Одна честная загрузка: свежий BrowserContext — пустой HTTP-кэш, пустой
 * localStorage и новый timeOrigin, от которого считается startTime. page.reload()
 * мерил бы прогретый кэш и уже скомпилированный модуль.
 *
 * Заодно доказываем, что отрисовалось именно приложение: index.html — это один
 * <div id="root">, и при упавшем бандле FCP либо не наступит вовсе, либо
 * пришёлся бы на пустую страницу, которая уложится в любой лимит.
 */
async function measureFirstPaint(browser: Browser, baseURL: string, path: string): Promise<number> {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();
    expect(errors).toEqual([]);

    // Страховка от гонки «прочитали буфер до отрисовки»: записи типа paint из
    // буфера не вытесняются, поэтому наблюдатель здесь не нужен.
    await page.waitForFunction(() =>
      performance
        .getEntriesByType('paint')
        .some((entry) => entry.name === 'first-contentful-paint'),
    );

    // startTime — миллисекунды от performance.timeOrigin, то есть от начала
    // навигации этого документа. Считать разницу по Date.now() вокруг goto
    // нельзя: туда попадут накладные расходы CDP.
    const firstPaint = await page.evaluate(() => {
      const entry = performance.getEntriesByName('first-contentful-paint', 'paint')[0];
      return entry === undefined ? null : entry.startTime;
    });
    if (firstPaint === null) {
      throw new Error('нет записи first-contentful-paint');
    }
    return firstPaint;
  } finally {
    await context.close();
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (middle === undefined) {
    throw new Error('нечего усреднять: ни одного замера');
  }
  return middle;
}

test.describe('FP1 — первая отрисовка на сборке (SPEC §8:431)', () => {
  test(`медиана ${RUNS} загрузок каталога < ${LIMIT_MS} мс`, async ({ browser, baseURL }) => {
    if (baseURL === undefined) {
      throw new Error('baseURL не задан: см. playwright.preview.config.ts');
    }

    // Прогревочная загрузка, её значение выбрасывается: только что поднятый
    // vite preview, холодный файловый кэш ОС и первый контекст в процессе
    // браузера платят за инициализацию, к приложению отношения не имеющую.
    const warmup = await measureFirstPaint(browser, baseURL, '/');

    const samples: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      samples.push(await measureFirstPaint(browser, baseURL, '/'));
    }

    // Печатаем все числа: по красному прогону сразу видно, промах это или шум.
    const asText = (ms: number): string => `${Math.round(ms)} мс`;
    console.log(
      `first-contentful-paint: прогрев ${asText(warmup)}, замеры ${samples.map(asText).join(', ')}, медиана ${asText(median(samples))} при лимите ${LIMIT_MS} мс`,
    );

    // Медиана, а не минимум и не максимум: одиночный всплеск GC или соседней
    // нагрузки на раннере не красит сборку, но пройти можно только если два
    // замера из трёх уложились в лимит.
    expect(median(samples)).toBeLessThan(LIMIT_MS);
  });
});

test.describe('FP2 — acceptance DN-18 на собранном приложении (SPEC §7:380, §4.7:318)', () => {
  test('?scenario=deployment-demo&step=1.10 открывает шаг', async ({ page }) => {
    // То, чего не видно на dev-сервере: относительный base, реальный
    // dist/scenarios/deployment-demo.json и минифицированный бандл.
    const errors = collectErrors(page);
    await page.goto('/?scenario=deployment-demo&step=1.10');
    await expect(page.getByRole('heading', { level: 1, name: stepTitle('1.10') })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
