// Навигация ‹ › и клавиши ← → в браузере — SPEC §4.4:275, §4.5:287–291.
// Юнит-уровень (кнопки, клавиши, исключения фокуса, окна) — tests/navigation.test.tsx;
// здесь — то, что нельзя увидеть в jsdom: реальная геометрия кнопок и шапки,
// настоящая прокрутка страницы на разной высоте окна (§4.5:291, §4.3:267).
//
// Данные — deployment-demo из public/scenarios/ (predev → npm run scenarios) и
// tests/fixtures/deployment-demo.json (эталон содержания, CLAUDE.md: не
// придумывать содержание сценария). Хелперы — копии из e2e/scenario.spec.ts.
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
  blocks: { title: string; steps: { id: string; title: string }[] }[];
};

const block1 = fixture.blocks[0];
const block2 = fixture.blocks[1];
const block3 = fixture.blocks[2];
if (block1 === undefined || block2 === undefined || block3 === undefined) {
  throw new Error('фикстура: нет блока 1, 2 или 3');
}

const allSteps = fixture.blocks.flatMap((block) => block.steps);

/** Заголовок шага по номеру — тексты берутся из фикстуры, а не придумываются. */
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

/** Открывает общий deployment-demo на первом шаге (SPEC §4.7:318). */
async function openShared(page: Page): Promise<void> {
  await page.goto('/');
  const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
  const row = shared.locator('tr[data-scenario-id="deployment-demo"]');
  await row.getByRole('button', { name: fixture.title }).click();
  await expect(page.getByRole('heading', { level: 1, name: title('1.1') })).toBeVisible();
}

test.describe('N1 — 1440×1000, ТК 13 в браузере (SPEC §8:409, §4.4:275, §4.5:289)', () => {
  test('› и ← → листают сквозным порядком, ‹ и › disabled на краях, геометрия кнопок', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openShared(page);

    // 1. На первом шаге ‹ disabled, › enabled; ← ничего не листает.
    await expect(page.getByRole('button', { name: ru.card.prevStep })).toBeDisabled();
    await expect(page.getByRole('button', { name: ru.card.nextStep })).toBeEnabled();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('heading', { level: 1, name: title('1.1') })).toBeVisible();
    await expect(page.getByText(ru.card.position(1, 1, block1.steps.length))).toBeVisible();

    // 2. Клик по схеме 1.11, → переходит на 2.1 (граница блока).
    const scheme = page.getByRole('region', { name: ru.scheme.title });
    await scheme.locator('[data-step-id="1.11"]').click();
    await expect(page.getByRole('heading', { level: 1, name: title('1.11') })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('2.1') })).toBeVisible();
    await expect(page.getByText(ru.card.position(2, 1, block2.steps.length))).toBeVisible();
    await expect(scheme.locator('[data-step-id="2.1"]')).toHaveAttribute('aria-current', 'step');

    // Геометрия ‹ › на 2.1, обе enabled (v2:91–97): 40×40, зазор 8, правый
    // край › совпадает с правым краем шапки карточки.
    const prevButton = page.getByRole('button', { name: ru.card.prevStep });
    const nextButton = page.getByRole('button', { name: ru.card.nextStep });
    const prevBox = await prevButton.boundingBox();
    const nextBox = await nextButton.boundingBox();
    if (prevBox === null || nextBox === null) {
      throw new Error('нет boundingBox у кнопок ‹ ›');
    }
    expect(Math.round(prevBox.width)).toBe(40);
    expect(Math.round(prevBox.height)).toBe(40);
    expect(Math.round(nextBox.width)).toBe(40);
    expect(Math.round(nextBox.height)).toBe(40);
    expect(Math.round(nextBox.x - (prevBox.x + prevBox.width))).toBe(8);
    const headerBox = await page.getByRole('article').locator('header').boundingBox();
    if (headerBox === null) {
      throw new Error('нет boundingBox у шапки карточки');
    }
    expect(Math.round(nextBox.x + nextBox.width)).toBe(Math.round(headerBox.x + headerBox.width));

    // 3. ← возвращает на 1.11.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('heading', { level: 1, name: title('1.11') })).toBeVisible();

    // 4. Клик › → 2.1; клик ‹ → 1.11.
    await nextButton.click();
    await expect(page.getByRole('heading', { level: 1, name: title('2.1') })).toBeVisible();
    await prevButton.click();
    await expect(page.getByRole('heading', { level: 1, name: title('1.11') })).toBeVisible();

    // 5. Клик по схеме 3.7 (последний шаг) → › disabled, → ничего не листает.
    await scheme.locator('[data-step-id="3.7"]').click();
    await expect(page.getByRole('heading', { level: 1, name: title('3.7') })).toBeVisible();
    await expect(page.getByRole('button', { name: ru.card.nextStep })).toBeDisabled();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('3.7') })).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('N2 — окно загрузки блокирует ← → (SPEC §4.5:290, §4.8:329)', () => {
  test('клавиши не листают шаг, пока открыто окно загрузки; после Escape листают снова', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openShared(page);

    await page.getByRole('button', { name: ru.header.upload }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('1.1') })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: title('1.1') })).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('1.2') })).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('N3a — 1024×768: шапка карточки видна, прокрутка карточки не нужна (SPEC §4.5:291)', () => {
  test('после → шапка остаётся в viewport, scrollY не меняется', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await openShared(page);

    await page.evaluate(() => window.scrollTo(0, 100));
    const header = page.getByRole('article').locator('header');
    await expect(header).toBeInViewport({ ratio: 1 });
    const scheme = page.getByRole('region', { name: ru.scheme.title });
    await expect(scheme.locator('[data-step-id="1.2"]')).toBeInViewport();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('1.2') })).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(100);

    expect(errors).toEqual([]);
  });
});

test.describe('N3b — 1024×600: шапка карточки ниже края, → прокручивает страницу к карточке (SPEC §4.5:291)', () => {
  test('открытие не прокручивает страницу; после → шапка карточки видна целиком, scrollY > 0', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1024, height: 600 });
    await openShared(page);

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const header = page.getByRole('article').locator('header');
    await expect(header).not.toBeInViewport();
    const scheme = page.getByRole('region', { name: ru.scheme.title });
    await expect(scheme.locator('[data-step-id="1.2"]')).toBeInViewport();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('1.2') })).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(header).toBeInViewport({ ratio: 1 });

    expect(errors).toEqual([]);
  });
});

test.describe('N3c — 1024×480: шапка карточки выше края — итог прокрутки схемы (§4.3:267) и карточки (§4.5:291)', () => {
  test('клик по шагу 1.10 в схеме и прокрутка вниз уводят шапку карточки за верхний край; после → шапка снова видна целиком', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1024, height: 480 });
    await openShared(page);

    const scheme = page.getByRole('region', { name: ru.scheme.title });
    await scheme.locator('[data-step-id="1.10"]').click();
    await expect(page.getByRole('heading', { level: 1, name: title('1.10') })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const header = page.getByRole('article').locator('header');
    await expect(header).not.toBeInViewport();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: title('1.11') })).toBeVisible();
    await expect(header).toBeInViewport({ ratio: 1 });

    expect(errors).toEqual([]);
  });
});
