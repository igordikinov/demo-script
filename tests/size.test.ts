// @vitest-environment node
// SPEC §8:427: «Первая отрисовка < 1 с и бандл ≤ 350 KB gzip проверяются в CI
// шагом после build (скрипт scripts/size.ts, стартовый чанк без SheetJS
// ≤ 120 KB gzip)». Первая отрисовка здесь не меряется (план DN-04, G4).
// Таймаут блока — пробные сборки Vite медленные (план: до 120 с).
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { analyzeBundle, formatReport, LIMITS, SHEETJS_MARKER } from '../scripts/size';

const root = fileURLToPath(new URL('..', import.meta.url));

// Минимум полей манифеста Vite (build.manifest: true, план п.9), которые
// читает analyzeBundle (план п.10).
interface ManifestChunk {
  file: string;
  src?: string;
  name?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
  assets?: string[];
}
type Manifest = Record<string, ManifestChunk>;

function files(entries: Record<string, string | Uint8Array>): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const [name, content] of Object.entries(entries)) {
    map.set(name, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  }
  return map;
}

const GENEROUS_LIMITS = { startGzip: 1_000_000, totalGzip: 1_000_000 };

describe('analyzeBundle — синтетика (без сборки)', () => {
  it('лимиты — параметр функции; размер считается в gzip: сжимаемые повторы проходят, случайные байты того же размера — нет', () => {
    const manifest: Manifest = { 'src/main.tsx': { file: 'assets/main.js', isEntry: true } };
    const limits = { startGzip: 5_000, totalGzip: 5_000 };

    const compressible = analyzeBundle(
      manifest,
      files({ 'assets/main.js': 'a'.repeat(10_000) }),
      limits,
    );
    expect(compressible.violations).toHaveLength(0);

    const random = analyzeBundle(
      manifest,
      files({ 'assets/main.js': randomBytes(10_000) }),
      limits,
    );
    expect(random.violations.length).toBeGreaterThan(0);
  });

  it('SheetJS отдельным статическим чанком (src из node_modules/xlsx) в imports входа — нарушение', () => {
    const manifest: Manifest = {
      'src/main.tsx': {
        file: 'assets/main.js',
        isEntry: true,
        imports: ['node_modules/xlsx/xlsx.mjs'],
      },
      'node_modules/xlsx/xlsx.mjs': {
        file: 'assets/xlsx-static.js',
        src: 'node_modules/xlsx/xlsx.mjs',
      },
    };
    const report = analyzeBundle(
      manifest,
      files({ 'assets/main.js': 'console.log(1);', 'assets/xlsx-static.js': 'console.log(2);' }),
      GENEROUS_LIMITS,
    );
    expect(report.violations.length).toBeGreaterThan(0);
  });

  it('тот же src, но в dynamicImports — нарушения нет', () => {
    const manifest: Manifest = {
      'src/main.tsx': {
        file: 'assets/main.js',
        isEntry: true,
        dynamicImports: ['node_modules/xlsx/xlsx.mjs'],
      },
      'node_modules/xlsx/xlsx.mjs': {
        file: 'assets/xlsx-dynamic.js',
        src: 'node_modules/xlsx/xlsx.mjs',
        isDynamicEntry: true,
      },
    };
    const report = analyzeBundle(
      manifest,
      files({ 'assets/main.js': 'console.log(1);', 'assets/xlsx-dynamic.js': 'console.log(2);' }),
      GENEROUS_LIMITS,
    );
    expect(report.violations).toHaveLength(0);
  });

  it('маркер "2013-present SheetJS" внутри файла входа — нарушение (маркер не зависит от tree-shaking, план D2)', () => {
    const manifest: Manifest = { 'src/main.tsx': { file: 'assets/main.js', isEntry: true } };
    const report = analyzeBundle(
      manifest,
      files({ 'assets/main.js': `/*! xlsx.js (C) ${SHEETJS_MARKER} */\nconsole.log(1);` }),
      GENEROUS_LIMITS,
    );
    expect(report.violations.length).toBeGreaterThan(0);
  });

  it('чанк _xlsx-abc.js с name:"xlsx", но без маркера и без src из node_modules — нарушения нет (план D2)', () => {
    const manifest: Manifest = {
      'src/main.tsx': { file: 'assets/main.js', isEntry: true, imports: ['_xlsx-abc.js'] },
      '_xlsx-abc.js': { file: 'assets/_xlsx-abc-hash.js', name: 'xlsx' },
    };
    const report = analyzeBundle(
      manifest,
      files({ 'assets/main.js': 'console.log(1);', 'assets/_xlsx-abc-hash.js': 'console.log(2);' }),
      GENEROUS_LIMITS,
    );
    expect(report.violations).toHaveLength(0);
  });

  it('.woff2 не входит в тотал, но выводится в отчёте (план G3)', () => {
    const manifest: Manifest = {
      'src/main.tsx': { file: 'assets/main.js', isEntry: true, assets: ['assets/font-a.woff2'] },
    };
    const font = randomBytes(50_000); // несжимаемый — упал бы totalGzip, если бы считался
    const report = analyzeBundle(
      manifest,
      files({ 'assets/main.js': 'console.log(1);', 'assets/font-a.woff2': font }),
      { startGzip: 1_000_000, totalGzip: 1_000 },
    );
    expect(report.violations).toHaveLength(0);
    expect(report.files.some((f) => f.file.endsWith('.woff2'))).toBe(true);
    expect(report.fontBytes).toBeGreaterThan(0);
  });

  it('манифест без единой isEntry — нарушение', () => {
    const manifest: Manifest = { 'src/main.tsx': { file: 'assets/main.js' } };
    const report = analyzeBundle(
      manifest,
      files({ 'assets/main.js': 'console.log(1);' }),
      GENEROUS_LIMITS,
    );
    expect(report.violations.length).toBeGreaterThan(0);
  });

  it('манифест ссылается на файл, которого нет среди files — нарушение', () => {
    const manifest: Manifest = { 'src/main.tsx': { file: 'assets/missing.js', isEntry: true } };
    const report = analyzeBundle(manifest, files({}), GENEROUS_LIMITS);
    expect(report.violations.length).toBeGreaterThan(0);
  });

  it('formatReport возвращает непустую строку', () => {
    const manifest: Manifest = { 'src/main.tsx': { file: 'assets/main.js', isEntry: true } };
    const report = analyzeBundle(manifest, files({ 'assets/main.js': 'console.log(1);' }), LIMITS);
    expect(formatReport(report).length).toBeGreaterThan(0);
  });
});

