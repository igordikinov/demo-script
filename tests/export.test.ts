// @vitest-environment node
// Экспорт «моего» сценария в книгу для scenarios/ — SPEC §4.2:255 (окно A5.3),
// ТК 34 (SPEC §8:430). Имя файла — слаг названия из id без `my-` (§3.6:203),
// занятый `index` — суффикс `-2` (§3.7:219). Книгу собирает тот же
// scenarioSheets, что шаблон и фикстуру (§6:374), поэтому экспорт →
// readWorkbook — раунд-трип без danger: содержимое равно фикстуре
// tests/fixtures/deployment-demo.json (CLAUDE.md: не придумывать содержание).
// Сборка из экспортированного файла — tests/buildScenarios.test.ts (X1),
// окно — tests/ExportDialog.test.tsx, кнопка каталога — tests/Catalog.test.tsx.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildScenarioBytes, exportFileName, exportScenarioId } from '../src/excel/export';
import { readWorkbook } from '../src/excel/read';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import { PmSnapshotSchema, type PmSnapshots } from '../src/pm/snapshot';
import fixtureJson from './fixtures/deployment-demo.json';

/** Настоящие снимки карт — как в tests/read.test.ts:24-35: узлы фикстуры проверяются по реальной карте. */
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

const fixture = fixtureJson as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

/** Копия приёма tests/reducer.test.ts:36-52 — общий хелпер не заводим. */
function buildMine(id: string): Scenario {
  const clone = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  return ScenarioSchema.parse({
    schema: 1,
    id,
    source: 'local',
    title: clone.title,
    module: clone.module,
    map: clone.map,
    fileName: 'Deployment_demo_v2.xlsx',
    loadedAt: '2026-09-18T10:42:00.000Z',
    blocks: clone.blocks.map((b, i) => ({
      n: i + 1,
      title: b.title,
      sheet: `Блок ${i + 1}`,
      steps: b.steps,
    })),
  });
}

describe('exportScenarioId / exportFileName (SPEC §4.2:255, ТК 34)', () => {
  it.each([
    ['my-deployment-demo', 'deployment-demo'],
    ['my-deployment-demo-scenariy', 'deployment-demo-scenariy'],
    ['my-deploy-pilot-2', 'deploy-pilot-2'],
    ['my-index', 'index-2'],
  ])('%s → %s.xlsx', (id, expected) => {
    const scenario = buildMine(id);
    expect(exportScenarioId(scenario)).toBe(expected);
    expect(exportFileName(scenario)).toBe(`${expected}.xlsx`);
  });
});

describe('buildScenarioBytes (SPEC §4.2:255, ТК 34): раунд-трип через readWorkbook', () => {
  it(
    'экспорт фикстуры читается обратно без danger; блоки и шаги равны исходному сценарию',
    { timeout: 30_000 },
    async () => {
      const mine = buildMine('my-deployment-demo');
      const bytes = await buildScenarioBytes(mine);

      const result = await readWorkbook(bytes.slice().buffer, 'deployment-demo.xlsx', SNAPSHOTS);
      expect(result.scenario).toBeDefined();
      expect(result.report.filter((r) => r.level === 'danger')).toEqual([]);

      expect(result.scenario?.title).toBe(fixture.title);
      expect(result.scenario?.module).toBe(fixture.module);
      expect(result.scenario?.map).toBe(fixture.map);
      // Лист `_Инструкции` в экспорт не входит; листы-блоки нумеруются заново
      // `Блок 1…n` (§6) — как у фикстуры, порядок блоков и шагов сохраняется.
      expect(result.scenario?.blocks).toEqual(mine.blocks);
    },
  );
});
