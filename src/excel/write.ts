// Запись книги xlsx (SPEC §2:45: «excel/write.ts — запись книги (шаблон, фикстуры)»).
// Один писатель для шаблона §6 (браузер, src/excel/template.ts) и для `npm run
// fixture` (Node, SPEC §6:374): функция чистая — без React, DOM и node:*,
// возвращает байты, а сохраняет их вызывающий (в браузере — Blob, в Node — fs).
//
// Закрепление строк (§6:371 «Закреплена строка 2», решение DN-akk §11:622).
// SheetJS CE 0.20.3 не пишет <pane>: write_ws_xml_sheetviews выдаёт только
// <sheetView workbookViewId="0"/>, а !freeze/!views игнорируются. Поэтому после
// X.write книга открывается встроенным в SheetJS X.CFB, в XML листа дописывается
// <pane ySplit="N" topLeftCell="A{N+1}" state="frozen"/>, и zip собирается заново.
// SPEC пишет «после writeFile», но writeFile — это скачивание в браузере, а
// src/excel/* живёт без DOM; правка идёт здесь, над байтами X.write, скачивание —
// в UI. Особенности CFB 0.20.3, на которые опирается код:
//  - find ищет полный путь только с ведущим «/» («xl/…» без него не находит);
//  - read проставляет записям mt (DOS-дата 0 читается как 30.11.1979), а write
//    пишет её обратно мусорной датой 2107 года; без mt write кладёт 0, как сам
//    X.write, — поэтому mt удаляется, и книга без правок совпадает с X.write побайтно;
//  - content записей и результат write в Node — Buffer, в браузере — Uint8Array
//    или массив чисел: оба приводятся к Uint8Array;
//  - лист i книги лежит в xl/worksheets/sheet{i+1}.xml (порядок SheetNames).
// Если опорная <sheetView workbookViewId="0"/> в XML листа встречается не ровно
// один раз (другая версия SheetJS), запись отклоняется, а не проходит молча.
import type { CellObject, WorkBook, WorkSheet } from 'xlsx';
import { loadXlsx } from './xlsx.ts';
import type { XlsxModule } from './xlsx.ts';

/** Ячейка-гиперссылка: в ячейке виден `text`, цель ссылки — `link` (SPEC §3.3:138). */
export interface LinkCell {
  readonly text: string;
  readonly link: string;
}

/** `''`, `null` и `undefined` — ячейка не создаётся. */
export type CellValue = string | number | LinkCell | null | undefined;

export interface SheetSpec {
  /** Имя листа; допустимость (длина ≤ 31, без `: \ / ? * [ ]`, без повторов) проверяет SheetJS. */
  readonly name: string;
  /** `rows[0]` — строка 1 Excel, `rows[r][0]` — колонка A. */
  readonly rows: readonly (readonly CellValue[])[];
  /** Ширины колонок в символах (`wch`), `[0]` — колонка A. */
  readonly colWidths?: readonly number[];
  /** A1-диапазоны с текстовым форматом `@`, например `'A3:A500'`; пустые ячейки тоже получают формат. */
  readonly textRanges?: readonly string[];
  /** Число закреплённых верхних строк, целое ≥ 1 (§6:371: шаблон закрепляет строку 2). */
  readonly freezeRows?: number;
}

/** Запись zip-контейнера CFB; у корня `content` нет. */
interface CfbEntry {
  content?: Uint8Array | readonly number[];
  size?: number;
  mt?: Date;
}

interface CfbContainer {
  readonly FileIndex: CfbEntry[];
}

/** Часть API X.CFB, которой пользуется запись; в типах SheetJS он `any`. */
interface CfbApi {
  read(data: Uint8Array, opts: { readonly type: 'array' }): CfbContainer;
  find(container: CfbContainer, path: string): CfbEntry | null;
  write(
    container: CfbContainer,
    opts: { readonly fileType: 'zip'; readonly type: 'array'; readonly compression: boolean },
  ): Uint8Array | readonly number[];
}

/** Так SheetJS 0.20.3 пишет вид листа (xlsx.mjs, write_ws_xml_sheetviews). */
const SHEET_VIEW = '<sheetView workbookViewId="0"/>';

interface Bounds {
  minR: number;
  minC: number;
  maxR: number;
  maxC: number;
}

function include(bounds: Bounds | undefined, r: number, c: number): Bounds {
  if (!bounds) return { minR: r, minC: c, maxR: r, maxC: c };
  return {
    minR: Math.min(bounds.minR, r),
    minC: Math.min(bounds.minC, c),
    maxR: Math.max(bounds.maxR, r),
    maxC: Math.max(bounds.maxC, c),
  };
}

