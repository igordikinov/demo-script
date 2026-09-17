// Запись книги xlsx (SPEC §2: «excel/write.ts — запись книги (шаблон, фикстуры)»).
// Один писатель для шаблона §6 (браузер, DN-08) и для `npm run fixture` (Node,
// SPEC §6:370): функция чистая — без React, DOM и node:*, возвращает байты,
// а сохраняет их вызывающий (в браузере — Blob, в Node — fs).
//
// Закрепление строк (§6:367 «Закреплена строка 2») здесь не поддерживается:
// SheetJS CE 0.20.3 не пишет <pane> — write_ws_xml_sheetviews выдаёт только
// <sheetView workbookViewId="0"/>, а !freeze/!views игнорируются. Решение —
// за decision-задачей к §6; опцию-заглушку не заводим.
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
}

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

/**
 * Собирает книгу из листов в заданном порядке и возвращает байты xlsx.
 * Одинаковый вход даёт побайтово одинаковый результат. Промис отклоняется на
 * пустом списке листов, недопустимом или повторном имени листа, нечисловом
 * числе (NaN, ±Infinity) и неверном диапазоне в `textRanges`.
 */
export async function writeWorkbook(sheets: readonly SheetSpec[]): Promise<Uint8Array> {
  const X = await loadXlsx();
  const wb: WorkBook = X.utils.book_new();
  for (const spec of sheets) {
    X.utils.book_append_sheet(wb, buildSheet(X, spec), spec.name);
  }
  const out: ArrayBuffer = X.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
  return new Uint8Array(out);
}
