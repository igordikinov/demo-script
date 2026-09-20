// Общий помощник для e2e — вынесен из копий, которые расходились по спекам
// (processmap.spec.ts:22-92, catalog.spec.ts:109-142, navigation/deeplink/
// scenario.spec.ts). DN-17 заводит его первым для e2e/iframe.spec.ts и
// e2e/visual.spec.ts (ТК 21, 22, 33 — SPEC §8:417-429); переезд остальных
// спеков на этот файл — отдельный шаг.
//
// Данные — из tests/fixtures/deployment-demo.json (эталон содержания,
// CLAUDE.md: не придумывать содержание сценария). Строки — только из
// src/i18n/ru.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { ru } from '../src/i18n/ru';
import { LIBRARY_KEY } from '../src/state/library';

const FIXTURE_JSON_PATH = fileURLToPath(
  new URL('../tests/fixtures/deployment-demo.json', import.meta.url),
);

interface FixtureStep {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly node: string;
}

interface FixtureBlock {
  readonly title: string;
  readonly steps: readonly FixtureStep[];
}

interface FixtureScenario {
  readonly title: string;
  readonly module: string;
  readonly map: string;
  readonly blocks: readonly FixtureBlock[];
}

/** Эталон содержания сценария (CLAUDE.md) — тексты и адреса берутся отсюда, а не придумываются. */
export const fixture = JSON.parse(readFileSync(FIXTURE_JSON_PATH, 'utf8')) as FixtureScenario;

const allSteps = fixture.blocks.flatMap((block) => block.steps);

function stepById(stepId: string): FixtureStep {
  const step = allSteps.find((candidate) => candidate.id === stepId);
  if (step === undefined) {
    throw new Error(`фикстура не знает шаг ${stepId}`);
  }
  return step;
}

/** Заголовок шага по номеру — тексты берутся из фикстуры, а не придумываются. */
export function stepTitle(stepId: string): string {
  return stepById(stepId).title;
}

/** Узел карты у шага — из фикстуры (CLAUDE.md: не придумывать содержание сценария). */
export function nodeOf(stepId: string): string {
  const node = stepById(stepId).node;
  if (node === '') {
    throw new Error(`фикстура не знает узел шага ${stepId}`);
  }
  return node;
}

/** Адрес экрана шага (SPEC §4.4:274, §4.9:352) — для проверки вкладки в ТК 22. */
export function stepUrl(stepId: string): string {
  const url = stepById(stepId).url;
  if (url === '') {
    throw new Error(`фикстура не знает ссылку шага ${stepId}`);
  }
  return url;
}

/** Хост стенда из фикстуры (tests/fixtures/deployment-demo.json), а не литерал. */
export const STAND_ORIGIN = new URL(stepUrl('1.1')).origin;

/** Console errors/pageerror собираются в каждом тесте, в конце ожидается []. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Открывает общий deployment-demo на первом шаге (SPEC §4.7:318). */
export async function openShared(page: Page): Promise<void> {
  await page.goto('/');
  const shared = page.getByRole('region', { name: ru.catalog.sharedTitle });
  const row = shared.locator('tr[data-scenario-id="deployment-demo"]');
  await row.getByRole('button', { name: fixture.title }).click();
  await expect(page.getByRole('heading', { level: 1, name: stepTitle('1.1') })).toBeVisible();
}

/** «Мой» сценарий в формате localStorage (SPEC §3.6:201, §3.6:203) — из фикстуры. */
export interface LocalScenarioJson {
  readonly schema: 1;
  readonly id: string;
  readonly source: 'local';
  readonly title: string;
  readonly module: string;
  readonly map: string;
  readonly fileName: string;
  readonly loadedAt: string;
  readonly blocks: readonly {
    readonly n: number;
    readonly title: string;
    readonly sheet: string;
    readonly steps: readonly FixtureStep[];
  }[];
}

/** Копия приёма e2e/catalog.spec.ts:109-126: «мой» сценарий на основе фикстуры. */
export function localScenario(id: string, loadedAt: string, fileName: string): LocalScenarioJson {
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
export async function seedLibrary(page: Page, items: readonly LocalScenarioJson[]): Promise<void> {
  await page.addInitScript(
    (args: { key: string; items: readonly LocalScenarioJson[] }) => {
      window.localStorage.setItem(args.key, JSON.stringify({ schema: 1, items: args.items }));
    },
    { key: LIBRARY_KEY, items },
  );
}

/** Заглушка карты процесса: не ходить в реальную сеть, помнить запрошенные адреса. */
export async function stubProcessMap(page: Page): Promise<string[]> {
  const requests: string[] = [];
  // На весь BrowserContext (page.context().route), а не на page: «Открыть в новой
  // вкладке» открывает вкладку в отдельном Page того же контекста, и заглушка на
  // уровне page её не перехватила бы — тест ушёл бы в реальную сеть.
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

/** Заглушка стенда из фикстуры: та же логика, что stubProcessMap, для «Открыть экран». */
export async function stubStand(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.context().route(`${STAND_ORIGIN}/**`, (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>stand-stub</title>',
    });
  });
  return requests;
}
