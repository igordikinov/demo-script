// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';

// Правило hex должно ловить цвет в *.tsx и *.ts (кроме src/theme/**),
// но не задевать служебные строки вида '#root' или число '1.10'.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

async function lint(code: string, filePath: string): Promise<Linter.LintMessage[]> {
  // Файл может не существовать на диске — ESLint линтит переданный текст,
  // путь нужен только для выбора конфигурации по glob.
  const [result] = await eslint.lintText(code, { filePath });
  if (!result) throw new Error('no result');
  return result.messages;
}

function ids(messages: Linter.LintMessage[]): (string | null)[] {
  return messages.map((m) => m.ruleId);
}

describe('eslint rules', { timeout: 30_000 }, () => {
  it.each([
    ['src/components/Probe.tsx', "export const P = () => <div style={{ color: '#9000FF' }} />;\n"],
    ['src/components/Probe.tsx', 'export const P = () => <svg fill="#fff" />;\n'],
    ['src/x.ts', "export const b = '1px solid #EAEAEA';\n"],
    ['src/x.ts', 'const a = 1;\nexport const s = `0 ${a}px 2px #0000001A`;\n'],
  ])('hex error %s %s', async (filePath, code) => {
    const m = await lint(code, filePath);
    expect(ids(m)).toContain('no-restricted-syntax');
    // ruleId === null означает ошибку парсинга — она не должна маскировать проверку.
    expect(ids(m)).not.toContain(null);
  });

  it.each([
    ['src/theme/palette.ts', "export const c = '#9000FF';\n"],
    ['tests/probe.test.tsx', "export const c = '#9000FF';\n"],
    ['src/x.ts', "export const r = '#root';\nexport const v = '1.10';\n"],
  ])('no hex error %s', async (filePath, code) => {
    const m = await lint(code, filePath);
    expect(ids(m)).not.toContain('no-restricted-syntax');
    expect(ids(m)).not.toContain(null);
  });

  it('any', async () => {
    expect(ids(await lint('export function f(v: any) { return v; }\n', 'src/x.ts'))).toContain(
      '@typescript-eslint/no-explicit-any',
    );
  });
  it('process', async () => {
    expect(ids(await lint('export const e = process.env.X;\n', 'src/x.ts'))).toContain(
      'no-restricted-globals',
    );
  });
  it('node:*', async () => {
    expect(
      ids(
        await lint(
          "import { readFileSync } from 'node:fs';\nexport const r = readFileSync;\n",
          'src/x.ts',
        ),
      ),
    ).toContain('no-restricted-imports');
  });
  it('ignored', async () => {
    // design/ и .beads/ — служебные каталоги, ESLint не должен их трогать.
    expect(await eslint.isPathIgnored('design/support.js')).toBe(true);
    expect(await eslint.isPathIgnored('.beads/x.js')).toBe(true);
  });

  // SPEC §1:20, CLAUDE.md:33 — SheetJS только через import('xlsx') в
  // src/excel/xlsx.ts (план DN-04, D1): без исключения из правила для этого
  // файла, иначе статический импорт значения протащил бы SheetJS в чанк
  // любого, кто импортирует loadXlsx.
  it.each([
    ['src/x.ts', "import * as XLSX from 'xlsx';\nexport const u = XLSX.utils;\n"],
    ['src/x.ts', "import { utils } from 'xlsx';\nexport const u = utils;\n"],
    ['src/x.ts', "export * from 'xlsx';\n"],
    ['src/x.ts', "import { read } from 'xlsx/xlsx.mjs';\nexport const r = read;\n"],
    // Тот же файл, что содержит loadXlsx, — исключения нет (D1).
    ['src/excel/xlsx.ts', "import { read } from 'xlsx';\nexport const r = read;\n"],
  ])('xlsx статический импорт значения — ошибка %s', async (filePath, code) => {
    const m = await lint(code, filePath);
    expect(ids(m)).toContain('@typescript-eslint/no-restricted-imports');
    expect(ids(m)).not.toContain(null);
  });

  it.each([
    ['src/excel/xlsx.ts', "import type { WorkBook } from 'xlsx';\nexport type X2 = WorkBook;\n"],
    ['src/excel/xlsx.ts', "export async function f() { return import('xlsx'); }\n"],
    ['src/excel/xlsx.ts', "export type X = typeof import('xlsx');\n"],
    ['tests/probe.test.ts', "import { read } from 'xlsx';\nexport const r = read;\n"],
  ])('xlsx без ошибки: типы, динамический импорт, tests/** %s', async (filePath, code) => {
    const m = await lint(code, filePath);
    expect(ids(m)).not.toContain('@typescript-eslint/no-restricted-imports');
    expect(ids(m)).not.toContain(null);
  });
});