function toCell(value: CellValue): CellObject | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string') return { t: 's', v: value };
  if (typeof value === 'number') {
    // SheetJS молча записал бы NaN как #NUM!, а ±Infinity как #DIV/0!.
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in cell: ${String(value)}`);
    return { t: 'n', v: value };
  }
  return { t: 's', v: value.text, l: { Target: value.link } };
}

function buildSheet(X: XlsxModule, spec: SheetSpec): WorkSheet {
  const ws: WorkSheet = {};
  let bounds: Bounds | undefined;

  spec.rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) {
      const cell = toCell(row[c]);
      if (!cell) continue;
      ws[X.utils.encode_cell({ r, c })] = cell;
      bounds = include(bounds, r, c);
    }
  });

  for (const ref of spec.textRanges ?? []) {
    const { s, e } = X.utils.decode_range(ref);
    // decode_range не бросает: на мусоре отдаёт -1, на «B5:A1» — перевёрнутый диапазон.
    if (s.r < 0 || s.c < 0 || e.r < s.r || e.c < s.c) {
      throw new Error(`Invalid text range: ${ref}`);
    }
    for (let r = s.r; r <= e.r; r += 1) {
      for (let c = s.c; c <= e.c; c += 1) {
        const addr = X.utils.encode_cell({ r, c });
        const existing: CellObject | undefined = ws[addr];
        // Тип существующей ячейки не меняется: число остаётся числом (ТК 2, SPEC §8:394).
        ws[addr] = existing ? { ...existing, z: '@' } : { t: 'z', z: '@' };
      }
    }
    bounds = include(include(bounds, s.r, s.c), e.r, e.c);
  }

  if (bounds) {
    ws['!ref'] = X.utils.encode_range({
      s: { r: bounds.minR, c: bounds.minC },
      e: { r: bounds.maxR, c: bounds.maxC },
    });
  }
  if (spec.colWidths && spec.colWidths.length > 0) {
    ws['!cols'] = spec.colWidths.map((wch) => ({ wch }));
  }
  return ws;
}

function checkFreezeRows(spec: SheetSpec): void {
  const n = spec.freezeRows;
  if (n !== undefined && (!Number.isInteger(n) || n < 1)) {
    throw new Error(`Invalid freezeRows: ${String(n)}`);
  }
}

function toBytes(raw: Uint8Array | readonly number[]): Uint8Array {
  return raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
}

/**
 * Дописывает `<pane>` в XML листов с `freezeRows` (решение DN-akk, §6:371) и
 * собирает zip заново через встроенный X.CFB — особенности см. в шапке файла.
 */
function freezePanes(X: XlsxModule, bytes: Uint8Array, sheets: readonly SheetSpec[]): Uint8Array {
  const cfb: CfbApi = X.CFB;
  const zip = cfb.read(bytes, { type: 'array' });
  sheets.forEach((spec, i) => {
    const n = spec.freezeRows;
    if (n === undefined) return;
    const path = `/xl/worksheets/sheet${i + 1}.xml`;
    const entry = cfb.find(zip, path);
    if (!entry?.content) throw new Error(`Sheet XML not found: ${path}`);
    const xml = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      toBytes(entry.content),
    );
    const parts = xml.split(SHEET_VIEW);
    if (parts.length !== 2) {
      throw new Error(`Expected one ${SHEET_VIEW} in ${path}, found ${parts.length - 1}`);
    }
    const pane = `<pane ySplit="${n}" topLeftCell="A${n + 1}" state="frozen"/>`;
    const content = new TextEncoder().encode(
      parts.join(`<sheetView workbookViewId="0">${pane}</sheetView>`),
    );
    entry.content = content;
    entry.size = content.length;
  });
  for (const entry of zip.FileIndex) delete entry.mt;
  return new Uint8Array(cfb.write(zip, { fileType: 'zip', type: 'array', compression: true }));
}

/**
 * Собирает книгу из листов в заданном порядке и возвращает байты xlsx.
 * Одинаковый вход даёт побайтово одинаковый результат. Промис отклоняется на
 * пустом списке листов, недопустимом или повторном имени листа, нечисловом
 * числе (NaN, ±Infinity), неверном диапазоне в `textRanges` и `freezeRows`,
 * не являющемся целым ≥ 1.
 */
export async function writeWorkbook(sheets: readonly SheetSpec[]): Promise<Uint8Array> {
  const X = await loadXlsx();
  sheets.forEach(checkFreezeRows);
  const wb: WorkBook = X.utils.book_new();
  for (const spec of sheets) {
    X.utils.book_append_sheet(wb, buildSheet(X, spec), spec.name);
  }
  const out: ArrayBuffer = X.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
  const bytes = new Uint8Array(out);
  return sheets.some((spec) => spec.freezeRows !== undefined)
    ? freezePanes(X, bytes, sheets)
    : bytes;
}
