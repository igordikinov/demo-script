// @vitest-environment node
// ТК 20 (SPEC §8:416, дословно): «Разбор книги на 300 шагов (5 листов) < 500 мс».
// tests/perf.test.ts: 5 листов Блок 1..5 по 60 шагов через
// blockSheet (диапазон A3:A500, freezeRows — как в шаблоне §6:371), все 9 полей
// заполнены. Порядок замера: writeWorkbook, прогрев loadXlsx(), затем readBook —
// импорт SheetJS не входит в измеряемое время (собственные пробы: «холодный старт»
// 47 мс, «после прогрева» 15 мс, лимит 500 мс).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from '../src/excel/read';
import { blockSheet } from '../src/excel/template';
import { writeWorkbook } from '../src/excel/write';
import { loadXlsx } from '../src/excel/xlsx';
import type { Step } from '../src/model/schema';
import { PmSnapshotSchema, type PmSnapshots } from '../src/pm/snapshot';

/** Настоящие снимки карт (как в tests/read.test.ts); узел perfStep «urovni-sz»
 * в них есть, так что W04 не появляется — измеряется только скорость разбора. */
const SNAPSHOTS: PmSnapshots = {
  snp: PmSnapshotSchema.parse(
    JSON.parse(
      readFileSync(fileURLToPath(new URL('../src/data/pm/snp.json', import.meta.url)), 'utf8'),
    ),
  ),
  mrp: PmSnapshotSchema.parse(
    JSON.parse(
      readFileSync(fileURLToPath(new URL('../src/data/pm/mrp.json', import.meta.url)), 'utf8'),
    ),
  ),
};

/** Единственный локальный вызов readWorkbook в файле: третий аргумент snapshots —
 * реальные снимки карт; узел «urovni-sz» (perfStep) есть в src/data/pm/snp.json,
 * так что W04 в измеряемой книге нет. */
async function readBook(bytes: Uint8Array, fileName: string) {
  return readWorkbook(new Uint8Array(bytes).buffer, fileName, SNAPSHOTS);
}

const BLOCKS = 5;
const STEPS_PER_BLOCK = 60;
const LIMIT_MS = 500;

/** Шаг с заполненными всеми 9 полями (P1): id = `${k}.${j}`,
 * url = `https://ex.example/a/${j}`, node = 'urovni-sz'. */
function perfStep(k: number, j: number): Step {
  return {
    id: `${k}.${j}`,
    title: `Шаг ${k}.${j}`,
    action: `Действие ${k}.${j}`,
    screen: `Экран ${k}.${j}`,
    url: `https://ex.example/a/${j}`,
    value: `Ценность ${k}.${j}`,
    result: `Результат ${k}.${j}`,
    comment: `Комментарий ${k}.${j}`,
    node: 'urovni-sz',
  };
}

describe('ТК 20 (SPEC §8:416): разбор книги на 300 шагов (5 листов) < 500 мс', () => {
  it('P1: readWorkbook укладывается в 500 мс на прогретой SheetJS', async () => {
    const sheets = Array.from({ length: BLOCKS }, (_, i) => {
      const k = i + 1;
      const steps: Step[] = Array.from({ length: STEPS_PER_BLOCK }, (_, j) => perfStep(k, j + 1));
      return blockSheet(`Блок ${k}`, `Блок ${k}`, steps);
    });
    const bytes = await writeWorkbook(sheets);
    await loadXlsx(); // прогрев: импорт SheetJS не входит в измеряемое время.

    const t0 = performance.now();
    const r = await readBook(bytes, 'perf.xlsx');
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(LIMIT_MS);
    expect(r.summary.sheets).toBe(BLOCKS);
    expect(r.summary.blocks).toBe(BLOCKS);
    expect(r.summary.steps).toBe(BLOCKS * STEPS_PER_BLOCK);
    expect(r.report.some((row) => row.level === 'danger')).toBe(false);
  });
});
