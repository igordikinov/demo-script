// Индекс общих сценариев — SPEC §3.7 (:209–230): public/scenarios/index.json.
// Пишет его `npm run scenarios` (scripts/build-scenarios.ts, DN-22), читает
// приложение при старте (§3.7 «В приложении», DN-23) — одна схема на обе стороны.
//
// Без React, DOM и node:*: модуль импортируют и приложение, и Node-скрипт через
// --experimental-strip-types. Поэтому относительные импорты — с расширением .ts,
// импорт типов — только с `type`.
//
// Порядок ключей — порядок полей схем ниже: он совпадает с примером §3.7:222–225, а
// zod при parse выдаёт ключи в порядке схемы. Ключи не сортируются (в отличие от
// снимков карт, §3.4:167) — детерминизм даёт сама схема.
import { z } from 'zod';
import { ScenarioSchema, type Scenario } from './schema.ts';
import { isScreenUrl } from './url.ts';

/**
 * `id` общего сценария (§3.7:211): `a-z`, `0-9`, `-`; префикс `my-` за «моими».
 * Уже, чем `ScenarioSchema.shape.id` (§3.1:89): тот допускает и `my-…`.
 */
export const SHARED_ID_RE: RegExp = /^(?!my-)[a-z0-9-]+$/;

/** Расширение книги общего сценария — только в нижнем регистре: `demo.XLSX` не проходит. */
const XLSX_EXT = '.xlsx';

/**
 * Имя занято: `index.json` — сам индекс (§3.7:219), сценарий с `id` `index` затёр бы
 * его. Дополнение к SPEC (DN-22).
 */
const RESERVED_IDS: ReadonlySet<string> = new Set(['index']);

/**
 * Имя файла → `id` общего сценария (§3.7:211: имя без расширения). `undefined`, если
 * имя не проходит правило: не `.xlsx` в нижнем регистре, символы вне `a-z0-9-`,
 * префикс `my-` или занятое имя `index`.
 */
export function sharedScenarioId(fileName: string): string | undefined {
  if (!fileName.endsWith(XLSX_EXT)) return undefined;
  const id = fileName.slice(0, -XLSX_EXT.length);
  if (!SHARED_ID_RE.test(id) || RESERVED_IDS.has(id)) return undefined;
  return id;
}

/** Элемент `items` индекса (§3.7:222–225). Без `.strict()`, как ScenarioSchema. */
export const ScenarioIndexItemSchema = z.object({
  id: z.string().regex(SHARED_ID_RE),
  title: ScenarioSchema.shape.title,
  module: ScenarioSchema.shape.module,
  map: ScenarioSchema.shape.map,
  fileName: ScenarioSchema.shape.fileName,
  loadedAt: ScenarioSchema.shape.loadedAt,
  blocks: z.number().int().min(1),
  steps: z.number().int().min(1),
  withLink: z.number().int().min(0),
});

/** Файл `public/scenarios/index.json` (§3.7:219–225). */
export const ScenarioIndexSchema = z.object({
  schema: z.literal(1),
  builtAt: z.string(),
  items: z.array(ScenarioIndexItemSchema),
});

/** Элемент индекса общих сценариев (§3.7:222–225). */
export type ScenarioIndexItem = z.infer<typeof ScenarioIndexItemSchema>;
/** Индекс общих сценариев (§3.7:219). */
export type ScenarioIndex = z.infer<typeof ScenarioIndexSchema>;

/**
 * Сценарий → элемент индекса. `withLink` — шаги со ссылкой по isScreenUrl, как сводка
 * разбора (§3.3:143) и схема сценария (решение DN-dkb), а не по непустому `url`.
 */
export function toIndexItem(scenario: Scenario): ScenarioIndexItem {
  const steps = scenario.blocks.flatMap((block) => block.steps);
  return {
    id: scenario.id,
    title: scenario.title,
    module: scenario.module,
    map: scenario.map,
    fileName: scenario.fileName,
    loadedAt: scenario.loadedAt,
    blocks: scenario.blocks.length,
    steps: steps.length,
    withLink: steps.filter((step) => isScreenUrl(step.url)).length,
  };
}

/**
 * `builtAt` индекса — самый поздний по времени `loadedAt` (§3.7:228, решение владельца
 * 18.09.2026, DN-22): повторная сборка тех же файлов даёт побайтово тот же индекс.
 * Сравниваются моменты (Date.parse), а не строки: дата git со смещением `+03:00` и
 * mtime в UTC с `Z` по строке сравниваются неверно. При равном моменте берётся большая
 * строка — результат не зависит от порядка входа. Нечитаемые даты пропускаются;
 * пустой вход (или одни нечитаемые) — `''`.
 */
export function latestLoadedAt(values: readonly string[]): string {
  let best = '';
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const time = Date.parse(value);
    if (Number.isNaN(time)) continue;
    if (time > bestTime || (time === bestTime && value > best)) {
      best = value;
      bestTime = time;
    }
  }
  return best;
}

/** Порядок `items` (§3.7:228): `title` в локали `ru`, при равенстве — `id` посимвольно. */
function compareItems(a: ScenarioIndexItem, b: ScenarioIndexItem): number {
  const byTitle = a.title.localeCompare(b.title, 'ru');
  if (byTitle !== 0) return byTitle;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Индекс из элементов (§3.7:219–228): `items` по порядку compareItems, `builtAt` —
 * latestLoadedAt. Вход не меняется; результат проходит ScenarioIndexSchema, ключи — в
 * порядке схемы.
 */
export function buildScenarioIndex(items: readonly ScenarioIndexItem[]): ScenarioIndex {
  return ScenarioIndexSchema.parse({
    schema: 1,
    builtAt: latestLoadedAt(items.map((item) => item.loadedAt)),
    items: [...items].sort(compareItems),
  });
}
