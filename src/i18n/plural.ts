// Русская плюрализация (SPEC §3.3:143, ТК 23). Без зависимостей от React, DOM и данных:
// файл импортируют и Node-скрипты через --experimental-strip-types.

/** Формы существительного: `one` — 1 шаг, `few` — 2 шага, `many` — 5 шагов. */
export type PluralForms = readonly [one: string, few: string, many: string];

/**
 * Русская форма множественного числа — только слово, без числа.
 * Intl.PluralRules дал бы то же самое, но тянет локальные данные и в jsdom
 * ведёт себя по-разному между версиями Node — правило короче и детерминированнее.
 */
export function pluralRu(count: number, forms: PluralForms): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) {
    return forms[2];
  }
  const mod10 = abs % 10;
  if (mod10 === 1) {
    return forms[0];
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return forms[1];
  }
  return forms[2];
}

/** Число и слово в нужной форме: `countRu(21, ['шаг', 'шага', 'шагов'])` → «21 шаг». */
export function countRu(count: number, forms: PluralForms): string {
  return `${count} ${pluralRu(count, forms)}`;
}
