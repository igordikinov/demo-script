// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';

// base: './' обязателен — бандл должен работать из подкаталога GitHub Pages
// и внутри iframe (CLAUDE.md, SPEC §1). Проверяем это по реальной сборке,
// а не по значению из конфига, чтобы поймать регресс в плагинах/опциях.
const root = fileURLToPath(new URL('..', import.meta.url));

describe('build', () => {
  it('uses relative base', { timeout: 60_000 }, async () => {
    const out = await build({ root, logLevel: 'silent', build: { write: false } });
    const outputs = (Array.isArray(out) ? out : [out]) as Rollup.RollupOutput[];
    const html = outputs
      .flatMap((o) => o.output)
      .find((c): c is Rollup.OutputAsset => c.type === 'asset' && c.fileName === 'index.html');
    expect(html).toBeDefined();
    const source = String(html?.source);
    expect(source).toMatch(/src="\.\/assets\/[^"]+\.js"/);
    expect(source).not.toMatch(/(?:src|href)="\/(?!\/)/);
  });
});
