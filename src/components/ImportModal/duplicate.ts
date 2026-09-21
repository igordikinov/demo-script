// Совпадение названия в окне загрузки A4′ (SPEC §4.8:341–346). Сравниваются только
// «Мои»: вызывающий передаёт state.library.items, общие не участвуют — мой сценарий
// может называться так же, как общий, их различают разделы каталога (§4.2:247):
// метки источника «общий»/«мой» с DN-ysk на экранах нет (§4.1:238).
// Несколько «моих» с тем же названием SPEC не описывает: берётся первый в порядке
// стора, то есть самый новый (§3.6:204). Свободный номер ищется по тому же правилу
// сравнения, что и совпадение.
// Чистые функции без React и DOM; отдельный .ts, а не ImportModal.tsx, — правило
// react-refresh/only-export-components (как Catalog/search.ts и importFile.ts).
import { ru } from '../../i18n/ru.ts';
import type { Scenario } from '../../model/schema.ts';

/** Ключ сравнения названий: без учёта регистра и пробелов по краям (§4.8:341). */
export function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

/** Первый «мой» с тем же названием, в порядке `items`; нет такого — `undefined`. */
export function findDuplicate(items: readonly Scenario[], title: string): Scenario | undefined {
  const key = titleKey(title);
  return items.find((item) => titleKey(item.title) === key);
}

/** «{title} (2)», « (3)»… — первое название, не занятое среди `items` (§4.8:344). */
export function numberedFreeTitle(items: readonly Scenario[], title: string): string {
  const taken = new Set(items.map((item) => titleKey(item.title)));
  for (let k = 2; ; k += 1) {
    const candidate = ru.importModal.numberedTitle(title, k);
    if (!taken.has(titleKey(candidate))) {
      return candidate;
    }
  }
}
