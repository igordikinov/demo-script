// Экспорт «моего» сценария в книгу для папки scenarios/ — SPEC §4.2:255 (окно
// A5.3), §3.7:211. Браузер не пишет в репозиторий (бэкенд запрещён, §1):
// перенос — скачивание файла с именем будущего id и коммит руками.
//
// Без React, DOM и node:*: модуль импортируют и приложение, и Node-скрипты
// через --experimental-strip-types (как template.ts). Скачивание — DOM, его
// делает UI (src/components/ui/download.ts, как у шаблона DN-14, DN-24).
import type { Scenario } from '../model/schema.ts';
import { sharedScenarioId } from '../model/scenarioIndex.ts';
import { scenarioSheets } from './template.ts';
import { writeWorkbook } from './write.ts';

/** Суффикс для занятого имени `index` (§3.7:219): `my-index` → `index-2.xlsx`. */
const RESERVED_SUFFIX = '-2';

/**
 * `id` общего сценария для «моего» (§4.2:255): слаг названия из `id` без
 * префикса `my-` (§3.6:203). Слаг не проходит правило имени (занятый `index`) —
 * суффикс `-2`.
 */
export function exportScenarioId(scenario: Scenario): string {
  const slug = scenario.id.replace(/^my-/, '');
  return sharedScenarioId(`${slug}.xlsx`) !== undefined ? slug : `${slug}${RESERVED_SUFFIX}`;
}

/** Имя файла для переноса в «Общие»: `exportScenarioId` плюс `.xlsx` (§4.2:255). */
export function exportFileName(scenario: Scenario): string {
  return `${exportScenarioId(scenario)}.xlsx`;
}

/**
 * Книга «моего» сценария для `scenarios/`: `_Сценарий` и листы `Блок 1…n`
 * (§6, тот же построитель `scenarioSheets`, что у фикстуры), без
 * `_Инструкции` — читатель игнорирует листы с `_` (§3.3). Детерминирована,
 * как шаблон (write.ts); читается той же `readWorkbook`, что и сборка общих.
 */
export function buildScenarioBytes(scenario: Scenario): Promise<Uint8Array> {
  return writeWorkbook(
    scenarioSheets({
      title: scenario.title,
      module: scenario.module,
      map: scenario.map,
      blocks: scenario.blocks.map((block) => ({ title: block.title, steps: block.steps })),
    }),
  );
}
