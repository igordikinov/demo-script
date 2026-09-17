// @vitest-environment node
// SPEC §1:20, CLAUDE.md:33: SheetJS грузится только динамическим импортом
// (await import('xlsx')) при первом обращении — не должен попасть в
// стартовый бандл. loadXlsx (src/excel/xlsx.ts, план DN-04) — единственная
// точка входа: проверяем API, мемоизацию промиса и то, что статический
// import('xlsx' — по тексту, не типами) больше нигде в src/** не встречается.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadXlsx } from '../src/excel/xlsx';

const srcDir = fileURLToPath(new URL('../src', import.meta.url));

describe('loadXlsx', () => {
  it('отдаёт модуль, где read/write/utils.book_new — функции', async () => {
    const mod = await loadXlsx();
    expect(typeof mod.read).toBe('function');
    expect(typeof mod.write).toBe('function');
    expect(typeof mod.utils.book_new).toBe('function');
  });

  it('второй вызов возвращает тот же промис — модуль не грузится повторно', () => {
    const first = loadXlsx();
    const second = loadXlsx();
    expect(second).toBe(first);
  });

  it('после отклонённого импорта следующий вызов пробует снова (план D5: сброс memo при ошибке)', async () => {
    let attempt = 0;
    vi.resetModules();
    vi.doMock('xlsx', () => {
      attempt += 1;
      if (attempt === 1) throw new Error('cdn недоступен');
      return {
        read: () => undefined,
        write: () => undefined,
        utils: { book_new: () => undefined },
      };
    });
    const fresh = await import('../src/excel/xlsx');
    await expect(fresh.loadXlsx()).rejects.toThrow();
    const mod = await fresh.loadXlsx();
    expect(typeof mod.read).toBe('function');
    vi.doUnmock('xlsx');
  });

  it("import('xlsx' встречается только в src/excel/xlsx.ts — статического импорта значения больше нигде в src/** нет", () => {
    const entries = readdirSync(srcDir, { recursive: true, withFileTypes: true });
    const tsFiles = entries
      .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
      .map((entry) => join(entry.parentPath, entry.name).replace(/\\/g, '/'));

    const withDynamicImport = tsFiles.filter((abs) => {
      const text = readFileSync(abs, 'utf8');
      return text.includes("import('xlsx");
    });

    const relative = withDynamicImport.map((abs) =>
      abs.slice(srcDir.replace(/\\/g, '/').length + 1),
    );
    expect(relative).toEqual(['excel/xlsx.ts']);
  });
});
