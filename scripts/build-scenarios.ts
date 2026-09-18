// Сборка общих сценариев — SPEC §3.7 (:209–230), ТК 25 (§8:421).
//
//   npm run scenarios                       # сам запускается из predev и prebuild
//   npm run scenarios -- --in <каталог> --out <каталог>
//
// Для каждой книги scenarios/*.xlsx: имя файла без расширения — id (§3.7:211),
// разбор той же readWorkbook (§3.3) со снимками карт src/data/pm/*.json (§3.4,
// §3.7:215), id = имя файла, source 'repo', loadedAt из git (§3.1:100, §3.7:218).
// Пишет public/scenarios/<id>.json (полный Scenario) и public/scenarios/index.json
// (§3.7:219–228; схема и порядок items — src/model/scenarioIndex.ts).
//
// Отчёт (§3.7:216–217): строка «файл · уровень · лист · строка · сообщение»,
// уровень — подписью §3.5:193, строка null — «—» (§3.5:195). Пустой лист (строки
// уровня книги: E01/E02/I03 и собственные строки скрипта) — тоже «—»: это
// соглашение консольного отчёта этого скрипта, а не §3.5:195, знак тот же
// (ru.report.noRow). danger — в stderr, warning и info — в stdout.
//
// Дополнения к SPEC (DN-22):
// - --in <каталог> и --out <каталог> — откуда читать книги и куда писать (по
//   умолчанию scenarios/ и public/scenarios/ этого репозитория). Нужны тестам,
//   чтобы не трогать настоящие папки.
// - Книги — файлы *.xlsx с расширением в любом регистре, по имени: demo.XLSX не
//   пропускается молча, а падает на правиле имени. Файлы блокировки Excel (~$…) и
//   всё, что не .xlsx, пропускаются.
// - Нет папки --in — то же, что пустая (§3.7:228): git пустую папку не хранит, в
//   свежем клоне её просто нет.
// - Имя index занято: сценарий index затёр бы index.json — ошибка имени.
// - Обходятся все файлы, отчёт печатается по каждому. Есть хоть одна ошибка — код
//   выхода 1, и в --out ничего не пишется и не удаляется (§3.7:216).
// - loadedAt: git запускается из папки файла (файл может лежать в другом репо или
//   вне репо). Код git ≠ 0 или пустой вывод — git нет, папка не репозиторий, в репо
//   нет коммитов, файл не отслежен — берётся время изменения файла в ISO (UTC, Z).
//   Файл изменён после коммита — дата всё равно коммита (§3.7:218).
// - builtAt — самый поздний по времени loadedAt, при пустом items — '' (решение
//   владельца 18.09.2026, DN-22): повторный прогон даёт побайтово те же файлы.
// - Вывод: ключи в порядке схем zod (не сортируются, в отличие от §3.4:167),
//   отступ 2, LF в конце. Устаревшие *.json в --out (удалённые сценарии)
//   удаляются, прочие файлы не трогаются.
// - Битый снимок карты src/data/pm/*.json — ошибка, код 1.
//
// Сообщения здесь — для автора в консоли, а не строки интерфейса: в src/i18n/ru.ts
// только подписи уровней и «—», общие с окном загрузки.
//
// Код выхода: 0 — файлы записаны; 1 — ошибка (отчёт и сообщение в stderr).
//
// Запуск: node --experimental-strip-types — без enum/namespace, импорт типов
// только с `type`, относительные импорты с расширением .ts.
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
  type Dirent,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readWorkbook } from '../src/excel/read.ts';
import type { ReportRow } from '../src/excel/validate.ts';
import { ru } from '../src/i18n/ru.ts';
import { buildScenarioIndex, sharedScenarioId, toIndexItem } from '../src/model/scenarioIndex.ts';
import { ScenarioSchema, type Scenario } from '../src/model/schema.ts';
import { PmSnapshotSchema, type PmMap, type PmSnapshot } from '../src/pm/snapshot.ts';

const USAGE =
  'пример вызова:\n' +
  '  npm run scenarios\n' +
  '  npm run scenarios -- --in <каталог> --out <каталог>';

const DEFAULT_IN = fileURLToPath(new URL('../scenarios/', import.meta.url));
const DEFAULT_OUT = fileURLToPath(new URL('../public/scenarios/', import.meta.url));
const PM_DIR = fileURLToPath(new URL('../src/data/pm/', import.meta.url));

/** Файл индекса в --out (§3.7:219). */
const INDEX_FILE = 'index.json';
/** Книга — по расширению в любом регистре; правило имени проверяет регистр отдельно. */
const WORKBOOK_RE = /\.xlsx$/i;
/** Файл блокировки, который Excel кладёт рядом с открытой книгой. */
const LOCK_PREFIX = '~$';

const NAME_MESSAGE =
  'имя файла — id сценария: только a-z, 0-9 и «-», расширение .xlsx, без префикса my-, не index';
