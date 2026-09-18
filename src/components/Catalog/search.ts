// Поиск каталога (SPEC §4.2:247): подстрока без учёта регистра и ё/е, фильтрует оба
// раздела сразу. Ищется только название — поле подписано «Поиск по названию»; имя
// файла и модуль не участвуют. Запрос обрезается по краям, как сравнение названий
// в §4.8:341; пустой запрос (или одни пробелы) ничего не отсеивает.
// Чистые функции: без React и DOM.

/** Текст для сравнения: нижний регистр, `ё` → `е` (`Ё` сначала становится `ё`). */
export function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е');
}

/** Элементы, в названии которых есть `query`; порядок входа сохраняется. */
export function filterByTitle<T extends { readonly title: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const needle = normalizeForSearch(query.trim());
  if (needle === '') {
    return [...items];
  }
  return items.filter((item) => normalizeForSearch(item.title).includes(needle));
}
