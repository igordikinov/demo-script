// @vitest-environment node
// SPEC §3.4 (:145-169), ТК 24 (§8, дословно): «npm run pm:snapshot дважды →
// побайтово один файл». План DN-07 §0.1: execFileSync('npm.cmd', …) без shell
// падает на Windows (EINVAL), поэтому строку скрипта читаем из package.json
// и запускаем node напрямую тем же аргументом. План DN-07 §0.2: src/data/pm/
// ещё не отслежен git на момент теста, «git diff» ничего не докажет — байты
// первого и второго прогона сравниваем напрямую (Buffer.equals).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSnapshot,
  formatLocalDate,
  PmSnapshotSchema,
  serializeSnapshot,
  type PmSnapshot,
} from '../src/pm/snapshot';

const root = fileURLToPath(new URL('..', import.meta.url));
type Json = Record<string, unknown>;

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
// План DN-07 §0.1: тест зовёт этой же строкой, а не гадает флаги руками.
const pmSnapshotScript = pkg.scripts['pm:snapshot'];

function scriptArgs(): string[] {
  // Первое слово — 'node', сам процесс уже node (process.execPath).
  return (pmSnapshotScript ?? '').split(' ').slice(1);
}

function run(from: string, out: string) {
  return spawnSync(process.execPath, [...scriptArgs(), '--from', from, '--out', out], {
    cwd: root,
    encoding: 'utf8',
  });
}

// Синтетический источник вида process-map/src/data/<map>/process.json
// (структура сверена на месте с C:\Git\process-map, план DN-07 «Дефекты…»
// не относится — это факт из README плана). Лишние поля (version, id,
// moduleLabel, overviewEdges, shortTitle, groups, edges, position, type,
// label) доказывают, что buildSnapshot их отбрасывает. Этапы идут не по
// number (2 перед 1), id узлов не по алфавиту (zeta, alpha, beta).
function snpDoc(): Json {
  return {
    version: 1,
    id: 'snp-test',
    updatedAt: '2026-09-01',
    title: 'Тестовая карта SNP',
    moduleLabel: 'SNP тест',
    overviewEdges: [],
    stages: [
      {
        id: 'stage-2',
        number: 2,
        title: 'Этап два',
        shortTitle: 'Этап 2 кратко',
        groups: [],
        edges: [],
        nodes: [{ id: 'zeta', type: 'step', label: 'Zeta', position: { x: 0, y: 0 } }],
      },
      {
        id: 'stage-1',
        number: 1,
        title: 'Этап один',
        shortTitle: 'Этап 1 кратко',
        groups: [],
        edges: [],
        nodes: [
          { id: 'alpha', type: 'step', label: 'Alpha', position: { x: 0, y: 0 } },
          { id: 'beta', type: 'data', label: 'Beta', position: { x: 10, y: 10 } },
        ],
      },
    ],
  };
}

function mrpDoc(): Json {
  return {
    version: 1,
    id: 'mrp-test',
    updatedAt: '2026-09-02',
    title: 'Тестовая карта MRP',
    moduleLabel: 'MRP тест',
    overviewEdges: [],
    stages: [
      {
        id: 'stage-1',
        number: 1,
        title: 'Этап один MRP',
        shortTitle: 'Э1',
        groups: [],
        edges: [],
        nodes: [{ id: 'gamma', type: 'step', label: 'Gamma', position: { x: 0, y: 0 } }],
      },
    ],
  };
}

// Ожидаемое сопоставление nodes для snpDoc(): alpha и beta в этапе 1, zeta в этапе 2.
const snpExpectedNodes = { alpha: 1, beta: 1, zeta: 2 };

function snpDocStageWithoutNumber(): Json {
  const doc = snpDoc();
  const stages = doc.stages as Json[];
  const first = { ...stages[0] };
  delete first.number; // источник без обязательного поля этапа
  return { ...doc, stages: [first, stages[1]] };
}

function snpDocDuplicateNode(): Json {
  const doc = snpDoc();
  const stages = doc.stages as Json[];
  const stage2 = stages[0] as Json; // number: 2, содержит zeta
  const stage1 = stages[1] as Json; // number: 1, содержит alpha, beta
  const stage2Nodes = stage2.nodes as Json[];
  const dupNode: Json = { id: 'alpha', type: 'step', label: 'Alpha dup', position: { x: 1, y: 1 } };
  const stage2WithDup = { ...stage2, nodes: [...stage2Nodes, dupNode] };
  return { ...doc, stages: [stage2WithDup, stage1] };
}

