// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// «Хардкод hex в *.tsx запрещён правилом ESLint» (SPEC §5:358) относится к
// коду; сам ESLint игнорирует *.css (eslintRules.test.ts проверяет только
// *.ts/*.tsx). Цвета в модульных CSS не пойманы линтером — этот тест
// закрывает ту же дыру для src/**/*.css: значения должны идти только через
// var(--...) из tokens.css, а сам tokens.css — единственное место с hex.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(repoRoot, 'src');

// Тот же регэксп, что и в eslint.config.js (HEX): hex-цвет как подстрока,
// без ложных срабатываний на '#root' и HTML-сущности вида '&#123'.
const HEX = /(?:^|[^&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/;
const RGB_OR_HSL = /\b(rgba?|hsla?)\(/i;

function listSrcFiles(): string[] {
  return (readdirSync(srcDir, { recursive: true, encoding: 'utf8' }) as string[]).map((entry) =>
    entry.split('\\').join('/'),
  );
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('src/**/*.css — цвета только через токены', () => {
  const allFiles = listSrcFiles();
  const cssFiles = allFiles.filter(
    (entry) => entry.endsWith('.css') && entry !== 'theme/tokens.css',
  );

  it('список файлов не пуст и включает ожидаемые CSS-модули DN-02', () => {
    // Проверка на пустой список: если src/ ещё не создан или файлы лежат не
    // там, тест ниже не должен молча проходить по пустому массиву.
    expect(cssFiles.length).toBeGreaterThan(0);
    expect(cssFiles).toEqual(
      expect.arrayContaining([
        'theme/global.css',
        'theme/fonts.css',
        'components/ui/Button.module.css',
        'components/ui/Badge.module.css',
        'components/ui/Modal.module.css',
        'components/ui/Toast.module.css',
      ]),
    );
  });

  it.each(cssFiles)('%s не содержит hex-цвета и rgb()/rgba()/hsl()/hsla()', (relativePath) => {
    const css = stripComments(readFileSync(join(srcDir, relativePath), 'utf8'));
    expect(HEX.test(css)).toBe(false);
    expect(RGB_OR_HSL.test(css)).toBe(false);
  });

  describe('theme/fonts.css (SPEC §5:358 — шрифт локально, без Google Fonts)', () => {
    function fontsCss(): string {
      return readFileSync(join(srcDir, 'theme', 'fonts.css'), 'utf8');
    }

    it('не обращается в сеть за шрифтом', () => {
      const css = fontsCss();
      expect(css).not.toMatch(/http/i);
      expect(css).not.toMatch(/googleapis/i);
      expect(css).not.toMatch(/@import/i);
    });

    it('содержит ровно 9 @font-face с font-display: swap (400/600/700 × 3 подсета)', () => {
      const css = fontsCss();
      const faces = css.match(/@font-face/g) ?? [];
      const swaps = css.match(/font-display:\s*swap/g) ?? [];
      expect(faces).toHaveLength(9);
      expect(swaps).toHaveLength(9);
    });

    it.each(
      ['latin', 'cyrillic', 'cyrillic-ext'].flatMap((subset) =>
        [400, 600, 700].map((weight) => `open-sans-${subset}-${weight}-normal.woff2`),
      ),
    )('ссылается на файл %s', (fileName) => {
      expect(fontsCss()).toContain(fileName);
    });

    it('каждый url(...) в fonts.css указывает на существующий на диске файл', () => {
      const css = fontsCss();
      const fontsDir = join(srcDir, 'theme');
      const urls = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)]
        .map((match) => match[1])
        .filter((value): value is string => value !== undefined);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        const resolved = resolve(fontsDir, url);
        expect(existsSync(resolved), `не найден файл шрифта: ${url} (${resolved})`).toBe(true);
      }
    });
  });
});

describe('src/main.tsx — порядок импорта тем', () => {
  it('fonts.css, tokens.css, global.css идут в этом порядке и раньше App', () => {
    const mainPath = join(srcDir, 'main.tsx');
    const source = readFileSync(mainPath, 'utf8');
    // Именованные переменные вместо индексации массива — с
    // noUncheckedIndexedAccess доступ по индексу давал бы number | undefined
    // без надобности: порядок и число импортов фиксированы планом D5.
    const fontsIndex = source.indexOf('./theme/fonts.css');
    const tokensIndex = source.indexOf('./theme/tokens.css');
    const globalIndex = source.indexOf('./theme/global.css');
    const appIndex = source.indexOf('./App');

    expect(fontsIndex, 'в main.tsx нет импорта "./theme/fonts.css"').toBeGreaterThanOrEqual(0);
    expect(tokensIndex, 'в main.tsx нет импорта "./theme/tokens.css"').toBeGreaterThanOrEqual(0);
    expect(globalIndex, 'в main.tsx нет импорта "./theme/global.css"').toBeGreaterThanOrEqual(0);
    expect(appIndex, 'в main.tsx нет импорта "./App"').toBeGreaterThanOrEqual(0);

    expect(fontsIndex).toBeLessThan(tokensIndex);
    expect(tokensIndex).toBeLessThan(globalIndex);
    expect(globalIndex).toBeLessThan(appIndex);
  });
});