// Ассет манифеста Vite (build.manifest: true, план п.9) — '.vite/manifest.json'.
function findManifest(output: Rollup.RollupOutput['output']): Manifest {
  const asset = output.find(
    (item): item is Rollup.OutputAsset =>
      item.type === 'asset' && item.fileName === '.vite/manifest.json',
  );
  expect(asset).toBeDefined();
  return JSON.parse(String(asset?.source)) as Manifest;
}

function toFileMap(output: Rollup.RollupOutput['output']): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const item of output) {
    if (item.type === 'chunk') {
      map.set(item.fileName, new TextEncoder().encode(item.code));
    } else if (item.fileName !== '.vite/manifest.json') {
      map.set(
        item.fileName,
        typeof item.source === 'string' ? new TextEncoder().encode(item.source) : item.source,
      );
    }
  }
  return map;
}

describe(
  'пробные сборки Vite конфигом репозитория (план DN-04: манифест берётся из vite.config.ts, п.9)',
  { timeout: 120_000 },
  () => {
    it("динамический import('xlsx') из src/excel/write.ts: SheetJS не в стартовом наборе, а вынесен отдельным чанком, а не выкинут", async () => {
      const probe = fileURLToPath(new URL('./probes/xlsx-dynamic.ts', import.meta.url));
      const out = await build({
        root,
        logLevel: 'silent',
        build: { write: false, rollupOptions: { input: { probe } } },
      });
      const bundle = (Array.isArray(out) ? out[0] : out) as Rollup.RollupOutput;
      const manifest = findManifest(bundle.output);
      const report = analyzeBundle(manifest, toFileMap(bundle.output), LIMITS);
      expect(report.violations).toHaveLength(0);

      const xlsxEntry = Object.entries(manifest).find(([key]) =>
        /(^|\/)node_modules\/xlsx\//.test(key),
      );
      expect(xlsxEntry).toBeDefined();
      expect(xlsxEntry?.[1].isDynamicEntry).toBe(true);
      expect(report.totalGzip - report.startGzip).toBeGreaterThan(100_000);
    });

    it('статический import из xlsx: SheetJS в стартовом наборе — нарушение', async () => {
      const probe = fileURLToPath(new URL('./probes/xlsx-static.ts', import.meta.url));
      const out = await build({
        root,
        logLevel: 'silent',
        build: { write: false, rollupOptions: { input: { probe } } },
      });
      const bundle = (Array.isArray(out) ? out[0] : out) as Rollup.RollupOutput;
      const manifest = findManifest(bundle.output);
      const report = analyzeBundle(manifest, toFileMap(bundle.output), LIMITS);
      expect(report.violations.length).toBeGreaterThan(0);
    });
  },
);

describe('scripts/size.ts — CLI (--dist, код выхода)', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function makeDist(mainContent: string): string {
    const d = mkdtempSync(join(tmpdir(), 'dn-size-'));
    mkdirSync(join(d, 'assets'), { recursive: true });
    mkdirSync(join(d, '.vite'), { recursive: true });
    writeFileSync(join(d, 'assets', 'main.js'), mainContent);
    const manifest: Manifest = { 'src/main.tsx': { file: 'assets/main.js', isEntry: true } };
    writeFileSync(join(d, '.vite', 'manifest.json'), JSON.stringify(manifest));
    return d;
  }

  it('чистый набор → код выхода 0', () => {
    dir = makeDist('console.log(1);');
    // Только код выхода: кириллица в выводе на Windows не сравнивается (как в nodeImport.test.ts).
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', 'scripts/size.ts', '--dist', dir],
      { cwd: root },
    );
    expect(result.status).toBe(0);
  });

  it('маркер SheetJS во входе → код выхода 1', () => {
    dir = makeDist(`/*! xlsx.js (C) ${SHEETJS_MARKER} */\nconsole.log(1);`);
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', 'scripts/size.ts', '--dist', dir],
      { cwd: root },
    );
    expect(result.status).toBe(1);
  });

  it('нет dist/.vite/manifest.json → «сначала npm run build», код выхода 1', () => {
    dir = mkdtempSync(join(tmpdir(), 'dn-size-'));
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', 'scripts/size.ts', '--dist', dir],
      { cwd: root },
    );
    expect(result.status).toBe(1);
  });
});
