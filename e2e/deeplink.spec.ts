// Адрес `?scenario=&step=` в браузере — SPEC §4.7 (:318-325), ТК 14 (§8:410) и
// ТК 30 (§8:426). Юнит-уровень (StrictMode, событие storage, гонки загрузки,
// прочие параметры адреса) — tests/deepLink.test.tsx; здесь — то, что нельзя
// увидеть в jsdom: настоящий адрес вкладки, настоящий history.length и
// реальный dev-сервер, отдающий 200 вместо 404 на несуществующий *.json
// (spaFallback Vite, DN-16).
//
// Данные — deployment-demo из public/scenarios/ (predev → npm run scenarios) и
// tests/fixtures/deployment-demo.json (эталон содержания, CLAUDE.md: не
// придумывать содержание сценария). Хелперы collectErrors/title — копии
// e2e/navigation.spec.ts (общий модуль не заводим — риск мёржа).
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
  blocks: { title: string; steps: { id: string; title: string }[] }[];
};

const allSteps = fixture.blocks.flatMap((block) => block.steps);

/** Заголовок шага по номеру — из фикстуры, а не придуман. */
function title(stepId: string): string {
  const step = allSteps.find((candidate) => candidate.id === stepId);
  if (step === undefined) {
    throw new Error(`фикстура не знает шаг ${stepId}`);
  }
  return step.title;
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

test.describe('DL1 — ТК 14 и 30 в браузере (SPEC §8:410, §4.7:323-324)', () => {
  test('ArrowRight меняет step через replaceState, «‹ Сценарии» возвращает в каталог, посторонний параметр остаётся', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/?scenario=deployment-demo&step=2.5&foo=1');
    await expect(page.getByRole('heading', { level: 1, name: title('2.5') })).toBeVisible();

    const len = await page.evaluate(() => history.length);

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('2.6') })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('2.6');
    expect(new URL(page.url()).searchParams.get('scenario')).toBe('deployment-demo');
    expect(new URL(page.url()).searchParams.get('foo')).toBe('1');
    expect(await page.evaluate(() => history.length)).toBe(len);

    await page.getByRole('button', { name: ru.scheme.back }).click();
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();
    expect(new URL(page.url()).search).toBe('?foo=1');
    expect(await page.evaluate(() => history.length)).toBe(len);

    expect(errors).toEqual([]);
  });
});

test.describe('DL2 — ТК 14 (SPEC §8:410, §4.7:322)', () => {
  test('?scenario=deployment-demo&step=9.9 → первый шаг, step=1.1 в адресе', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?scenario=deployment-demo&step=9.9');
    await expect(page.getByRole('heading', { level: 1, name: title('1.1') })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('1.1');
    expect(errors).toEqual([]);
  });
});

test.describe('DL3 — ТК 30 (SPEC §8:426)', () => {
  test('?scenario=unknown → каталог, тост «не найден», scenario убран из адреса, ошибок в консоли нет', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/?scenario=unknown');
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(ru.deepLink.notFoundShared('unknown'));
    expect(new URL(page.url()).search).toBe('');
    // На dev-сервере Vite несуществующий scenarios/unknown.json отдаётся через
    // spaFallback (index.html, статус 200), а не 404: ошибка «не удаётся
    // распарсить как JSON» ловится в StoreProvider.commands.openShared без
    // console.error (SPEC §4.7:321).
    expect(errors).toEqual([]);
  });
});

test.describe('DL4 — ТК 30 (SPEC §8:426)', () => {
  test('?scenario=my-x → тост про другой браузер, scenario убран из адреса', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?scenario=my-x');
    await expect(page.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(ru.deepLink.notFoundLocal('my-x'));
    expect(new URL(page.url()).search).toBe('');
    expect(errors).toEqual([]);
  });
});

test.describe('DL5 — ссылка переживает перезагрузку (SPEC §4.7:324, необязательно)', () => {
  test('после смены шага reload открывает тот же шаг', async ({ page }) => {
    await page.goto('/?scenario=deployment-demo&step=2.5');
    await expect(page.getByRole('heading', { level: 1, name: title('2.5') })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('2.6') })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: title('2.6') })).toBeVisible();
  });
});

test.describe('DL6 — «мой» сценарий по адресу (SPEC §4.7:320, необязательно)', () => {
  test('открывается на заданном шаге, без баннера (DN-ysk: Tag/название на экране не показываются)', async ({
    page,
  }) => {
    await page.addInitScript(
      (args: { key: string; item: unknown }) => {
        window.localStorage.setItem(args.key, JSON.stringify({ schema: 1, items: [args.item] }));
      },
      {
        key: LIBRARY_KEY,
        item: {
          schema: 1,
          id: 'my-deployment-demo',
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
        },
      },
    );

    const errors = collectErrors(page);
    await page.goto('/?scenario=my-deployment-demo&step=3.7');
    await expect(page.getByRole('heading', { level: 1, name: title('3.7') })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
