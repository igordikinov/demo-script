// Отчёт проверок — SPEC §3.5:171–197. Пока только каркас: типы строки отчёта, уровни
// всех 15 кодов (колонка «Уровень» таблицы §3.5:177–191 — данные, не проверки) и
// сборщик строки. Структурные коды E01–E03, W03, W05, I01, I02 выдаёт сам разбор
// (read.ts); проверки по шагам E04–E07, W01, W02, W04, I03, сортировку отчёта
// (§3.5:195) и снимки карт добавит DN-06.
// Коды и уровни выводятся из ru.ts: код без сообщения не соберётся.
// Без React и DOM: модуль импортирует Node (--experimental-strip-types).
import { ru } from '../i18n/ru.ts';

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
 * относится к листу или книге целиком. У строк уровня книги (E01, E02) `sheet` — `''`.
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
