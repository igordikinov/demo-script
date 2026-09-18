// Разбор книги — SPEC §3.2–3.3 (:104–143): байты xlsx → полный Scenario с временными
// id/source/loadedAt (§3.1:100, решение DN-xvl.1), отчёт и сводка. Чистая функция без
// React, DOM и node:* — её зовут и окно загрузки (DN-22), и `npm run scenarios` в Node
// (§3.7:215, --experimental-strip-types).
//
// Сигнатура отличается от §3.3:134 (решение владельца, правка SPEC — DN-oj5): функция
// асинхронная, как writeWorkbook, потому что SheetJS грузится через loadXlsx(), а тип
// snapshots, которого SPEC не называет, — PmSnapshots: снимки всех карт. Загружает их
// вызывающий (окно загрузки — DN-14, сборка — DN-22), а не разбор: так функция остаётся
// чистой и одинаково работает в браузере и в Node.
//
// Здесь выдаются структурные коды — те, что видны только при чтении листа: E01, E02, E03,
// W03, W05, I01, I02. Проверки по собранным шагам (E04–E07, W01, W02, W04, I03) — в
// validate.ts; обе части отчёта сортируются вместе по §3.5:195 (sortReport).
//
// E01 шире §3.3:136: SheetJS на не-ZIP входе (CSV, HTML, случайные байты, пустой буфер)
// не бросает, а молча отдаёт книгу из одного листа — HTML-таблица с «№ шага»/«Шаг»
// разобралась бы в сценарий. Поэтому до чтения проверяется сигнатура ZIP `PK\x03\x04`
// (xlsx — всегда ZIP), а исключение чтения тоже даёт E01. Отказ загрузки самой SheetJS
// — не вина файла: промис отклоняется, E01 нет.
import type { CellObject, WorkBook, WorkSheet } from 'xlsx';
import { ru } from '../i18n/ru.ts';
import { ScenarioSchema, type Block, type Scenario, type Step } from '../model/schema.ts';
import { slugify } from '../model/slug.ts';
import { isScreenUrl } from '../model/url.ts';
import { COLUMNS, matchHeader, normalizeHeader } from './columns.ts';
import type { PmSnapshots } from '../pm/snapshot.ts';
import {
  reportRow,
  sortReport,
  validateSteps,
  type LocatedStep,
  type ReportRow,
} from './validate.ts';
import { loadXlsx, type XlsxModule } from './xlsx.ts';

/** Сводка разбора (§3.3:143). Считается и тогда, когда сценарий не собран. */
export interface Summary {
  /** Число листов-блоков — все листы, чьё имя не начинается с `_`, включая пропущенные. */
  readonly sheets: number;
  readonly blocks: number;
  readonly steps: number;
  /** Шаги со ссылкой на экран по isScreenUrl (решение DN-dkb). */
  readonly withLink: number;
  /** Шаги с непустым `node`. */
  readonly withNode: number;
}

/** Результат разбора: `scenario` есть, только если в отчёте нет ни одной `danger` (§3.3:141). */
export interface ReadResult {
  readonly scenario?: Scenario;
  readonly report: ReportRow[];
  readonly summary: Summary;
}

/** Служебный лист с названием, модулем и картой сценария (§3.2:109); имя — точное. */
const SCENARIO_SHEET = '_Сценарий';
/** Строка заголовков ищется в строках Excel 1–3 (§3.2:112); индексы SheetJS с 0. */
const LAST_HEADER_ROW = 2;
/** Колонка A — название блока над заголовками (§3.2:112), ключ `_Сценарий` (§3.2:109). */
const COL_A = 0;
/** Колонка B — значение `_Сценарий` (§3.2:109). */
const COL_B = 1;

const ZERO_SUMMARY: Summary = { sheets: 0, blocks: 0, steps: 0, withLink: 0, withNode: 0 };

