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
});
