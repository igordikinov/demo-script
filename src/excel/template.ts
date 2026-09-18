// Шаблон Excel — SPEC §6:366–372; тем же построителем листов `npm run fixture`
// собирает фикстуру и первый общий сценарий (§6:374, scripts/make-fixture.ts).
//
// Книга шаблона: `_Сценарий` (§6:370), `Блок 1` (§6:371), `_Инструкция` (§6:372).
// Порядок листов SPEC задаёт только перечислением — так и пишем.
// Заголовки колонок и их порядок — COLUMNS (§3.2:120–128), имя листа `_Сценарий`
// и ключи — columns.ts; человеческие тексты (имя файла, примеры, инструкция) — ru.ts.
// Примеры строк 3–4 — шаги 1.1 и 2.3 фикстуры (решение владельца 18.09.2026),
// ссылка в них — обычный текст, без гиперссылки.
//
// Модуль отдаёт байты и имя файла. SPEC говорит «writeFile», но скачивание —
// это DOM (Blob), а src/excel/* живёт без него: скачивает UI (DN-14, DN-24).
// Закрепление строки 2 — freezeRows в write.ts (решение DN-akk, §11:622).
// Без React, DOM и node:*: модуль импортирует Node (--experimental-strip-types).
import { ru } from '../i18n/ru.ts';
import type { Scenario, Step } from '../model/schema.ts';
import { COLUMNS, SCENARIO_KEYS, SCENARIO_SHEET } from './columns.ts';
import { writeWorkbook, type SheetSpec } from './write.ts';

/** Имя скачиваемого файла шаблона (§6:368). */
export const TEMPLATE_FILE_NAME: string = ru.template.fileName;

/** Ширины колонок листа-блока в символах, A…I (§6:371). */
export const BLOCK_COL_WIDTHS: readonly number[] = [10, 36, 48, 28, 40, 60, 40, 30, 40];

/** Колонка A — текстовый формат `@` на строки 3–500 (§6:371): «1.10» не станет числом. */
export const BLOCK_TEXT_RANGE = 'A3:A500';

/** Закреплены строки 1–2: название блока и заголовки (§6:371). */
export const BLOCK_FREEZE_ROWS = 2;

/** Ширины `_Инструкция`: в SPEC не заданы, подобраны под длину текстов. */
const INSTRUCTION_COL_WIDTHS: readonly number[] = [22, 12, 90];

/** «Что писать» по полям шага; пропущенное поле — ошибка компиляции. */
const HINTS: Readonly<Record<keyof Step, string>> = ru.template.hints;

/** То, что книга хранит о сценарии: название, модуль, карта и блоки с шагами. */
export interface ScenarioSource {
  readonly title: string;
  readonly module: string;
  readonly map: Scenario['map'];
  readonly blocks: readonly { readonly title: string; readonly steps: readonly Step[] }[];
}

/**
 * Лист-блок: A1 — название блока, строка 2 — заголовки COLUMNS в порядке таблицы
 * §3.2, с 3-й строки — шаги; ширины, формат `@` и закрепление — по §6:371.
 */
export function blockSheet(name: string, title: string, steps: readonly Step[]): SheetSpec {
  return {
    name,
    rows: [
      [title],
      COLUMNS.map((col) => col.header),
      ...steps.map((step) => COLUMNS.map((col) => step[col.field])),
    ],
    colWidths: BLOCK_COL_WIDTHS,
    textRanges: [BLOCK_TEXT_RANGE],
    freezeRows: BLOCK_FREEZE_ROWS,
  };
}

/** Лист `_Сценарий`: колонка A — ключ, B — значение (§3.2:109, §6:370). */
export function scenarioSheet(meta: Pick<ScenarioSource, 'title' | 'module' | 'map'>): SheetSpec {
  return {
    name: SCENARIO_SHEET,
    rows: [
      [SCENARIO_KEYS.title, meta.title],
      [SCENARIO_KEYS.module, meta.module],
      [SCENARIO_KEYS.map, meta.map],
    ],
  };
}

/** Книга сценария: `_Сценарий`, затем листы `Блок 1…n` в порядке блоков (§3.2:110). */
export function scenarioSheets(src: ScenarioSource): SheetSpec[] {
  return [
    scenarioSheet(src),
    ...src.blocks.map((block, i) =>
      blockSheet(ru.template.blockSheet(i + 1), block.title, block.steps),
    ),
  ];
}

/** `_Инструкция`: таблица «Колонка · Обязательна · Что писать» по §3.2 и правила листов (§6:372). */
function instructionSheet(): SheetSpec {
  const t = ru.template;
  return {
    name: t.instructionSheet,
    rows: [
      t.instructionColumns,
      ...COLUMNS.map((col) => [
        col.header,
        col.required ? t.requiredYes : t.requiredNo,
        HINTS[col.field],
      ]),
      [],
      [t.rulesTitle],
      ...ru.importModal.templateRules.map((rule) => [rule]),
    ],
    colWidths: INSTRUCTION_COL_WIDTHS,
  };
}

/**
 * Байты шаблона §6: `_Сценарий` (Новый сценарий, SNP, snp), `Блок 1` с двумя
 * примерами, `_Инструкция`. Одинаковые при каждом вызове.
 */
export function buildTemplate(): Promise<Uint8Array> {
  return writeWorkbook([
    scenarioSheet({
      title: ru.template.scenarioTitle,
      module: ru.template.scenarioModule,
      map: 'snp',
    }),
    blockSheet(ru.template.blockSheet(1), ru.template.blockTitle, ru.template.examples),
    instructionSheet(),
  ]);
}
