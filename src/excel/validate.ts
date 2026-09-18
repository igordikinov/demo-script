// Отчёт проверок — SPEC §3.5:171–197: типы строки отчёта, уровни всех 15 кодов (колонка
// «Уровень» таблицы §3.5:177–191 — данные, не проверки), сборщик строки, проверки по шагам
// и сортировка отчёта. Структурные коды E01–E03, W03, W05, I01, I02 выдаёт сам разбор
// (read.ts) — они видны только при чтении листа. Здесь — всё, что проверяется по уже
// собранным шагам: E04–E07, W01, W02, W04 и итоговая I03, а также сортировка (§3.5:195),
// которой read.ts упорядочивает обе части отчёта вместе.
// Коды и уровни выводятся из ru.ts: код без сообщения не соберётся.
// Без React и DOM: модуль импортирует Node (--experimental-strip-types).
import { ru } from '../i18n/ru.ts';
import type { Step } from '../model/schema.ts';
import { isScreenUrl } from '../model/url.ts';
import type { PmMap, PmSnapshots } from '../pm/snapshot.ts';

/** `danger` блокирует загрузку, `warning` и `info` — нет (§3.5:173). */
export type ReportLevel = keyof typeof ru.report.levels;
/** Код проверки §3.5:177–191. */
export type ReportCode = keyof typeof ru.report.codes;

/** Уровень каждого кода — таблица §3.5:177–191. */
export const LEVELS: Readonly<Record<ReportCode, ReportLevel>> = {
  E01: 'danger',
  E02: 'danger',
  E03: 'danger',
  E04: 'danger',
  E05: 'danger',
  E06: 'danger',
  E07: 'danger',
  W01: 'warning',
  W02: 'warning',
  W03: 'warning',
  W04: 'warning',
  W05: 'warning',
  I01: 'info',
  I02: 'info',
  I03: 'info',
};

/**
 * Строка отчёта (§3.5:195). `row` — номер строки Excel с 1 (§3.3:140), `null` — строка
 * относится к листу или книге целиком. У строк уровня книги (E01, E02, I03) `sheet` — `''`.
 */
export interface ReportRow {
  readonly level: ReportLevel;
  readonly code: ReportCode;
  readonly sheet: string;
  readonly row: number | null;
  readonly message: string;
}

/** Строка отчёта; уровень берётся из LEVELS, текст готовит вызывающий из `ru.report.codes`. */
export function reportRow(
  code: ReportCode,
  sheet: string,
  row: number | null,
  message: string,
): ReportRow {
  return { level: LEVELS[code], code, sheet, row, message };
}

/**
 * Шаг с местом в книге: лист и номер строки Excel с 1 (§3.3:140). Отчёт указывает на
 * строку, а в Step её нет — модель сценария (§3.1) не хранит координаты.
 */
export interface LocatedStep {
  readonly sheet: string;
  readonly row: number;
  readonly step: Step;
}

/**
 * `{date}` в W04 и I03 — ДД.ММ.ГГГГ (§3.5:193) из `snapshotAt` вида ГГГГ-ММ-ДД
 * (PmSnapshotSchema, §3.4:157–164). Разбор строки, а не Date: Date сдвинул бы день
 * по часовому поясу.
 */
function snapshotDate(snapshotAt: string): string {
  return `${snapshotAt.slice(8, 10)}.${snapshotAt.slice(5, 7)}.${snapshotAt.slice(0, 4)}`;
}

/**
 * Проверки по шагам (§3.5:180–187, :191). Шаги — в порядке книги: листы по порядку, внутри
 * листа — по строкам; пустые строки read.ts уже отбросил (§3.3:139), поэтому каждый шаг —
 * «непустая строка» условий E04/E05. Проверки одной строки независимы: пусты и «Шаг», и
 * «№ шага» — выдаются обе строки, а ссылка и узел проверяются и у строки с E04/E05.
 *
 * Порядок строк внутри шага — E04, E05, E06, затем одна из W02/E07/W01, затем W04; I03
 * — последней. sortReport устойчива, поэтому при равных уровне, листе и строке этот
 * порядок доходит до отчёта.
 */
