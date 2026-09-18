// @vitest-environment node
// ТК 1 (SPEC §8:397, дословно, перенесён из tests/read.test.ts в tests/fixture.test.ts
// — bd DN-oj5) и ТК 12 (SPEC §8:408, дословно). §6:374: «Той же функцией
// записи (src/excel/write.ts) npm run fixture собирает tests/fixtures/deployment-demo.xlsx
// и первый общий сценарий scenarios/deployment-demo.xlsx из tests/fixtures/deployment-demo.json».
// Поля сравнения ТК1 «поле в поле» — {title, module,
// map, blocks:[{title, steps}]} через toEqual с JSON; n/sheet/id проверяются отдельно —
// в JSON их нет.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from '../src/excel/read';
import { scenarioSheets } from '../src/excel/template';
import { writeWorkbook } from '../src/excel/write';
import { ru } from '../src/i18n/ru';
import type { Step } from '../src/model/schema';
import { PmSnapshotSchema, type PmSnapshots } from '../src/pm/snapshot';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Настоящие снимки карт (как в tests/read.test.ts) — фикстура сверяется по-настоящему. */
const SNAPSHOTS: PmSnapshots = {
  snp: PmSnapshotSchema.parse(
    JSON.parse(readFileSync(join(root, 'src', 'data', 'pm', 'snp.json'), 'utf8')),
  ),
  mrp: PmSnapshotSchema.parse(
    JSON.parse(readFileSync(join(root, 'src', 'data', 'pm', 'mrp.json'), 'utf8')),
  ),
};

/** Единственный локальный вызов readWorkbook в файле: третий аргумент snapshots —
 * реальные снимки карт, чтобы 26 узлов фикстуры (ТК 12: все — ключи snp.json)
 * сверялись по-настоящему, без W04. */
async function readBook(bytes: Uint8Array, fileName: string) {
  return readWorkbook(new Uint8Array(bytes).buffer, fileName, SNAPSHOTS);
}

interface FixtureJson {
  readonly title: string;
  readonly module: string;
  readonly map: 'snp' | 'mrp';
  readonly blocks: readonly { readonly title: string; readonly steps: readonly Step[] }[];
}

const fixtureJson = JSON.parse(
  readFileSync(join(root, 'tests', 'fixtures', 'deployment-demo.json'), 'utf8'),
) as FixtureJson;

describe('ТК 1 (SPEC §8:397): deployment-demo.xlsx — 3 блока, 29 шагов, 24 со ссылкой, 26 с узлом', () => {
  it('F1: без danger, сценарий поле в поле равен JSON, n/sheet/id верны', async () => {
    const bytes = readFileSync(join(root, 'tests', 'fixtures', 'deployment-demo.xlsx'));
    const r = await readBook(bytes, 'deployment-demo.xlsx');

    expect(r.report.some((row) => row.level === 'danger')).toBe(false);
    expect(r.summary).toEqual({ sheets: 3, blocks: 3, steps: 29, withLink: 24, withNode: 26 });
    // Ровно 5 шагов фикстуры без ссылки (id из tests/fixtures/deployment-demo.json,
    // не из результата разбора) — W02 на каждом (SPEC §3.5:185); больше в отчёте
    // ничего нет, кроме книжной I03 про снимок карты snp (SPEC §3.5:191, ТК 12:
    // все узлы фикстуры есть в src/data/pm/snp.json от 17.09.2026 — W04 нет).
    const NO_LINK_ROWS: readonly { sheet: string; row: number }[] = [
      { sheet: 'Блок 2', row: 5 }, // 2.3
      { sheet: 'Блок 2', row: 13 }, // 2.11
      { sheet: 'Блок 3', row: 5 }, // 3.3
      { sheet: 'Блок 3', row: 8 }, // 3.6
      { sheet: 'Блок 3', row: 9 }, // 3.7
    ];
    expect(r.report).toEqual([
      ...NO_LINK_ROWS.map(({ sheet, row }) => ({
        level: 'warning',
        code: 'W02',
        sheet,
        row,
        message: ru.report.codes.W02(),
      })),
      {
        level: 'info',
        code: 'I03',
        sheet: '',
        row: null,
        message: ru.report.codes.I03('SNP', '17.09.2026'),
      },
    ]);

    const scenario = r.scenario;
    expect(scenario).toBeDefined();
    if (!scenario) throw new Error('scenario missing');

    const selection = {
      title: scenario.title,
      module: scenario.module,
      map: scenario.map,
      blocks: scenario.blocks.map(({ title, steps }) => ({ title, steps })),
    };
    expect(selection).toEqual(fixtureJson);

    expect(scenario.blocks.map((b) => [b.n, b.sheet])).toEqual([
      [1, 'Блок 1'],
      [2, 'Блок 2'],
      [3, 'Блок 3'],
    ]);
    expect(scenario.id).toBe('deployment-demo');
  });
});