/** Первые байты локального заголовка ZIP: `PK\x03\x04`. */
function hasZipSignature(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const head = new Uint8Array(buf, 0, 4);
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

function cellAt(X: XlsxModule, ws: WorkSheet, r: number, c: number): CellObject | undefined {
  // Индекс WorkSheet типизирован как any — сужаем явно, как в write.ts.
  const cell: CellObject | undefined = ws[X.utils.encode_cell({ r, c })];
  return cell;
}

/**
 * Текст ячейки (§3.3:137): отображаемый `w`, иначе `v`; trim только по краям — переносы
 * строк внутри сохраняются (§11 №15). У числа с форматом даты SheetJS не даёт `w`,
 * а `v` в типах необязателен — без проверки получилась бы строка 'undefined'.
 */
function cellText(cell: CellObject | undefined): string {
  if (!cell) return '';
  return (cell.w ?? (cell.v === undefined ? '' : String(cell.v))).trim();
}

/**
 * Восстановление UTF-8 в цели гиперссылки (§3.3:138, DN-13n, найдено в DN-04). Причина
 * существования функции — SheetJS 0.20.3 (§1): в `.rels` адрес лежит корректным UTF-8, но
 * эта версия разбирает его побайтно, как latin1, и `.../путь` приходит как `.../Ð¿ÑƒÑ‚ÑŒ`.
 * Обратно: коды символов — это и есть исходные байты, их читает TextDecoder.
 *
 * Трогаются только строки, где есть символы U+0080…U+00FF и нет ни одного выше U+00FF:
 * чистый ASCII (в том числе percent-encoded адрес из файла, сохранённого Excel) в такой
 * подмене не участвует, а символ выше U+00FF в байт не укладывается — значит, строку уже
 * декодировали правильно. `fatal: true` обязателен: без него невалидные последовательности
 * молча станут U+FFFD и настоящий latin1-адрес испортится, а так исключение оставит
 * исходную строку.
 *
 * Экспорт — не для приложения (единственный вызов ниже, в linkTarget), а для тестов этих
 * двух отсечек: через writeWorkbook их не достать, писатель всегда кладёт в `.rels`
 * корректный UTF-8. Пригодится и любому будущему чтению `.rels` — пока SheetJS 0.20.3.
 */
export function recoverUtf8(target: string): string {
  const bytes = new Uint8Array(target.length);
  let hasHighByte = false;
  for (let i = 0; i < target.length; i += 1) {
    const code = target.charCodeAt(i);
    if (code > 0xff) return target;
    if (code > 0x7f) hasHighByte = true;
    bytes[i] = code;
  }
  if (!hasHighByte) return target;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return target;
  }
}

/**
 * Цель гиперссылки ячейки (§3.3:138) — без trim и percent-декодирования, единственное
 * место чтения `l.Target`. Правится только кодировка (см. recoverUtf8, DN-13n).
 */
function linkTarget(cell: CellObject | undefined): string | undefined {
  const target = cell?.l?.Target;
  return target === undefined ? undefined : recoverUtf8(target);
}

/** Имя файла без последнего расширения; у «.xlsx» точка в начале — имя остаётся целиком. */
function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

interface ScenarioMeta {
  title: string;
  module: string;
  map: Scenario['map'];
}

/**
 * Лист `_Сценарий` (§3.2:109): A — ключ, B — значение. Ключи сравниваются через
 * normalizeHeader. Пустое название или нет листа → имя файла без расширения; модуль
 * по умолчанию пуст; карта без учёта регистра, всё, кроме `mrp`, — `snp`.
 */
function readMeta(X: XlsxModule, wb: WorkBook, fileName: string): ScenarioMeta {
  const meta: ScenarioMeta = { title: baseName(fileName), module: '', map: 'snp' };
  const ws = wb.Sheets[SCENARIO_SHEET];
  const ref = ws?.['!ref'];
  if (!ws || !ref) return meta;
  const range = X.utils.decode_range(ref);
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const key = normalizeHeader(cellText(cellAt(X, ws, r, COL_A)));
    const value = cellText(cellAt(X, ws, r, COL_B));
    if (key === 'название') {
      if (value !== '') meta.title = value;
    } else if (key === 'модуль') {
      meta.module = value;
    } else if (key === 'карта') {
      meta.map = value.toLowerCase() === 'mrp' ? 'mrp' : 'snp';
    }
  }
  return meta;
}

function emptyStep(): Step {
  return {
    id: '',
    title: '',
    action: '',
    screen: '',
    url: '',
    value: '',
    result: '',
    comment: '',
    node: '',
  };
}

/**
 * Лист-блок (§3.2:110–130, §3.3:137–140). Строки отчёта пишет в `report`, шаги с номером
 * строки Excel — в `located` для проверок validateSteps (§3.3:140). Возвращает блок или
 * `undefined`, если лист пропущен (E03, W05) — номер `n` он всё равно занял.
 */
