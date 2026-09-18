// Снимки карт процесса для приложения — SPEC §3.4 (:145–169): src/data/pm/<map>.json.
// Нужны окну загрузки (SPEC §4.8:337–339): третий аргумент readWorkbook, по ним
// идут проверки W04 и I03 (§3.5:187, :191). Сам разбор снимки не грузит — так
// src/excel/* остаётся чистым и одинаково работает в браузере и в Node.
//
// Только для приложения: JSON импортирует Vite. Node с --experimental-strip-types
// без `with { type: 'json' }` такой импорт не выполнит, поэтому скрипты читают
// снимки через fs. Не путать с ./snapshot.ts (одна буква разницы): там схема
// снимка и его сборка из process-map.
import mrpJson from '../data/pm/mrp.json';
import snpJson from '../data/pm/snp.json';
import { PmSnapshotSchema, type PmSnapshots } from './snapshot.ts';

let cached: PmSnapshots | undefined;

/**
 * Снимки всех карт. Схема проверяется при первом вызове, результат запоминается.
 * Испорченный файл снимка — ошибка сборки, а не пользователя: бросает ZodError.
 */
export function pmSnapshots(): PmSnapshots {
  cached ??= {
    snp: PmSnapshotSchema.parse(snpJson),
    mrp: PmSnapshotSchema.parse(mrpJson),
  };
  return cached;
}