describe('F2 (SPEC §6:374): писатель детерминирован — закоммиченные .xlsx равны сборке из JSON', () => {
  it('tests/fixtures/deployment-demo.xlsx и scenarios/deployment-demo.xlsx побайтово равны writeWorkbook(scenarioSheets(json))', async () => {
    const fresh = await writeWorkbook(scenarioSheets(fixtureJson));
    const committedFixture = readFileSync(join(root, 'tests', 'fixtures', 'deployment-demo.xlsx'));
    const committedScenario = readFileSync(join(root, 'scenarios', 'deployment-demo.xlsx'));
    expect(Buffer.from(fresh)).toEqual(committedFixture);
    expect(Buffer.from(fresh)).toEqual(committedScenario);
  });
});

describe('ТК 12 (SPEC §8:408): каждый node фикстуры есть в src/data/pm/snp.json', () => {
  it('F3: карта snp, 26 узлов, все — ключи snp.json.nodes (Object.hasOwn)', () => {
    expect(fixtureJson.map).toBe('snp');
    const nodes = fixtureJson.blocks
      .flatMap((b) => b.steps.map((s) => s.node))
      .filter((node) => node !== '');
    expect(nodes.length).toBe(26);

    const snp = JSON.parse(readFileSync(join(root, 'src', 'data', 'pm', 'snp.json'), 'utf8')) as {
      nodes: Record<string, number>;
    };
    for (const node of nodes) {
      expect(Object.hasOwn(snp.nodes, node)).toBe(true);
    }
  });
});

describe('F4: npm run fixture — детерминированная запись', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const fixtureScript = pkg.scripts.fixture;

  function scriptArgs(): string[] {
    // Первое слово — 'node', сам процесс уже node (process.execPath) — как в
    // tests/snapshot.test.ts (план DN-07 §0.1).
    return (fixtureScript ?? '').split(' ').slice(1);
  }

  function run(out: string, extraArgs: readonly string[] = []) {
    return spawnSync(process.execPath, [...scriptArgs(), '--out', out, ...extraArgs], {
      cwd: root,
      encoding: 'utf8',
    });
  }

  it('строка скрипта — "node --experimental-strip-types scripts/make-fixture.ts"', () => {
    expect(fixtureScript).toBe('node --experimental-strip-types scripts/make-fixture.ts');
  });

  it(
    'два прогона в разных временных каталогах дают побайтово одинаковые файлы, равные закоммиченным',
    { timeout: 60_000 },
    () => {
      const outA = mkdtempSync(join(tmpdir(), 'dn-fixture-a-'));
      const outB = mkdtempSync(join(tmpdir(), 'dn-fixture-b-'));
      try {
        const resultA = run(outA);
        expect(resultA.status).toBe(0);
        const resultB = run(outB);
        expect(resultB.status).toBe(0);

        const fixtureA = readFileSync(join(outA, 'tests', 'fixtures', 'deployment-demo.xlsx'));
        const scenarioA = readFileSync(join(outA, 'scenarios', 'deployment-demo.xlsx'));
        const fixtureB = readFileSync(join(outB, 'tests', 'fixtures', 'deployment-demo.xlsx'));
        const scenarioB = readFileSync(join(outB, 'scenarios', 'deployment-demo.xlsx'));

        expect(fixtureA.equals(fixtureB)).toBe(true);
        expect(scenarioA.equals(scenarioB)).toBe(true);

        const committedFixture = readFileSync(
          join(root, 'tests', 'fixtures', 'deployment-demo.xlsx'),
        );
        const committedScenario = readFileSync(join(root, 'scenarios', 'deployment-demo.xlsx'));
        expect(fixtureA.equals(committedFixture)).toBe(true);
        expect(scenarioA.equals(committedScenario)).toBe(true);
      } finally {
        rmSync(outA, { recursive: true, force: true });
        rmSync(outB, { recursive: true, force: true });
      }
    },
  );

  it('F5: неизвестный флаг --bogus — код выхода 1, в stderr есть "fixture:"', () => {
    const out = mkdtempSync(join(tmpdir(), 'dn-fixture-bad-'));
    try {
      const result = run(out, ['--bogus']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('fixture:');
      expect(existsSync(join(out, 'tests', 'fixtures', 'deployment-demo.xlsx'))).toBe(false);
      expect(existsSync(join(out, 'scenarios', 'deployment-demo.xlsx'))).toBe(false);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
