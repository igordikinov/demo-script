// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// «Сверка цветов с §5» (SPEC §5:360, acceptance DN-02 §10.6) — тестом, не
// вручную: парсим src/theme/tokens.css и сверяем значения с §5 и с
// исходниками design/_ds/.../tokens/*.css, из которых токены должны быть
// перенесены «под теми же именами» (SPEC §5:358).
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Нормализация значения перед сравнением. Она нужна из-за prettier: он сам
 * меняет `.04em` → `0.04em`, `rgba(0,0,0,.4)` → `rgba(0, 0, 0, 0.4)`,
 * `#FAF3FF` → `#faf3ff`. Значения в tokens.css пишутся уже в prettier-виде,
 * а источники в design/_ds/ и таблица §5 — как в SPEC/дизайне, поэтому обе
 * стороны сравнения приводятся к одному виду: нижний регистр, без пробелов,
 * двойные кавычки → одинарные, ведущий ноль у дробных чисел.
 */
function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/"/g, "'")
    .replace(/(^|[^\d.])\.(\d)/g, '$10.$2');
}

/** Убрать комментарии /* ... *\/ и собрать объявления `--токен: значение;`. */
function parseTokens(css: string): Map<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const map = new Map<string, string>();
  for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      map.set(name, value);
    }
  }
  return map;
}

function findDesignSystemTokensDir(): string {
  const dsRoot = join(repoRoot, 'design', '_ds');
  const entry = readdirSync(dsRoot, { withFileTypes: true }).find(
    (candidate) => candidate.isDirectory() && candidate.name.startsWith('in-plan-design-system-'),
  );
  if (entry === undefined) {
    throw new Error(`не найден каталог design/_ds/in-plan-design-system-* в ${dsRoot}`);
  }
  return join(dsRoot, entry.name, 'tokens');
}

function readSourceTokens(): Map<string, string> {
  const tokensDir = findDesignSystemTokensDir();
  // fonts.css (Google Fonts) и base.css в tokens.css не переносятся (SPEC
  // §5:358 — шрифт локально; план D2/«Что не делаем»).
  const files = ['colors.css', 'typography.css', 'spacing.css', 'components.css'];
  const combined = new Map<string, string>();
  for (const file of files) {
    const css = readFileSync(join(tokensDir, file), 'utf8');
    for (const [name, value] of parseTokens(css)) {
      combined.set(name, value);
    }
  }
  return combined;
}

function readAppTokens(): string {
  return readFileSync(join(repoRoot, 'src', 'theme', 'tokens.css'), 'utf8');
}

/** §5:360 — используемые значения (сверка с макетом). Хардкод только здесь, в тесте. */
const SPEC_5_VALUES: [token: string, value: string][] = [
  ['--scp-bg-canvas', '#F5F6F8'],
  ['--scp-color-neutral-100', '#EAEAEA'],
  ['--scp-content-primary', '#212529'],
  ['--scp-color-neutral-600', '#77787A'],
  ['--scp-color-neutral-500', '#949598'],
  ['--scp-color-brand-700', '#9000FF'],
  ['--scp-color-brand-800', '#6F00CE'],
  ['--scp-color-brand-50', '#FAF3FF'],
  ['--scp-color-brand-100', '#F4E3FF'],
  ['--scp-color-brand-200', '#EACDFF'],
  ['--scp-system-error-background', '#FFD6DB'],
  ['--scp-color-error-700', '#B81D1D'],
  ['--scp-system-warning-background', '#FCF0D4'],
  ['--scp-color-warning-800', '#9D380F'],
  ['--scp-color-neutral-50', '#F5F6F8'],
  ['--scp-color-neutral-700', '#5A5A5C'],
  ['--scp-radius-button', '4px'],
  ['--scp-radius-modal', '8px'],
  ['--scp-xs-semibold', "600 12px/16px 'open sans'"],
  ['--dn-tracking-caption', '.04em'],
];

/** Алиасы SPEC §4 (упоминаются как --brand-50, --brand-200, --brand-700). */
const ALIASES: [alias: string, target: string][] = [
  ['--brand-50', 'var(--scp-color-brand-50)'],
  ['--brand-200', 'var(--scp-color-brand-200)'],
  ['--brand-700', 'var(--scp-color-brand-700)'],
];