export function validateSteps(
  steps: readonly LocatedStep[],
  map: PmMap,
  snapshots: PmSnapshots,
): ReportRow[] {
  const report: ReportRow[] = [];
  const snapshot = snapshots[map];
  const label = map.toUpperCase(); // §3.5:193: SNP/MRP
  const date = snapshotDate(snapshot.snapshotAt);
  // Первое вхождение каждого id на весь файл: E06 указывает на него (§3.5:182, DN-xvl).
  const first = new Map<string, LocatedStep>();

  for (const located of steps) {
    const { sheet, row, step } = located;
    if (step.title === '') report.push(reportRow('E04', sheet, row, ru.report.codes.E04()));

    // Пустой id — это E05, в поиске повторов он не участвует. Отдельный trim не нужен:
    // cellText уже обрезал края (§3.3:137), так что « 1.1 » и «1.1» — один id.
    if (step.id === '') {
      report.push(reportRow('E05', sheet, row, ru.report.codes.E05()));
    } else {
      const seen = first.get(step.id);
      if (seen) {
        report.push(
          reportRow('E06', sheet, row, ru.report.codes.E06(step.id, seen.sheet, seen.row)),
        );
      } else {
        first.set(step.id, located);
      }
    }

    // Ссылка: условие E07 — isScreenUrl (решение DN-dkb), буквально, без trim.
    if (step.url === '') {
      report.push(reportRow('W02', sheet, row, ru.report.codes.W02()));
    } else if (!isScreenUrl(step.url)) {
      report.push(reportRow('E07', sheet, row, ru.report.codes.E07(step.url)));
    } else if (step.url.startsWith('http://')) {
      report.push(reportRow('W01', sheet, row, ru.report.codes.W01()));
    }

    // Object.hasOwn, а не `in`: узел «constructor» не должен найтись в прототипе объекта.
    if (step.node !== '' && !Object.hasOwn(snapshot.nodes, step.node)) {
      report.push(reportRow('W04', sheet, row, ru.report.codes.W04(step.node, label, date)));
    }
  }

  // I03 — всегда одна строка на книгу (§3.5:191): против какой версии карты проверены узлы.
  report.push(reportRow('I03', '', null, ru.report.codes.I03(label, date)));
  return report;
}

/** Порядок уровней в отчёте: danger → warning → info (§3.5:195). */
const LEVEL_ORDER: Readonly<Record<ReportLevel, number>> = { danger: 0, warning: 1, info: 2 };

/**
 * Сортировка отчёта (§3.5:195): уровень, затем порядок листов, затем строка. Чего SPEC не
 * задаёт, взято из плана DN-06: строки уровня книги (`sheet` — `''`) идут раньше листов,
 * затем листы в порядке книги; внутри листа `row: null` (лист целиком) — раньше строк.
 * Лист не из `sheets` идёт после всех — это выбор модуля, а не плана: readWorkbook всегда
 * передаёт все листы-блоки, так что правило действует только при прямом вызове. Сортировка
 * устойчивая: при равенстве сохраняется порядок обнаружения. Вход не меняется.
 *
 * `sheets` — листы-блоки в порядке книги.
 */
export function sortReport(report: readonly ReportRow[], sheets: readonly string[]): ReportRow[] {
  const sheetIndex = new Map(sheets.map((name, index) => [name, index]));
  const sheetOrder = (sheet: string): number =>
    sheet === '' ? -1 : (sheetIndex.get(sheet) ?? sheets.length);
  return [...report].sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      sheetOrder(a.sheet) - sheetOrder(b.sheet) ||
      (a.row ?? 0) - (b.row ?? 0),
  );
}
