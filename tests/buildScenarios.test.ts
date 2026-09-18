// @vitest-environment node
// SPEC §3.7 (:209–230) — сборка общих сценариев `npm run scenarios`, ТК 25
// (SPEC §8:421, дословно): «`npm run scenarios`: `scenarios/deployment-demo.xlsx`
// → `index.json` с одной записью (3 блока, 29 шагов, 24 со ссылкой) и
// `deployment-demo.json`; добавлен файл с E04 → код выхода 1, отчёт в stderr;
// файл `Demo 1.xlsx` или `my-x.xlsx` → код выхода 1; повторный прогон →
// побайтово те же файлы». DN-22.
//
// Строка отчёта — `{ level, code, sheet, row, message }` (SPEC §3.5:195):
// «файл · уровень · лист · строка · сообщение» (SPEC §3.7:216). `danger`
// печатается в stderr, `warning`/`info` не блокируют сборку (SPEC §3.5:173,
// §3.7:217) и печатаются в stdout.
//
// Тесты гоняются в отдельных временных каталогах через `--in`/`--out`;
// `public/scenarios/` репозитория не трогается ни при успехе, ни при ошибке.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from '../src/excel/read';
import { scenarioSheets } from '../src/excel/template';
import type { ReportLevel } from '../src/excel/validate';
import { writeWorkbook } from '../src/excel/write';
import { ru } from '../src/i18n/ru';
import { ScenarioSchema, type Step } from '../src/model/schema';
import {
  buildScenarioIndex,
  latestLoadedAt,
  ScenarioIndexItemSchema,
  ScenarioIndexSchema,
  sharedScenarioId,
  toIndexItem,
  type ScenarioIndex,
  type ScenarioIndexItem,
} from '../src/model/scenarioIndex';
import { PmSnapshotSchema, type PmSnapshots } from '../src/pm/snapshot';

const root = fileURLToPath(new URL('..', import.meta.url));

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/** Первое слово — 'node', сам процесс уже node (process.execPath) — как в tests/fixture.test.ts. */
function scriptArgs(): string[] {
  return (pkg.scripts.scenarios ?? '').split(' ').slice(1);
}

function run(args: readonly string[], cwd: string = root) {
  return spawnSync(process.execPath, [...scriptArgs(), ...args], { cwd, encoding: 'utf8' });
}

/** Настоящие снимки карт — сравнение с реальным `readWorkbook`, как в tests/fixture.test.ts. */
const SNAPSHOTS: PmSnapshots = {
  snp: PmSnapshotSchema.parse(
    JSON.parse(readFileSync(join(root, 'src', 'data', 'pm', 'snp.json'), 'utf8')),
  ),
  mrp: PmSnapshotSchema.parse(
    JSON.parse(readFileSync(join(root, 'src', 'data', 'pm', 'mrp.json'), 'utf8')),
  ),
};

/** Закоммиченный первый общий сценарий (SPEC §6:374). */
const DEMO = readFileSync(join(root, 'scenarios', 'deployment-demo.xlsx'));

/** Фиксированное время изменения файла для детерминированных прогонов вне git. */
const MTIME = new Date('2026-03-04T05:06:07.000Z');
const MTIME_ISO = MTIME.toISOString();

const tmpDirs: string[] = [];
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length))
    rmSync(dir, { recursive: true, force: true });
});

/** Пишет байты в `dir/name` и выставляет время изменения (по умолчанию MTIME). */
function put(dir: string, name: string, bytes: Uint8Array, mtime: Date = MTIME): void {
  writeFileSync(join(dir, name), bytes);
  utimesSync(join(dir, name), mtime, mtime);
}

/** Шаг-заготовка: `id '1.1'`, `title 'Шаг'`, ссылка на `https://example.com/a`, остальное пусто. */
function step(overrides: Partial<Step> = {}): Step {
  return {
    id: '1.1',
    title: 'Шаг',
    action: '',
    screen: '',
    url: 'https://example.com/a',
    value: '',
    result: '',
    comment: '',
    node: '',
    ...overrides,
  };
}

