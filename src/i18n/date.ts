// Дата сценария в каталоге (SPEC §4.2:253): сегодня — «сегодня, ЧЧ:ММ», иначе
// ДД.ММ.ГГГГ. Тот же формат у окна загрузки A4′ (§4.8:341, DN-25), поэтому помощник
// отдельный и чистый: без React и DOM, текущий момент — параметром `now`.
//
// Время местное (getFullYear/getHours…, не getUTC*): «сегодня» и часы — как на часах
// у зрителя, а loadedAt хранится в ISO и бывает в UTC или со смещением. Часы 24-часовые,
// с ведущим нулём. Без Intl — по той же причине, что plural.ts: правило короче и
// не зависит от локальных данных среды.
import { ru } from './ru.ts';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `iso` → «сегодня, ЧЧ:ММ» или «ДД.ММ.ГГГГ» относительно `now`; нечитаемая дата — `''`. */
export function formatScenarioDate(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const today =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (today) {
    return ru.catalog.today(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`);
  }
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}
