// SPEC §4.8:337 («Файл не .xlsx по расширению → E01 без попытки чтения»),
// §1:20 (SheetJS — только через loadXlsx). Контракт readImportFile/isXlsxFileName
// (src/components/ImportModal/importFile.ts) — обёртка над readWorkbook
// (src/excel/read.ts), которая отсекает не-.xlsx файлы и читает байты через
// FileReader: у File в jsdom нет arrayBuffer().
//
// import.meta.url сохраняется в переменную до new URL() — иначе Vite в
// jsdom-окружении подставляет вместо файлового URL адрес self.location
// (см. комментарий tests/StepCard.test.tsx:28-36); этот файл выполняется
// в окружении jsdom (без директивы окружения node), т.к. использует
// File/FileReader.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isXlsxFileName, readImportFile } from '../src/components/ImportModal/importFile';
import { ru } from '../src/i18n/ru';
import { PmSnapshotSchema, type PmSnapshots } from '../src/pm/snapshot';

const importMetaUrl = import.meta.url;

/** Настоящие снимки карт (как в tests/read.test.ts) — этот файл не проверяет W04/I03. */
const SNAPSHOTS: PmSnapshots = {
  snp: PmSnapshotSchema.parse(
    JSON.parse(
      readFileSync(fileURLToPath(new URL('../src/data/pm/snp.json', importMetaUrl)), 'utf8'),
    ),
  ),
  mrp: PmSnapshotSchema.parse(
    JSON.parse(
      readFileSync(fileURLToPath(new URL('../src/data/pm/mrp.json', importMetaUrl)), 'utf8'),
    ),
  ),
};

/** Сводка нулей (E01/несобранный файл) — как ZERO_SUMMARY в src/excel/read.ts, но
 * он не экспортирован: readImportFile отдаёт свою локальную копию. */
const ZERO_SUMMARY = { sheets: 0, blocks: 0, steps: 0, withLink: 0, withNode: 0 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isXlsxFileName (SPEC §4.8:337 — расширение без учёта регистра)', () => {
  it.each([
    ['book.xlsx', true],
    ['BOOK.XLSX', true],
    ['book.xls', false],
    ['book.xlsx.bak', false],
    ['book.csv', false],
    ['book', false],
  ])('%s → %s', (name, expected) => {
    expect(isXlsxFileName(name)).toBe(expected);
  });
});

describe('readImportFile', () => {
  it('.xls → отчёт из одной строки E01, FileReader не читает файл (SPEC §4.8:337)', async () => {
    const readAsArrayBuffer = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
    const file = new File(['x'], 'old.xls');

    const result = await readImportFile(file, SNAPSHOTS);

    expect(result).toEqual({
      report: [
        { level: 'danger', code: 'E01', sheet: '', row: null, message: ru.report.codes.E01() },
      ],
      summary: ZERO_SUMMARY,
    });
    expect(readAsArrayBuffer).not.toHaveBeenCalled();
  });

  it('deployment-demo.xlsx → сценарий и сводка фикстуры (SPEC §8:397: 3/3/29/24/26)', async () => {
    const bytes = readFileSync(
      fileURLToPath(new URL('./fixtures/deployment-demo.xlsx', importMetaUrl)),
    );
    const file = new File([bytes], 'deployment-demo.xlsx');

    const result = await readImportFile(file, SNAPSHOTS);

    expect(result.scenario?.title).toBe('Deployment — демо-сценарий');
    expect(result.summary).toEqual({
      sheets: 3,
      blocks: 3,
      steps: 29,
      withLink: 24,
      withNode: 26,
    });
  });

  it('.xlsx с содержимым, которое не является книгой Excel → E01, сводка из нулей', async () => {
    const file = new File(['hello'], 'x.xlsx');

    const result = await readImportFile(file, SNAPSHOTS);

    expect(result.report).toEqual([
      { level: 'danger', code: 'E01', sheet: '', row: null, message: ru.report.codes.E01() },
    ]);
    expect(result.summary).toEqual(ZERO_SUMMARY);
  });
});