/** Книга с одним блоком «Блок» — тем же писателем, что и шаблон/фикстура (SPEC §6:374). */
function book(
  title: string,
  steps: readonly Step[] = [step()],
  map: 'snp' | 'mrp' = 'snp',
): Promise<Uint8Array> {
  return writeWorkbook(
    scenarioSheets({ title, module: '', map, blocks: [{ title: 'Блок', steps }] }),
  );
}

/** Строка отчёта (SPEC §3.7:216, §3.5:195): «файл · уровень · лист · строка · сообщение». */
function line(
  file: string,
  level: ReportLevel,
  sheet: string,
  row: number | null,
  message: string,
): string {
  return [
    file,
    ru.report.levels[level],
    sheet || ru.report.noRow,
    row === null ? ru.report.noRow : String(row),
    message,
  ].join(' · ');
}

/** Отсортированные имена файлов каталога. */
function names(dir: string): string[] {
  return readdirSync(dir).sort();
}

/** Имя файла → байты, для побайтового сравнения содержимого каталога целиком. */
function listing(dir: string): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  for (const name of names(dir)) out[name] = readFileSync(join(dir, name));
  return out;
}

/** `git` без унаследованных `GIT_*`, с фиксированным автором и без подписи коммита. */
function git(cwd: string, args: readonly string[], date?: string): void {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  if (date !== undefined) {
    env.GIT_AUTHOR_DATE = date;
    env.GIT_COMMITTER_DATE = date;
  }
  const result = spawnSync(
    'git',
    [
      '-c',
      'user.name=dn',
      '-c',
      'user.email=dn@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, env, encoding: 'utf8' },
  );
  expect(result.status).toBe(0);
}

describe('P1: package.json — scripts.scenarios/predev/prebuild', () => {
  it('строки ровно как задано (npm run scenarios — CLAUDE.md, вызывается из predev/prebuild)', () => {
    expect(pkg.scripts.scenarios).toBe(
      'node --experimental-strip-types scripts/build-scenarios.ts',
    );
    expect(pkg.scripts.predev).toBe('npm run scenarios');
    expect(pkg.scripts.prebuild).toBe('npm run scenarios');
  });
});

describe('T1 (ТК 25, SPEC §8:421): один файл deployment-demo.xlsx', () => {
  it(
    'index.json с одной записью (3 блока, 29 шагов, 24 со ссылкой) и deployment-demo.json',
    { timeout: 60_000 },
    async () => {
      const inDir = tmp('dn-scen-in-');
      put(inDir, 'deployment-demo.xlsx', DEMO);
      const outDir = tmp('dn-scen-out-');

      const result = run(['--in', inDir, '--out', outDir]);
      expect(result.status).toBe(0);
      expect(names(outDir)).toEqual(['deployment-demo.json', 'index.json']);

      const indexText = readFileSync(join(outDir, 'index.json'), 'utf8');
      const index = JSON.parse(indexText) as ScenarioIndex;
      expect(index).toEqual({
        schema: 1,
        builtAt: MTIME_ISO,
        items: [
          {
            id: 'deployment-demo',
            title: 'Deployment — демо-сценарий',
            module: 'SNP',
            map: 'snp',
            fileName: 'deployment-demo.xlsx',
            loadedAt: MTIME_ISO,
            blocks: 3,
            steps: 29,
            withLink: 24,
          },
        ],
      });
      expect(Object.keys(index)).toEqual(['schema', 'builtAt', 'items']);
      const [item] = index.items;
      if (!item) throw new Error('index.items пуст');
      expect(Object.keys(item)).toEqual([
        'id',
        'title',
        'module',
        'map',
        'fileName',
        'loadedAt',
        'blocks',
        'steps',
        'withLink',
      ]);
      expect(() => ScenarioIndexSchema.parse(index)).not.toThrow();
      expect(indexText).toBe(JSON.stringify(JSON.parse(indexText), null, 2) + '\n');

      const scenarioText = readFileSync(join(outDir, 'deployment-demo.json'), 'utf8');
      const scenario: unknown = JSON.parse(scenarioText);
      const read = await readWorkbook(
        new Uint8Array(DEMO).buffer,
        'deployment-demo.xlsx',
        SNAPSHOTS,
      );
      if (!read.scenario) throw new Error('readWorkbook: сценарий не собран');
      expect(scenario).toEqual({
        ...read.scenario,
        id: 'deployment-demo',
        source: 'repo',
        loadedAt: MTIME_ISO,
      });
      expect(Object.keys(scenario as Record<string, unknown>)).toEqual(
        Object.keys(ScenarioSchema.shape),
      );
      expect(() => ScenarioSchema.parse(scenario)).not.toThrow();
      expect(scenarioText.endsWith('\n')).toBe(true);
    },
  );
});

describe('T2 (ТК 25): danger в одном файле останавливает всю сборку (SPEC §3.7:216)', () => {
  it(
    'код 1; отчёт о broken.xlsx в stderr; out побайтово прежний; deployment-demo.json не появляется',
    { timeout: 60_000 },
    async () => {
      const inDir = tmp('dn-scen-in-');
      put(inDir, 'deployment-demo.xlsx', DEMO);
      put(inDir, 'broken.xlsx', await book('Сломанный', [step({ title: '' })]));

      const outDir = tmp('dn-scen-out-');
      writeFileSync(join(outDir, 'index.json'), 'old\n', 'utf8');
      writeFileSync(join(outDir, 'stale.json'), '{}\n', 'utf8');
      const before = listing(outDir);

      const result = run(['--in', inDir, '--out', outDir]);
      expect(result.status).toBe(1);

      const expectedLine = line('broken.xlsx', 'danger', 'Блок 1', 3, ru.report.codes.E04());
      expect(result.stderr).toContain(expectedLine);
      expect(result.stderr).toContain('scenarios:');
      expect(result.stdout).not.toContain(expectedLine);

      expect(listing(outDir)).toEqual(before);
      expect(existsSync(join(outDir, 'deployment-demo.json'))).toBe(false);
    },
  );
});

describe('T3 (ТК 25): запрещённое имя файла роняет всю сборку', () => {
  it.each(['Demo 1.xlsx', 'my-x.xlsx'])('%s → код 1, out пуст', (name) => {
    const inDir = tmp('dn-scen-in-');
    put(inDir, 'deployment-demo.xlsx', DEMO);
    put(inDir, name, DEMO);
    const outDir = tmp('dn-scen-out-');

    const result = run(['--in', inDir, '--out', outDir]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(line(name, 'danger', '', null, ''));
    expect(names(outDir)).toEqual([]);
  });
});

describe('T4: порядок index.json по title (ru), обход детерминирован', () => {
  it(
    'id по порядку gamma, alpha, beta; три снимка каталога побайтово равны',
    { timeout: 60_000 },
    async () => {
      const inDir = tmp('dn-scen-in-');
      put(inDir, 'alpha.xlsx', await book('Яблоко'));
      put(inDir, 'beta.xlsx', await book('Deployment — второй'));
      put(inDir, 'gamma.xlsx', await book('Арбуз'));

      const outA = tmp('dn-scen-out-a-');
      expect(run(['--in', inDir, '--out', outA]).status).toBe(0);
      const snap1 = listing(outA);

      expect(run(['--in', inDir, '--out', outA]).status).toBe(0);
      const snap2 = listing(outA);

      const outB = tmp('dn-scen-out-b-');
      expect(run(['--in', inDir, '--out', outB]).status).toBe(0);
      const snap3 = listing(outB);

      const index = JSON.parse(readFileSync(join(outA, 'index.json'), 'utf8')) as ScenarioIndex;
      expect(index.items.map((i: ScenarioIndexItem) => i.id)).toEqual(['gamma', 'alpha', 'beta']);

      expect(snap2).toEqual(snap1);
      expect(snap3).toEqual(snap1);
    },
  );
});

describe('N1: слаг имени файла (demo--2 ≠ demo-2) становится id', () => {
  it('demo--2.xlsx → id/fileName "demo--2"', { timeout: 60_000 }, () => {
    const inDir = tmp('dn-scen-in-');
    put(inDir, 'demo--2.xlsx', DEMO);
    const outDir = tmp('dn-scen-out-');

    const result = run(['--in', inDir, '--out', outDir]);
    expect(result.status).toBe(0);
    expect(names(outDir)).toEqual(['demo--2.json', 'index.json']);

    const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')) as ScenarioIndex;
    expect(index.items).toHaveLength(1);
    expect(index.items[0]).toMatchObject({ id: 'demo--2', fileName: 'demo--2.xlsx' });

    const scenario = JSON.parse(readFileSync(join(outDir, 'demo--2.json'), 'utf8')) as {
      id: string;
      fileName: string;
    };
    expect(scenario.id).toBe('demo--2');
    expect(scenario.fileName).toBe('demo--2.xlsx');
  });
});

describe('N2 (SPEC §3.7:211, имя файла — id сценария): расширение в верхнем регистре и имя "index" заняты', () => {
  it.each(['demo.XLSX', 'index.xlsx'])('%s → код 1, danger об имени файла', (name) => {
    const inDir = tmp('dn-scen-in-');
    put(inDir, name, DEMO);
    const outDir = tmp('dn-scen-out-');

    const result = run(['--in', inDir, '--out', outDir]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${name} · ${ru.report.levels.danger}`);
  });
});

describe('N3: не-.xlsx и файл блокировки Excel (~$…) пропускаются молча', () => {
  it(
    'README.md, .gitkeep и ~$deployment-demo.xlsx не мешают одному элементу',
    { timeout: 60_000 },
    () => {
      const inDir = tmp('dn-scen-in-');
      put(inDir, 'deployment-demo.xlsx', DEMO);
      writeFileSync(join(inDir, 'README.md'), '# заметка', 'utf8');
      writeFileSync(join(inDir, '.gitkeep'), '', 'utf8');
      writeFileSync(join(inDir, '~$deployment-demo.xlsx'), 'lock', 'utf8');
      const outDir = tmp('dn-scen-out-');

      const result = run(['--in', inDir, '--out', outDir]);
      expect(result.status).toBe(0);
      const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')) as ScenarioIndex;
      expect(index.items).toHaveLength(1);
    },
  );
});

describe('W1 (SPEC §3.7:217): warning и info не блокируют сборку, печатаются в stdout', () => {
  it(
    'код 0; W02 и I03 в stdout; ни «предупреждение», ни «информация» — не в stderr; withLink 0, steps 1',
    { timeout: 60_000 },
    async () => {
      const inDir = tmp('dn-scen-in-');
      put(inDir, 'nolink.xlsx', await book('Без ссылки', [step({ url: '' })]));
      const outDir = tmp('dn-scen-out-');

      const result = run(['--in', inDir, '--out', outDir]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        line('nolink.xlsx', 'warning', 'Блок 1', 3, ru.report.codes.W02()),
      );
      expect(result.stdout).toContain(line('nolink.xlsx', 'info', '', null, ''));
      expect(result.stderr).not.toContain(ru.report.levels.warning);
      expect(result.stderr).not.toContain(ru.report.levels.info);

      const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')) as ScenarioIndex;
      expect(index.items[0]).toMatchObject({ withLink: 0, steps: 1 });
    },
  );
});

describe('L1 (SPEC §3.7:218): loadedAt — дата последнего коммита файла, иначе mtime', () => {
  it(
    'коммит после изменения mtime не сбивает loadedAt; builtAt — самый поздний loadedAt по времени',
    { timeout: 60_000 },
    async () => {
      const repo = tmp('dn-scen-git-');
      git(repo, ['init']);

      const aBytes = await book('Арбуз');
      put(repo, 'a.xlsx', aBytes);
      git(repo, ['add', 'a.xlsx']);
      git(repo, ['commit', '-m', 'a'], '2026-01-02T12:00:00+03:00');

      const bBytes = await book('Банан');
      put(repo, 'b.xlsx', bBytes);
      git(repo, ['add', 'b.xlsx']);
      // +01:00, не +00:00: git 2.48 печатает `%cI` нулевого смещения как «Z», а
      // не «+00:00» — тест сравнивает дословный вывод `git log`, поэтому берём
      // смещение, которое git не переписывает (то же 10:00 UTC).
      git(repo, ['commit', '-m', 'b'], '2026-01-02T11:00:00+01:00');

      // Файл изменён после коммита — SPEC §3.7:218 всё равно требует дату коммита.
      const afterCommit = new Date('2026-06-01T00:00:00.000Z');
      put(repo, 'a.xlsx', aBytes, afterCommit);
      put(repo, 'b.xlsx', bBytes, afterCommit);

      // c.xlsx не отслежен git — loadedAt берётся из mtime файла.
      put(repo, 'c.xlsx', await book('Вишня'), new Date('2026-01-01T00:00:00.000Z'));

      const outDir = tmp('dn-scen-git-out-');
      const result = run(['--in', repo, '--out', outDir]);
      expect(result.status).toBe(0);

      const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')) as ScenarioIndex;
      const loadedAt = Object.fromEntries(
        index.items.map((i: ScenarioIndexItem) => [i.id, i.loadedAt]),
      );
      expect(loadedAt['a']).toBe('2026-01-02T12:00:00+03:00');
      expect(loadedAt['b']).toBe('2026-01-02T11:00:00+01:00');
      expect(loadedAt['c']).toBe('2026-01-01T00:00:00.000Z');
      // 12:00+03:00 = 09:00 UTC, 11:00+01:00 = 10:00 UTC — позже по времени,
      // хотя строка «11:00+01:00» лексикографически меньше «12:00+03:00».
      expect(index.builtAt).toBe('2026-01-02T11:00:00+01:00');
    },
  );
});

describe('L2: --in по умолчанию (настоящая scenarios/), loadedAt из git настоящего репозитория', () => {
  it(
    'loadedAt элемента deployment-demo равен git log -1 --format=%cI -- scenarios/deployment-demo.xlsx',
    { timeout: 60_000 },
    () => {
      const outDir = tmp('dn-scen-l2-');
      const result = run(['--out', outDir]);
      expect(result.status).toBe(0);

      const gitLog = spawnSync(
        'git',
        ['log', '-1', '--format=%cI', '--', 'scenarios/deployment-demo.xlsx'],
        { cwd: root, encoding: 'utf8' },
      );
      expect(gitLog.status).toBe(0);
      const expectedLoadedAt = gitLog.stdout.trim();
      expect(expectedLoadedAt).not.toBe('');

      const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')) as ScenarioIndex;
      const item = index.items.find((i: ScenarioIndexItem) => i.id === 'deployment-demo');
      expect(item?.loadedAt).toBe(expectedLoadedAt);
    },
  );
});

describe('O1: устаревшие *.json в --out удаляются, прочие файлы — нет', () => {
  it(
    'out содержит ровно deployment-demo.json, index.json, notes.txt; notes.txt не изменён',
    { timeout: 60_000 },
    () => {
      const inDir = tmp('dn-scen-in-');
      put(inDir, 'deployment-demo.xlsx', DEMO);
      const outDir = tmp('dn-scen-out-');
      writeFileSync(join(outDir, 'old-scenario.json'), '{}\n', 'utf8');
      writeFileSync(join(outDir, 'notes.txt'), 'x', 'utf8');

      const result = run(['--in', inDir, '--out', outDir]);
      expect(result.status).toBe(0);
      expect(names(outDir)).toEqual(['deployment-demo.json', 'index.json', 'notes.txt']);
      expect(readFileSync(join(outDir, 'notes.txt'), 'utf8')).toBe('x');
    },
  );
});

describe('O2 (SPEC §3.7:228): пустая папка scenarios — index.json с пустым items', () => {
  it('код 0; index.json — единственный файл, текст задан побайтово', () => {
    const inDir = tmp('dn-scen-empty-');
    const outDir = tmp('dn-scen-out-');

    const result = run(['--in', inDir, '--out', outDir]);
    expect(result.status).toBe(0);
    expect(names(outDir)).toEqual(['index.json']);
    expect(readFileSync(join(outDir, 'index.json'), 'utf8')).toBe(
      '{\n  "schema": 1,\n  "builtAt": "",\n  "items": []\n}\n',
    );
  });
});

describe('O3: --in указывает на несуществующую папку — тот же результат, что пустая', () => {
  it('код 0; тот же index.json, что для пустой папки', () => {
    const base = tmp('dn-scen-absent-base-');
    const absent = join(base, 'absent');
    const outDir = tmp('dn-scen-out-');

    const result = run(['--in', absent, '--out', outDir]);
    expect(result.status).toBe(0);
    expect(names(outDir)).toEqual(['index.json']);
    expect(readFileSync(join(outDir, 'index.json'), 'utf8')).toBe(
      '{\n  "schema": 1,\n  "builtAt": "",\n  "items": []\n}\n',
    );
  });
});

describe('A1: неизвестный флаг', () => {
  it('--bogus → код 1, stderr содержит "scenarios:"', () => {
    const outDir = tmp('dn-scen-out-');
    const result = run(['--out', outDir, '--bogus']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scenarios:');
    expect(existsSync(join(outDir, 'index.json'))).toBe(false);
  });
});

describe('sharedScenarioId (U1): имя файла → временный id общего сценария (SPEC §3.7:211)', () => {
  it.each([
    ['deployment-demo.xlsx', 'deployment-demo'],
    ['demo--2.xlsx', 'demo--2'],
    ['my.xlsx', 'my'],
    ['a1.xlsx', 'a1'],
  ])('%s → %s', (fileName, expected) => {
    expect(sharedScenarioId(fileName)).toBe(expected);
  });

  it.each([
    'Demo 1.xlsx',
    'my-x.xlsx',
    'demo.XLSX',
    '.xlsx',
    'demo.xls',
    'demo_1.xlsx',
    'деплой.xlsx',
    'index.xlsx',
  ])('%s → undefined', (fileName) => {
    expect(sharedScenarioId(fileName)).toBeUndefined();
  });
});

describe('toIndexItem (U2): withLink считается через isScreenUrl, а не по непустому url', () => {
  it('сценарий из 2 блоков и 4 шагов → blocks 2, steps 4, withLink 2', () => {
    const scenario = ScenarioSchema.parse({
      schema: 1,
      id: 'x',
      source: 'repo',
      title: 'Т',
      module: '',
      map: 'snp',
      fileName: 'x.xlsx',
      loadedAt: '',
      blocks: [
        {
          n: 1,
          title: 'Б1',
          sheet: 'Блок 1',
          steps: [step({ id: '1.1', url: 'https://a' }), step({ id: '1.2', url: 'http://b' })],
        },
        {
          n: 2,
          title: 'Б2',
          sheet: 'Блок 2',
          steps: [step({ id: '2.1', url: '/snp/pegging' }), step({ id: '2.2', url: '' })],
        },
      ],
    });

    const item = toIndexItem(scenario);
    expect(item.blocks).toBe(2);
    expect(item.steps).toBe(4);
    // По непустому url было бы 3, по одному только https — 1; верно — 2 (SPEC §3.5:183, isScreenUrl).
    expect(item.withLink).toBe(2);
    expect(Object.keys(item)).toEqual([
      'id',
      'title',
      'module',
      'map',
      'fileName',
      'loadedAt',
      'blocks',
      'steps',
      'withLink',
    ]);
  });
});

describe('latestLoadedAt (U3): сравнение по времени (Date.parse), а не по строке', () => {
  it('[] → ""', () => {
    expect(latestLoadedAt([])).toBe('');
  });

  it('разные часовые смещения ISO 8601 сравниваются как моменты времени', () => {
    expect(
      latestLoadedAt([
        '2026-01-02T12:00:00+03:00',
        '2026-01-02T10:00:00+00:00',
        '2026-01-01T23:00:00-05:00',
      ]),
    ).toBe('2026-01-02T10:00:00+00:00');
  });

  it('UTC с миллисекундами позже строки со смещением +03:00', () => {
    expect(latestLoadedAt(['2026-09-18T11:50:50+03:00', '2026-09-18T09:00:00.123Z'])).toBe(
      '2026-09-18T09:00:00.123Z',
    );
  });
});

function indexItem(id: string, title: string): ScenarioIndexItem {
  return {
    id,
    title,
    module: 'SNP',
    map: 'snp',
    fileName: `${id}.xlsx`,
    loadedAt: '',
    blocks: 1,
    steps: 1,
    withLink: 0,
  };
}

describe('buildScenarioIndex (U4)', () => {
  it('сортировка по title (локаль ru), при равенстве — по id посимвольно; вход не мутируется', () => {
    const items: ScenarioIndexItem[] = [
      indexItem('y', 'Яблоко'),
      indexItem('d', 'Deployment'),
      indexItem('b-dup', 'Арбуз'),
      indexItem('a-dup', 'Арбуз'),
    ];
    const before = items.map((i) => ({ ...i }));

    const index = buildScenarioIndex(items);
    expect(index.items.map((i: ScenarioIndexItem) => i.id)).toEqual(['a-dup', 'b-dup', 'y', 'd']);
    expect(items).toEqual(before);
  });

  it('[] → {schema:1, builtAt:"", items:[]}', () => {
    expect(buildScenarioIndex([])).toEqual({ schema: 1, builtAt: '', items: [] });
  });
});

function validExampleItem(): ScenarioIndexItem {
  return {
    id: 'deployment-demo',
    title: 'Deployment — демо-сценарий',
    module: 'SNP',
    map: 'snp',
    fileName: 'deployment-demo.xlsx',
    loadedAt: '2026-01-01T00:00:00.000Z',
    blocks: 3,
    steps: 29,
    withLink: 24,
  };
}

describe('ScenarioIndexSchema / ScenarioIndexItemSchema (U5)', () => {
  it('пример SPEC §3.7:222–225 с заполненными датами проходит целиком', () => {
    const example: ScenarioIndex = {
      schema: 1,
      builtAt: '2026-01-01T00:00:00.000Z',
      items: [validExampleItem()],
    };
    expect(() => ScenarioIndexSchema.parse(example)).not.toThrow();
  });

  it('id "my-x" отвергается (общий сценарий не может быть "моим", SPEC §3.7:211)', () => {
    expect(() => ScenarioIndexItemSchema.parse({ ...validExampleItem(), id: 'my-x' })).toThrow();
  });

  it('элемент без withLink отвергается', () => {
    const withoutWithLink = validExampleItem() as Record<string, unknown>;
    delete withoutWithLink.withLink;
    expect(() => ScenarioIndexItemSchema.parse(withoutWithLink)).toThrow();
  });
});
