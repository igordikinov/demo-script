// Скачивание файла из браузера: ссылка «Скачать шаблон» в окне загрузки
// (SPEC §4.8:331) и в пустых «Моих» (§4.2:255, DN-24). По §6:368 шаблон
// собирается в браузере при клике. Но src/excel/template.ts работает без DOM
// (CLAUDE.md: src/excel/* — чистые функции), поэтому он отдаёт только байты
// книги. В файл их превращает этот модуль: Blob плюс временная ссылка
// <a download>. SheetJS writeFile здесь не нужен.
//
// В iframe без allow-downloads браузер скачивание молча заблокирует (§7:381).
// Изнутри страницы этого не видно и не исправить.
import { buildTemplate, TEMPLATE_FILE_NAME } from '../../excel/template.ts';

/** MIME-тип книги .xlsx. */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Отдаёт байты браузеру как скачиваемый файл `fileName`. */
export function downloadBytes(bytes: Uint8Array, fileName: string, type: string): void {
  // slice(): Blob принимает только Uint8Array поверх ArrayBuffer, а у
  // Uint8Array<ArrayBufferLike> из writeWorkbook буфер может быть SharedArrayBuffer (TS 5.9).
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
  // Адрес отзывается на следующем такте: браузер должен успеть начать скачивание.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * Собирает шаблон §6 и скачивает его как «Шаблон демо-сценария.xlsx» (§6:368).
 * Если SheetJS не загрузился, промис отклоняется. Что показать пользователю
 * в этом случае, решает вызывающий.
 */
export async function downloadTemplate(): Promise<void> {
  downloadBytes(await buildTemplate(), TEMPLATE_FILE_NAME, XLSX_MIME_TYPE);
}