/** Токены приложения — план D2, имена и значения фиксированы. */
const DN_TOKENS: [token: string, value: string][] = [
  ['--dn-tracking-caption', '0.04em'],
  ['--dn-overlay-bg', 'rgba(0, 0, 0, 0.4)'],
  ['--dn-overlay-padding', 'var(--scp-spacing-5xl) var(--scp-spacing-2xl)'],
  ['--dn-modal-width-sm', '480px'],
  ['--dn-modal-width-lg', '720px'],
  ['--dn-z-modal', '40'],
  ['--dn-z-toast', '50'],
  ['--dn-pill-height', '20px'],
  ['--dn-badge-padding', '2px 8px'],
  ['--dn-btn-icon-size', '16px'],
  ['--dn-transition', '200ms'],
  ['--dn-toast-offset', 'var(--scp-spacing-3xl)'],
];

describe('tokens.css', () => {
  it('переносит все объявления colors/typography/spacing/components из design/_ds с тем же значением', () => {
    const source = readSourceTokens();
    const app = parseTokens(readAppTokens());
    const diffs: string[] = [];
    for (const [name, sourceValue] of source) {
      const appValue = app.get(name);
      if (appValue === undefined) {
        diffs.push(`${name}: отсутствует в src/theme/tokens.css`);
        continue;
      }
      if (normalize(appValue) !== normalize(sourceValue)) {
        diffs.push(`${name}: ожидалось "${sourceValue}", получено "${appValue}"`);
      }
    }
    expect(diffs).toEqual([]);
  });

  it.each(SPEC_5_VALUES)('%s соответствует значению §5 (%s)', (token, expected) => {
    const app = parseTokens(readAppTokens());
    const actual = app.get(token);
    expect(actual, `токен ${token} не объявлен в src/theme/tokens.css`).toBeDefined();
    expect(normalize(actual ?? '')).toBe(normalize(expected));
  });

  it.each(ALIASES)('алиас %s указывает на %s', (alias, target) => {
    const app = parseTokens(readAppTokens());
    const actual = app.get(alias);
    expect(actual, `алиас ${alias} не объявлен в src/theme/tokens.css`).toBeDefined();
    expect(normalize(actual ?? '')).toBe(normalize(target));
  });

  it.each(DN_TOKENS)('токен приложения %s равен %s', (token, expected) => {
    const app = parseTokens(readAppTokens());
    const actual = app.get(token);
    expect(actual, `токен ${token} не объявлен в src/theme/tokens.css`).toBeDefined();
    expect(normalize(actual ?? '')).toBe(normalize(expected));
  });

  it('в tokens.css нет ссылок var(--x) на необъявленный токен', () => {
    const app = parseTokens(readAppTokens());
    const declared = new Set(app.keys());
    const referenced = [...readAppTokens().matchAll(/var\(\s*(--[\w-]+)/g)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);
    const missing = referenced.filter((name) => !declared.has(name));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('ни один var(--x) в src/**/*.css не ссылается на токен, не объявленный в tokens.css', () => {
    const app = parseTokens(readAppTokens());
    const declared = new Set(app.keys());
    const srcDir = join(repoRoot, 'src');
    const entries = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }) as string[];
    const cssFiles = entries
      .map((entry) => entry.split('\\').join('/'))
      .filter((entry) => entry.endsWith('.css') && entry !== 'theme/tokens.css');

    const missing: string[] = [];
    for (const relativePath of cssFiles) {
      const css = readFileSync(join(srcDir, relativePath), 'utf8');
      for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
        const name = match[1];
        if (name !== undefined && !declared.has(name)) {
          missing.push(`${relativePath}: var(${name})`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  describe('цвета пилюль Badge (SPEC §4.8:335, §5:360)', () => {
    function badgeToneBlock(css: string, tone: string): string {
      const pattern = new RegExp(`\\[data-tone=['"]${tone}['"]\\][^{]*\\{([^}]*)\\}`);
      const match = pattern.exec(css);
      if (match === null) {
        throw new Error(`в Badge.module.css нет правила для data-tone="${tone}"`);
      }
      const block = match[1];
      if (block === undefined) {
        throw new Error(`пустой блок для data-tone="${tone}"`);
      }
      return block;
    }

    function badgeCss(): string {
      return readFileSync(join(repoRoot, 'src', 'components', 'ui', 'Badge.module.css'), 'utf8');
    }

    it.each([
      ['danger', ['--scp-system-error-background', '--scp-color-error-700']],
      ['warning', ['--scp-system-warning-background', '--scp-color-warning-800']],
      ['info', ['--scp-color-neutral-50', '--scp-color-neutral-700']],
      ['module', ['--scp-color-brand-100', '--scp-color-brand-800']],
    ] as const)('тон %s использует %s', (tone, expectedVars) => {
      const block = badgeToneBlock(badgeCss(), tone);
      for (const variable of expectedVars) {
        expect(block).toContain(`var(${variable})`);
      }
    });
  });
});