const NOT_BUILT_MESSAGE = 'сценарий не собран';

type ReportLine = Pick<ReportRow, 'level' | 'sheet' | 'row' | 'message'>;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isMissing(e: unknown): boolean {
  return e instanceof Error && 'code' in e && e.code === 'ENOENT';
}

function readArgs(): { inDir: string; out: string } {
  let values: { in?: string; out?: string };
  try {
    ({ values } = parseArgs({
      options: { in: { type: 'string' }, out: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (e) {
    throw new Error(`${errorText(e)}\n${USAGE}`);
  }
  return {
    inDir: values.in === undefined ? DEFAULT_IN : resolve(process.cwd(), values.in),
    out: values.out === undefined ? DEFAULT_OUT : resolve(process.cwd(), values.out),
  };
}

function loadSnapshot(map: PmMap): PmSnapshot {
  const path = join(PM_DIR, `${map}.json`);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`не удалось прочитать снимок карты ${path}: ${errorText(e)}`);
  }
  const parsed = PmSnapshotSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(корень)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`${path}: ${issues}`);
  }
  return parsed.data;
}

/** Имена книг в папке, по имени. Нет папки — пустой список (§3.7:228). */
function listWorkbooks(dir: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (isMissing(e)) return [];
    throw new Error(`не удалось прочитать папку ${dir}: ${errorText(e)}`);
  }
  return entries
    .filter((e) => e.isFile() && WORKBOOK_RE.test(e.name) && !e.name.startsWith(LOCK_PREFIX))
    .map((e) => e.name)
    .sort();
}

/**
 * «файл · уровень · лист · строка · сообщение» (§3.7:216, §3.5:193). Строка null —
 * «—» по §3.5:195; пустой лист (E01/E02/I03) — «—» по соглашению этого скрипта.
 */
function formatLine(fileName: string, row: ReportLine): string {
  return [
    fileName,
    ru.report.levels[row.level],
    row.sheet || ru.report.noRow,
    row.row === null ? ru.report.noRow : String(row.row),
    row.message,
  ].join(' · ');
}

/** Дата последнего коммита файла, иначе время его изменения (§3.7:218). */
function loadedAt(path: string): string {
  const log = spawnSync('git', ['log', '-1', '--format=%cI', '--', basename(path)], {
    cwd: dirname(path),
    encoding: 'utf8',
  });
  const date = log.status === 0 ? log.stdout.trim() : '';
  return date !== '' ? date : statSync(path).mtime.toISOString();
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main(): Promise<void> {
  const { inDir, out } = readArgs();
  const snapshots = { snp: loadSnapshot('snp'), mrp: loadSnapshot('mrp') };

  // Сначала разбираем все книги, пишем — только если ошибок нет ни в одной.
  const scenarios: Scenario[] = [];
  let failed = 0;
  for (const name of listWorkbooks(inDir)) {
    const id = sharedScenarioId(name);
    if (id === undefined) {
      console.error(
        formatLine(name, { level: 'danger', sheet: '', row: null, message: NAME_MESSAGE }),
      );
      failed += 1;
      continue;
    }
    const path = join(inDir, name);
    const result = await readWorkbook(new Uint8Array(readFileSync(path)).buffer, name, snapshots);
    for (const row of result.report) {
      if (row.level === 'danger') console.error(formatLine(name, row));
      else console.log(formatLine(name, row));
    }
    if (!result.scenario) {
      // Страховка read.ts: сценария нет и без danger — всё равно ошибка файла.
      if (!result.report.some((row) => row.level === 'danger')) {
        console.error(
          formatLine(name, { level: 'danger', sheet: '', row: null, message: NOT_BUILT_MESSAGE }),
        );
      }
      failed += 1;
      continue;
    }
    scenarios.push(
      ScenarioSchema.parse({
        ...result.scenario,
        id,
        source: 'repo',
        loadedAt: loadedAt(path),
      }),
    );
  }
  if (failed > 0) {
    throw new Error(`сборка остановлена: файлов с ошибками — ${failed}; ${out} не изменён`);
  }

  mkdirSync(out, { recursive: true });
  const keep = new Set([INDEX_FILE, ...scenarios.map((scenario) => `${scenario.id}.json`)]);
  for (const entry of readdirSync(out, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json') && !keep.has(entry.name)) {
      unlinkSync(join(out, entry.name));
    }
  }
  for (const scenario of scenarios) {
    writeFileSync(join(out, `${scenario.id}.json`), serialize(scenario), 'utf8');
  }
  writeFileSync(
    join(out, INDEX_FILE),
    serialize(buildScenarioIndex(scenarios.map(toIndexItem))),
    'utf8',
  );
  console.log(`scenarios: сценариев ${scenarios.length} → ${out}`);
}

try {
  await main();
} catch (e) {
  console.error(`scenarios: ${errorText(e)}`);
  process.exitCode = 1;
}
