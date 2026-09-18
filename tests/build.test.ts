// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { analyzeBundle, LIMITS } from '../scripts/size';

// base: './' обязателен — бандл должен работать из подкаталога GitHub Pages
// и внутри iframe (CLAUDE.md, SPEC §1). Проверяем это по реальной сборке,
// а не по значению из конфига, чтобы поймать регресс в плагинах/опциях.
const root = fileURLToPath(new URL('..', import.meta.url));

type OutputItem = Rollup.OutputAsset | Rollup.OutputChunk;

// Сборка запускается один раз на файл (план T7): она нужна и старой
// проверке base, и новым проверкам шрифта — не гонять vite build дважды.
let outputs: OutputItem[] = [];

describe('build', () => {
  beforeAll(async () => {
    // vitest выставляет process.env.NODE_ENV = 'test' в своём воркере ещё до
    // этого файла. Vite 6 при программной сборке смотрит на NODE_ENV, а не
    // на mode (см. dep-*.js: replaceDefine/isProduction) — без переопределения
    // build() здесь собрал бы dev-версии react/react-dom и jsxDEV от
    // plugin-react вместо той сборки, что делает `npm run build`. Значения
    // возвращают afterAll — это должно совпасть с реальным `npm run build`
    // ради проверки лимита SPEC §8:427 ниже.
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const out = await build({ root, logLevel: 'silent', build: { write: false } });
      const bundles = (Array.isArray(out) ? out : [out]) as Rollup.RollupOutput[];
      outputs = bundles.flatMap((bundle) => bundle.output);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 60_000);

  it('uses relative base', () => {
    const html = outputs.find(
      (item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName === 'index.html',
    );
    expect(html).toBeDefined();
    const source = String(html?.source);
    expect(source).toMatch(/src="\.\/assets\/[^"]+\.js"/);
    expect(source).not.toMatch(/(?:src|href)="\/(?!\/)/);
  });

  it('шрифт Open Sans зашит в бандл: ровно 9 .woff2 в assets (SPEC §5:358)', () => {
    const fonts = outputs.filter(
      (item): item is Rollup.OutputAsset =>
        item.type === 'asset' && /^assets\/open-sans-.*\.woff2$/.test(item.fileName),
    );
    expect(fonts).toHaveLength(9);
  });

  it('CSS-бандл не ссылается на Google Fonts и не использует абсолютные url()', () => {
    const cssAssets = outputs.filter(
      (item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'),
    );
    // Пустой список означал бы, что тест ничего не проверил — DN-02 точно
    // добавляет CSS (tokens/global/fonts + модули компонентов).
    expect(cssAssets.length).toBeGreaterThan(0);

    for (const asset of cssAssets) {
      const source = String(asset.source);
      expect(source).not.toMatch(/googleapis/i);
      // Абсолютный путь ("/assets/...") сломался бы под base: './' в
      // подкаталоге GitHub Pages и внутри iframe — как и в index.html выше.
      expect(source).not.toMatch(/url\(\s*['"]?\/(?!\/)/);
    }

    const allCss = cssAssets.map((asset) => String(asset.source)).join('\n');
    expect(allCss).toMatch(/\.woff2/);
  });

  // SPEC §8:427: скрипт scripts/size.ts находит стартовый чанк по манифесту
  // Vite — build.manifest: true (план DN-04, п.9). Переиспользуем сборку из
  // beforeAll вместо повторного vite build (комментарий выше).
  it('в выходах сборки есть .vite/manifest.json (для scripts/size.ts)', () => {
    const manifest = outputs.find(
      (item): item is Rollup.OutputAsset =>
        item.type === 'asset' && item.fileName === '.vite/manifest.json',
    );
    expect(manifest).toBeDefined();
  });

  it('analyzeBundle по реальному приложению: нарушений нет, стартовый набор ≤ 120 KB gzip (SPEC §8:427)', () => {
    const manifestAsset = outputs.find(
      (item): item is Rollup.OutputAsset =>
        item.type === 'asset' && item.fileName === '.vite/manifest.json',
    );
    const manifest = JSON.parse(String(manifestAsset?.source)) as unknown;

    const fileMap = new Map<string, Uint8Array>();
    for (const item of outputs) {
      if (item.type === 'chunk') {
        fileMap.set(item.fileName, new TextEncoder().encode(item.code));
      } else if (item.fileName !== '.vite/manifest.json') {
        fileMap.set(
          item.fileName,
          typeof item.source === 'string' ? new TextEncoder().encode(item.source) : item.source,
        );
      }
    }

    const report = analyzeBundle(manifest, fileMap, LIMITS);
    expect(report.violations).toEqual([]);
    expect(report.startGzip).toBeGreaterThan(0);
    expect(report.startGzip).toBeLessThanOrEqual(120_000);
  });
});