function isSortedKeysDeep(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(isSortedKeysDeep);
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Json);
    const sorted = [...keys].sort();
    if (keys.some((k, i) => k !== sorted[i])) return false;
    return Object.values(value as Json).every(isSortedKeysDeep);
  }
  return true;
}

describe('package.json: строка скрипта pm:snapshot (план DN-07 §0.1)', () => {
  it('дословно "node --experimental-strip-types scripts/pm-snapshot.ts"', () => {
    expect(pmSnapshotScript).toBe('node --experimental-strip-types scripts/pm-snapshot.ts');
  });
});

describe('ТК 24: npm run pm:snapshot дважды → побайтово один файл', () => {
  const tmpDirs: string[] = [];
  function tmp(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }
  afterAll(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  });

  function writeSource(dir: string, map: string, value: unknown): void {
    const target = join(dir, 'src', 'data', map, 'process.json');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(value, null, 2), 'utf8');
  }

  function writeRaw(dir: string, map: string, text: string): void {
    const target = join(dir, 'src', 'data', map, 'process.json');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, 'utf8');
  }

  function validSourceDir(): string {
    const dir = tmp('dn-pm-src-');
    writeSource(dir, 'snp', snpDoc());
    writeSource(dir, 'mrp', mrpDoc());
    return dir;
  }

  it('два прогона подряд дают идентичные snp.json и mrp.json', { timeout: 60_000 }, () => {
    const src = validSourceDir();
    const out = tmp('dn-pm-out-');
    let firstSnp = Buffer.alloc(0);
    let firstMrp = Buffer.alloc(0);
    let secondSnp = Buffer.alloc(0);
    let secondMrp = Buffer.alloc(0);
    let stable = false;
    // Риск «полночь между прогонами» (план DN-07 §6): snapshotAt — локальная
    // дата, поэтому если сутки сменились между первым и вторым прогоном,
    // расхождение легитимно. Пара прогонов повторяется один раз.
    for (let attempt = 0; attempt < 2 && !stable; attempt++) {
      const before = formatLocalDate(new Date());
      const r1 = run(src, out);
      expect(r1.status).toBe(0);
      firstSnp = readFileSync(join(out, 'snp.json'));
      firstMrp = readFileSync(join(out, 'mrp.json'));
      const r2 = run(src, out);
      expect(r2.status).toBe(0);
      secondSnp = readFileSync(join(out, 'snp.json'));
      secondMrp = readFileSync(join(out, 'mrp.json'));
      const after = formatLocalDate(new Date());
      stable = before === after;
    }
    expect(stable).toBe(true);
    expect(firstSnp.equals(secondSnp)).toBe(true);
    expect(firstMrp.equals(secondMrp)).toBe(true);
  });

  describe('формат вывода (SPEC:167 «вывод детерминирован»)', () => {
    let snpText = '';
    let snpParsed: unknown;

    beforeAll(() => {
      const src = validSourceDir();
      const out = tmp('dn-pm-out-format-');
      const result = run(src, out);
      expect(result.status).toBe(0);
      snpText = readFileSync(join(out, 'snp.json'), 'utf8');
      snpParsed = JSON.parse(snpText);
    });

    it('без \\r, кончается на \\n', () => {
      expect(snpText.includes('\r')).toBe(false);
      expect(snpText.endsWith('\n')).toBe(true);
    });

    it('отступ 2: JSON.stringify(JSON.parse(text), null, 2) + "\\n" — тот же текст', () => {
      expect(snpText).toBe(JSON.stringify(JSON.parse(snpText), null, 2) + '\n');
    });

    it('ключи отсортированы рекурсивно', () => {
      expect(isSortedKeysDeep(snpParsed)).toBe(true);
    });

    it('проходит PmSnapshotSchema.parse', () => {
      expect(() => PmSnapshotSchema.parse(snpParsed)).not.toThrow();
    });

    it('порядок ключей верхнего уровня: map,nodes,snapshotAt,sourceUpdatedAt,stages,title', () => {
      expect(Object.keys(snpParsed as Json)).toEqual([
        'map',
        'nodes',
        'snapshotAt',
        'sourceUpdatedAt',
        'stages',
        'title',
      ]);
    });

    it('map/title/sourceUpdatedAt взяты из источника (SPEC:157-161)', () => {
      const parsed = snpParsed as PmSnapshot;
      expect(parsed.map).toBe('snp');
      expect(parsed.title).toBe('Тестовая карта SNP');
      expect(parsed.sourceUpdatedAt).toBe('2026-09-01');
    });

    it('stages отсортированы по number и содержат только {number,title}', () => {
      const parsed = snpParsed as PmSnapshot;
      expect(parsed.stages).toEqual([
        { number: 1, title: 'Этап один' },
        { number: 2, title: 'Этап два' },
      ]);
    });

    it('nodes сопоставляют каждому id номер его этапа', () => {
      const parsed = snpParsed as PmSnapshot;
      expect(parsed.nodes).toEqual(snpExpectedNodes);
    });

    it('snapshotAt — сегодняшняя локальная дата', () => {
      const parsed = snpParsed as PmSnapshot;
      expect(parsed.snapshotAt).toBe(formatLocalDate(new Date()));
    });
  });

  describe('ошибки: код выхода 1, ни snp.json, ни mrp.json не записаны', () => {
    function expectFailure(from: string, out: string): void {
      const result = run(from, out);
      expect(result.status).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(existsSync(join(out, 'snp.json'))).toBe(false);
      expect(existsSync(join(out, 'mrp.json'))).toBe(false);
    }

    it('нет --from', () => {
      const out = tmp('dn-pm-out-');
      // Всегда с явным --out: код не должен добраться до записи, но не
      // рискуем реальным src/data/pm, если проверка --from сломана.
      const result = spawnSync(process.execPath, [...scriptArgs(), '--out', out], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(existsSync(join(out, 'snp.json'))).toBe(false);
      expect(existsSync(join(out, 'mrp.json'))).toBe(false);
    });

    it('нет src/data/mrp/process.json при валидном snp — запись только после сборки обеих карт (план DN-07 §0.6)', () => {
      const src = validSourceDir();
      rmSync(join(src, 'src', 'data', 'mrp', 'process.json'));
      expectFailure(src, tmp('dn-pm-out-'));
    });

    it('snp/process.json — невалидный JSON', () => {
      const src = validSourceDir();
      writeRaw(src, 'snp', '{');
      expectFailure(src, tmp('dn-pm-out-'));
    });

    it('у этапа нет number', () => {
      const src = tmp('dn-pm-src-');
      writeSource(src, 'snp', snpDocStageWithoutNumber());
      writeSource(src, 'mrp', mrpDoc());
      expectFailure(src, tmp('dn-pm-out-'));
    });

    it('один id узла в двух этапах одной карты', () => {
      const src = tmp('dn-pm-src-');
      writeSource(src, 'snp', snpDocDuplicateNode());
      writeSource(src, 'mrp', mrpDoc());
      expectFailure(src, tmp('dn-pm-out-'));
    });
  });
});

