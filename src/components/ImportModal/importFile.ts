// Чтение выбранного файла для окна загрузки (SPEC §4.8:337): файл → байты →
// readWorkbook (§3.3). Лежит рядом с окном, а не в src/excel/: здесь есть File и
// FileReader, а src/excel/* работает без DOM.
//
// - Файл не .xlsx по расширению — E01 без попытки чтения (§4.8:337). Регистр
//   расширения не важен: «BOOK.XLSX» — тоже книга.
// - Байты читает FileReader, а не File.arrayBuffer(): у File в jsdom
//   arrayBuffer() нет, а тесты окна идут в jsdom.
// - Файл не прочитался (удалён, нет доступа) — тоже E01 («файл не читается»).
// - Отказ загрузки SheetJS — не вина файла: промис readWorkbook отклоняется,
//   и отклонение передаётся вызывающему.
import { readWorkbook, type ReadResult, type Summary } from '../../excel/read.ts';
import { reportRow } from '../../excel/validate.ts';
import { ru } from '../../i18n/ru.ts';
import type { PmSnapshots } from '../../pm/snapshot.ts';

const XLSX_EXTENSION = /\.xlsx$/i;

/** Сводка нечитаемого файла: ZERO_SUMMARY из read.ts не экспортирован. */
const EMPTY_SUMMARY: Summary = { sheets: 0, blocks: 0, steps: 0, withLink: 0, withNode: 0 };

/** Имя файла кончается на .xlsx (без учёта регистра). */
export function isXlsxFileName(name: string): boolean {
  return XLSX_EXTENSION.test(name);
}

/** Байты файла через FileReader. Промис отклоняется, если файл не прочитался. */
export function readFileBytes(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const { result } = reader;
      // readAsArrayBuffer всегда отдаёт ArrayBuffer; строка или null — сбой чтения.
      if (result === null || typeof result === 'string') {
        reject(new TypeError('FileReader: expected ArrayBuffer'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('FileReader: read failed'));
    };
    reader.readAsArrayBuffer(file);
  });
}

function unreadable(): ReadResult {
  return {
    report: [reportRow('E01', '', null, ru.report.codes.E01())],
    summary: EMPTY_SUMMARY,
  };
}

/** Разбор выбранного файла: расширение, байты, readWorkbook. */
export async function readImportFile(file: File, snapshots: PmSnapshots): Promise<ReadResult> {
  if (!isXlsxFileName(file.name)) {
    return unreadable();
  }
  let buf: ArrayBuffer;
  try {
    buf = await readFileBytes(file);
  } catch {
    return unreadable();
  }
  return readWorkbook(buf, file.name, snapshots);
}
