// Слаг для id сценария — SPEC §3.6:203 «транслитерация кириллицы как в process-map,
// [^a-z0-9]+ → -, не длиннее 48 символов». Перенос slugify из
// process-map/src/data/bpmn/ids.ts:24–77 с тем же порядком шагов и той же таблицей;
// отличается только лимит (48 вместо 72). Нужен разбору книги — временный id из
// имени файла (§3.1:100) — и библиотеке «Моих» (§3.6, DN-23).
// Префикс `my-` здесь не добавляется и не срезается: это решает вызывающий код.
// Без импортов, React и DOM: модуль импортирует Node (--experimental-strip-types).

/** Кириллица → латиница. Таблица та же, что в process-map (ids.ts::TRANSLIT). */
const TRANSLIT: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/** Потолок длины слага (SPEC §3.6:203). */
const MAX_SLUG_LENGTH = 48;

/**
 * Строка → kebab-case ASCII: нижний регистр, транслитерация, всё прочее — дефис,
 * дефисы по краям убираются. Длиннее `maxLength` — обрезка по последнему дефису
 * в пределах лимита (если он не в начале), иначе ровно по лимиту. Пустой
 * результат (имя из одних знаков) заменяется на `fallback`.
 */
export function slugify(value: string, fallback: string, maxLength = MAX_SLUG_LENGTH): string {
  const latin = [...value.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join('');
  let slug = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length > maxLength) {
    const cut = slug.slice(0, maxLength);
    const lastDash = cut.lastIndexOf('-');
    slug = (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/^-+|-+$/g, '');
  }
  return slug === '' ? fallback : slug;
}
