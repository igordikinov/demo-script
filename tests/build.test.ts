// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';

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
    const out = await build({ root, logLevel: 'silent', build: { write: false } });
    const bundles = (Array.isArray(out) ? out : [out]) as Rollup.RollupOutput[];
    outputs = bundles.flatMap((bundle) => bundle.output);
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
});
