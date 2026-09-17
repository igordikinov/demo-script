// Ссылка на экран — только http(s): условие E07 (SPEC §3.5:183) дословно, решение
// владельца DN-dkb. Схема §3.1 не меняется. Без React, DOM и импортов: позже модуль
// возьмут validate.ts (DN-06) и Node-скрипты через --experimental-strip-types.

/**
 * `true`, если адрес начинается с `http://` или `https://`. Сравнение буквальное:
 * без trim и без приведения регистра, как в условии E07.
 */
export function isScreenUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}
