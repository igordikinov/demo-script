// Снимок узлов карты процесса — SPEC §3.4 (:145–169).
//
//   npm run pm:snapshot -- --from ../process-map          # локальный клон
//   npm run pm:snapshot -- --from https://raw.githubusercontent.com/igordikinov/process-map/main
//
// Читает src/data/<map>/process.json источника для каждой карты (snp, mrp) и
// пишет src/data/pm/<map>.json: ключи отсортированы, отступ 2, LF. Файлы
// коммитятся; руками их не правят.
//
// --out <каталог> — дополнение к SPEC: куда писать снимки (по умолчанию
// src/data/pm/ этого репозитория). Нужно тестам, чтобы не перезаписывать
// закоммиченные файлы.
//
// Запись идёт только после того, как собраны обе карты: ошибка на одной не
// оставит новый снимок рядом со старым.
//
// Код выхода: 0 — снимки записаны; 1 — ошибка (сообщение в stderr).
//
// Запуск: node --experimental-strip-types — без enum/namespace, импорт типов
// только с `type`, относительные импорты с расширением .ts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  buildSnapshot,
  formatLocalDate,
  PM_MAPS,
  serializeSnapshot,
  type PmMap,
  type PmSnapshot,
} from '../src/pm/snapshot.ts';

const USAGE =
  'пример вызова:\n' +
  '  npm run pm:snapshot -- --from ../process-map\n' +
  '  npm run pm:snapshot -- --from https://raw.githubusercontent.com/igordikinov/process-map/main';

const DEFAULT_OUT = fileURLToPath(new URL('../src/data/pm/', import.meta.url));
const FETCH_TIMEOUT_MS = 30_000;

function isUrl(from: string): boolean {
  // Не new URL(): путь вида C:\Git\process-map разбирается как URL со схемой «c:».
  return /^https?:\/\//i.test(from);
}

function readArgs(): { from: string; out: string } {
  let values: { from?: string; out?: string };
  try {
    ({ values } = parseArgs({
      options: { from: { type: 'string' }, out: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
  }
  if (values.from === undefined || values.from.trim() === '') {
    throw new Error(`не указан источник --from\n${USAGE}`);
  }
  const out = values.out === undefined ? DEFAULT_OUT : resolve(process.cwd(), values.out);
  return { from: values.from, out };
}

async function readSource(from: string, map: PmMap): Promise<{ text: string; where: string }> {
  if (isUrl(from)) {
    const url = `${from.replace(/\/+$/, '')}/src/data/${map}/process.json`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (e) {
      throw new Error(`не удалось загрузить ${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return { text: await res.text(), where: url };
  }
  const path = resolve(process.cwd(), from, 'src', 'data', map, 'process.json');
  try {
    return { text: readFileSync(path, 'utf8'), where: path };
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
      throw new Error(`не найден файл ${path}`);
    }
    throw new Error(`не удалось прочитать ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main(): Promise<void> {
  const { from, out } = readArgs();
  const snapshotAt = formatLocalDate(new Date());

  // Сначала собираем все карты, пишем — только если собрались все.
  const snapshots: PmSnapshot[] = [];
  for (const map of PM_MAPS) {
    const { text, where } = await readSource(from, map);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`не JSON: ${where}`);
    }
    try {
      snapshots.push(buildSnapshot(json, map, snapshotAt));
    } catch (e) {
      throw new Error(`${where}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  mkdirSync(out, { recursive: true });
  for (const snapshot of snapshots) {
    const target = join(out, `${snapshot.map}.json`);
    writeFileSync(target, serializeSnapshot(snapshot), 'utf8');
    console.log(
      `${snapshot.map}: этапов ${snapshot.stages.length}, узлов ${Object.keys(snapshot.nodes).length}, ` +
        `карта от ${snapshot.sourceUpdatedAt}, снимок от ${snapshot.snapshotAt} → ${target}`,
    );
  }
}

try {
  await main();
} catch (e) {
  console.error(`pm:snapshot: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