describe('buildSnapshot / serializeSnapshot / formatLocalDate (юнит, план DN-07 §1 «Юнит-тесты»)', () => {
  it('buildSnapshot сопоставляет каждому id номер этапа и переносит title/updatedAt', () => {
    const snapshot = buildSnapshot(snpDoc(), 'snp', '2026-09-17');
    expect(snapshot).toEqual({
      map: 'snp',
      title: 'Тестовая карта SNP',
      sourceUpdatedAt: '2026-09-01',
      snapshotAt: '2026-09-17',
      stages: [
        { number: 1, title: 'Этап один' },
        { number: 2, title: 'Этап два' },
      ],
      nodes: snpExpectedNodes,
    });
  });

  it('повтор id узла — ошибка, текст сообщения содержит id', () => {
    expect(() => buildSnapshot(snpDocDuplicateNode(), 'snp', '2026-09-17')).toThrow(/alpha/);
  });

  it('без updatedAt в источнике — ошибка', () => {
    const doc = snpDoc();
    delete doc.updatedAt;
    expect(() => buildSnapshot(doc, 'snp', '2026-09-17')).toThrow();
  });

  it('snapshotAt не в формате ГГГГ-ММ-ДД — ошибка', () => {
    expect(() => buildSnapshot(snpDoc(), 'snp', '17.09.2026')).toThrow();
  });

  it('serializeSnapshot не зависит от порядка вставки ключей объекта', () => {
    const a: PmSnapshot = {
      map: 'snp',
      title: 't',
      sourceUpdatedAt: '2026-09-01',
      snapshotAt: '2026-09-17',
      stages: [{ number: 1, title: 'A' }],
      nodes: { a: 1 },
    };
    const b = {
      nodes: { a: 1 },
      stages: [{ title: 'A', number: 1 }],
      snapshotAt: '2026-09-17',
      sourceUpdatedAt: '2026-09-01',
      title: 't',
      map: 'snp',
    } as PmSnapshot;
    expect(serializeSnapshot(a)).toBe(serializeSnapshot(b));
  });

  it('formatLocalDate — локальная дата, не UTC (план DN-07 §0.4)', () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
  });
});
