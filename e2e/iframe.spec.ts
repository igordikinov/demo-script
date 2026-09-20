// Навигатор в iframe вики — ТК 22 (SPEC §8:418), встраивание §7:378-387 (адрес
// со слэшем, sandbox, только https) и открытие экрана §4.9:352-354: без
// `noopener` (решение DN-cx3, SPEC §11:626) — `window.open` без него, у
// открытой вкладки `opener = null`; `null` в ответ — тост «Браузер не дал
// открыть вкладку. Проверьте настройки встраивания» (src/i18n/ru.ts:330).
//
// Хост-страница с `<iframe sandbox="…">` подаётся перехватом на том же origin,
// что и dev-сервер (http://localhost:5180) — страницы-заглушки в репозитории
// нет (DN-24/DN-26): экран собирается в настоящем приложении по deep link
// (SPEC §4.7:318-325), как в остальных e2e. Внешний стенд из фикстуры
// (tests/fixtures/deployment-demo.json) глушится на BrowserContext — вкладка,
// которую открывает «Открыть экран», это отдельный Page того же контекста, и
// заглушка на уровне page её не перехватила бы (см. e2e/processmap.spec.ts).
import { expect, test, type Page } from '@playwright/test';
import { ru } from '../src/i18n/ru';
import { collectErrors, fixture, stepTitle, stepUrl, stubStand } from './helpers';

const HOST_PATH = '/__host';

/** Врезка вики (SPEC §7:385-387), sandbox — параметр (§7:381). */
function hostHtml(sandbox: string, src: string): string {
  return `<!doctype html><meta charset="utf-8"><title>wiki-host</title><body style="margin:0">
<iframe id="app" src="${src}" sandbox="${sandbox}"
        style="width:100%;height:900px;border:0" loading="lazy"></iframe>`;
}

/** Подставляет хост-страницу на том же origin, что и dev-сервер (перехват, без файла в репозитории). */
async function routeHost(
  page: Page,
  sandbox: string,
  src = `/?scenario=deployment-demo&step=1.1`,
): Promise<void> {
  await page.route('**/__host', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: hostHtml(sandbox, src) }),
  );
}

test.describe('I1 — ТК 22 (SPEC §8:418): «allow-scripts allow-same-origin allow-popups» — «Открыть экран» открывает вкладку', () => {
  test('вкладка на адресе шага, opener = null, тоста блокировки нет, в реальную сеть не ходили', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const standRequests = await stubStand(page);
    await routeHost(page, 'allow-scripts allow-same-origin allow-popups');
    await page.goto(HOST_PATH);

    const app = page.frameLocator('#app');
    await expect(app.getByRole('heading', { level: 1, name: stepTitle('1.1') })).toBeVisible();

    // До клика — иначе тост успевает погаснуть, пока ждём событие 'page' (Toast.tsx:14, 3,2 с).
    const popupPromise = page.context().waitForEvent('page');
    await app.getByRole('button', { name: ru.card.openScreen }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();

    expect(popup.url()).toBe(stepUrl('1.1'));
    // SPEC §4.9:354, DN-cx3: без noopener opener ставится в null вручную.
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await expect(app.getByRole('status')).not.toContainText(ru.openScreen.popupBlocked);
    // Запрос ушёл в заглушку — не в реальную сеть.
    expect(standRequests).toEqual([stepUrl('1.1')]);

    expect(errors).toEqual([]);
  });
});

test.describe('I2 — ТК 22 (SPEC §8:418): без «allow-popups» — тост', () => {
  test('«Браузер не дал открыть вкладку. Проверьте настройки встраивания», вкладки нет, в сеть не ходили', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const standRequests = await stubStand(page);
    await routeHost(page, 'allow-scripts allow-same-origin');
    await page.goto(HOST_PATH);

    const app = page.frameLocator('#app');
    await expect(app.getByRole('heading', { level: 1, name: stepTitle('1.1') })).toBeVisible();

    await app.getByRole('button', { name: ru.card.openScreen }).click();

    // Тост живёт 3,2 с (src/components/ui/Toast.tsx:14) — проверяем первым:
    // ожидание отсутствия вкладки ниже само по себе быстрое, но порядок важен,
    // если когда-нибудь появится дополнительное ожидание перед тостом.
    await expect(app.getByRole('status')).toHaveText(ru.openScreen.popupBlocked);
    expect(page.context().pages()).toHaveLength(1);
    expect(standRequests).toEqual([]);

    // Chromium сам пишет в консоль об отказе открыть вкладку без allow-popups —
    // блокировка ожидаема (SPEC §4.9:354, DN-cx3), это не ошибка приложения.
    const SANDBOX_BLOCK = /sandboxed frame whose 'allow-popups' permission is not set/;
    expect(errors.filter((message) => !SANDBOX_BLOCK.test(message))).toEqual([]);
  });
});

test.describe('I3 — ТК 22 (SPEC §8:418): приложение работает во вложенном iframe', () => {
  test('каталог виден, клик по строке открывает сценарий на первом шаге', async ({ page }) => {
    const errors = collectErrors(page);
    await stubStand(page);
    await routeHost(page, 'allow-scripts allow-same-origin allow-popups', '/');
    await page.goto(HOST_PATH);

    const app = page.frameLocator('#app');
    await expect(app.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeVisible();

    const row = app.locator('tr[data-scenario-id="deployment-demo"]');
    await row.getByRole('button', { name: fixture.title }).click();
    // history.replaceState (SPEC §4.7) не падает в песочнице с allow-same-origin.
    await expect(app.getByRole('heading', { level: 1, name: stepTitle('1.1') })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
