// Единственная точка загрузки SheetJS (SPEC §1:20, CLAUDE.md «SheetJS — только
// динамическим импортом»): `import('xlsx')` выносит библиотеку в отдельный
// чанк, в стартовый бандл она не попадает (проверяет scripts/size.ts).
// Статический импорт значения из 'xlsx' в src/** запрещён ESLint — и здесь
// тоже: он перетащил бы SheetJS в чанк любого, кто импортирует loadXlsx.
// Без React, DOM и node:* — модуль импортирует и Node (--experimental-strip-types).

export type XlsxModule = typeof import('xlsx');

let pending: Promise<XlsxModule> | undefined;

/**
 * Загружает SheetJS при первом обращении и запоминает промис. Если загрузка
 * не удалась (не скачался чанк), запомненный промис сбрасывается — следующий
 * вызов пробует снова.
 */
export function loadXlsx(): Promise<XlsxModule> {
  pending ??= import('xlsx').catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