function readBlock(
  X: XlsxModule,
  ws: WorkSheet | undefined,
  sheet: string,
  n: number,
  report: ReportRow[],
  located: LocatedStep[],
): Block | undefined {
  const ref = ws?.['!ref'];
  if (!ws || !ref) {
    report.push(reportRow('E03', sheet, null, ru.report.codes.E03()));
    return undefined;
  }
  const { s, e } = X.utils.decode_range(ref);

  // Строка заголовков — абсолютные строки 1–3, колонки — по !ref. Повтор поля: первая колонка.
  let headerRow = -1;
  let fields = new Map<number, keyof Step>();
  for (let r = Math.max(s.r, 0); r <= Math.min(e.r, LAST_HEADER_ROW); r += 1) {
    const found = new Map<number, keyof Step>();
    const seen = new Set<keyof Step>();
    for (let c = s.c; c <= e.c; c += 1) {
      const field = matchHeader(cellText(cellAt(X, ws, r, c)));
      if (field !== undefined && !seen.has(field)) {
        seen.add(field);
        found.set(c, field);
      }
    }
    if (seen.has('id') && seen.has('title')) {
      headerRow = r;
      fields = found;
      break;
    }
  }
  if (headerRow < 0) {
    report.push(reportRow('E03', sheet, null, ru.report.codes.E03()));
    return undefined;
  }

  // Название блока — самая верхняя непустая A над заголовками, иначе имя листа.
  let title = sheet;
  for (let r = 0; r < headerRow; r += 1) {
    const text = cellText(cellAt(X, ws, r, COL_A));
    if (text !== '') {
      title = text;
      break;
    }
  }

  const steps: Step[] = [];
  for (let r = headerRow + 1; r <= e.r; r += 1) {
    const step = emptyStep();
    let numericId = false;
    for (const [c, field] of fields) {
      const cell = cellAt(X, ws, r, c);
      step[field] = field === 'url' ? (linkTarget(cell) ?? cellText(cell)) : cellText(cell);
      if (field === 'id' && cell?.t === 'n') numericId = true;
    }
    // Пусты все распознанные колонки — строка пропускается молча (§3.3:139): так же
    // уходит и хвост пустых ячеек с форматом «@» у шаблона (заметка DN-04).
    if (Object.values(step).every((value) => value === '')) continue;
    if (numericId) report.push(reportRow('W03', sheet, r + 1, ru.report.codes.W03()));
    steps.push(step);
    located.push({ sheet, row: r + 1, step });
  }
  if (steps.length === 0) {
    report.push(reportRow('W05', sheet, null, ru.report.codes.W05()));
    return undefined;
  }

  // I01 — по строке на каждую непустую нераспознанную колонку (повтор распознанной
  // колонки не в счёт); I02 — по строке на недостающую необязательную, в порядке COLUMNS.
  for (let c = s.c; c <= e.c; c += 1) {
    const text = cellText(cellAt(X, ws, headerRow, c));
    if (text !== '' && matchHeader(text) === undefined) {
      report.push(reportRow('I01', sheet, null, ru.report.codes.I01(text)));
    }
  }
  const present = new Set(fields.values());
  for (const col of COLUMNS) {
    if (!col.required && !present.has(col.field)) {
      report.push(reportRow('I02', sheet, null, ru.report.codes.I02(col.header)));
    }
  }
  return { n, title, sheet, steps };
}

/**
 * Разбирает книгу xlsx (§3.3). Промис отклоняется только при отказе загрузки SheetJS;
 * всё, что не так с файлом, — строки отчёта, отсортированные по §3.5:195. Сценарий
 * возвращается, если нет `danger` (§3.3:141) и он проходит ScenarioSchema.
 *
 * `snapshots` — снимки карт (§3.4) для W04 и I03; берётся снимок карты из `_Сценарий`.
 * После E01 не выполняется ничего (§3.3:136), I03 тоже нет. I03 выдаётся, когда книга
 * прочитана (план DN-06), — значит, и при E02/E03.
 */
export async function readWorkbook(
  buf: ArrayBuffer,
  fileName: string,
  snapshots: PmSnapshots,
): Promise<ReadResult> {
  const X = await loadXlsx();
  const unreadable = (): ReadResult => ({
    report: [reportRow('E01', '', null, ru.report.codes.E01())],
    summary: ZERO_SUMMARY,
  });
  if (!hasZipSignature(buf)) return unreadable();
  let wb: WorkBook;
  try {
    wb = X.read(buf, { type: 'array', cellDates: false });
  } catch {
    return unreadable();
  }

  // Структурные строки — в порядке разбора, за ними строки validateSteps; sortReport
  // устойчива, поэтому при равных уровне, листе и строке этот порядок сохраняется.
  const raw: ReportRow[] = [];
  const located: LocatedStep[] = [];
  const meta = readMeta(X, wb, fileName);
  const blockSheets = wb.SheetNames.filter((name) => !name.startsWith('_'));
  const blocks: Block[] = [];
  blockSheets.forEach((sheet, index) => {
    const block = readBlock(X, wb.Sheets[sheet], sheet, index + 1, raw, located);
    if (block) blocks.push(block);
  });
  if (blocks.length === 0) raw.push(reportRow('E02', '', null, ru.report.codes.E02()));
  raw.push(...validateSteps(located, meta.map, snapshots));
  const report = sortReport(raw, blockSheets);

  const steps = blocks.flatMap((block) => block.steps);
  const summary: Summary = {
    sheets: blockSheets.length,
    blocks: blocks.length,
    steps: steps.length,
    withLink: steps.filter((step) => isScreenUrl(step.url)).length,
    withNode: steps.filter((step) => step.node !== '').length,
  };
  if (report.some((row) => row.level === 'danger')) return { report, summary };

  // Страховка: пустые «Шаг» и «№ шага» уже дали E04/E05 выше. Если схема всё же откажет
  // (пустое название при пустом fileName — в браузере так не бывает), сценария нет.
  const parsed = ScenarioSchema.safeParse({
    schema: 1,
    id: slugify(baseName(fileName), 'scenario'),
    source: 'local',
    title: meta.title,
    module: meta.module,
    map: meta.map,
    fileName,
    loadedAt: '',
    blocks,
  });
  return parsed.success ? { scenario: parsed.data, report, summary } : { report, summary };
}
