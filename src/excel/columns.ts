// Контракт колонок Excel — SPEC §3.2:116–130. Таблица COLUMNS повторяет §3.2:120–128
// дословно и в том же порядке: tests/columns.test.ts сверяет её с SPEC.md, а порядок
// задаёт порядок строк I02 в отчёте (§3.5:190). Алиасы записаны как в SPEC — в нижнем
// регистре; сравнение всё равно идёт после normalizeHeader.
// Без React и DOM: модуль импортирует Node (--experimental-strip-types).
import type { Step } from '../model/schema.ts';

/** Колонка книги: поле шага, заголовок шаблона, алиасы, обязательность (§3.2:118). */
export interface ColumnSpec {
  readonly field: keyof Step;
  readonly header: string;
  readonly aliases: readonly string[];
  readonly required: boolean;
}

export const COLUMNS: readonly ColumnSpec[] = [
  { field: 'id', header: '№ шага', aliases: ['№', 'номер шага'], required: true },
  { field: 'title', header: 'Шаг', aliases: ['название шага'], required: true },
  {
    field: 'action',
    header: 'Действие',
    aliases: ['действие (что показывает презентер)'],
    required: false,
  },
  { field: 'screen', header: 'Экран', aliases: ['экран / раздел системы'], required: false },
  { field: 'url', header: 'Ссылка', aliases: ['url', 'ссылка на экран'], required: false },
  {
    field: 'value',
    header: 'Бизнес-ценность',
    aliases: ['бизнес ценность', 'посыл клиенту'],
    required: false,
  },
  { field: 'result', header: 'Ожидаемый результат', aliases: [], required: false },
  {
    field: 'comment',
    header: 'Комментарий',
    aliases: ['комментарий / подсказка'],
    required: false,
  },
  { field: 'node', header: 'Узел карты', aliases: ['узел процесса', 'узел'], required: false },
];

/**
 * Нормализация заголовка (§3.2:116): нижний регистр, `ё→е`, пробельные символы
 * (в том числе перенос строки и неразрывный пробел) схлопнуты в один пробел, по краям
 * срезаны пробелы и знаки `.:*`. Одна регулярка по краям снимает их вперемешку —
 * «. Шаг :*» → «шаг», — поэтому повторный проход не нужен.
 */
export function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.:*]+|[\s.:*]+$/g, '');
}

/** Нормализованный заголовок или алиас → поле шага. */
const FIELD_BY_NAME: ReadonlyMap<string, keyof Step> = new Map(
  COLUMNS.flatMap((col) =>
    [col.header, ...col.aliases].map((name) => [normalizeHeader(name), col.field] as const),
  ),
);

/** Поле шага по тексту заголовка ячейки; `undefined` — заголовок не распознан (I01). */
export function matchHeader(text: string): keyof Step | undefined {
  return FIELD_BY_NAME.get(normalizeHeader(text));
}
