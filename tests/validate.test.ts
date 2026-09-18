// @vitest-environment node
// SPEC §3.5 (:171-197): проверки по шагам E04-E07, W01, W02, W04, I03 и сортировка
// отчёта. Приёмка DN-06 — ТК 2, 3, 4 и часть ТК 8 (SPEC §8:398-404, дословно).
// Книги собираются writeWorkbook — та же SheetJS, что читает readWorkbook,
// поэтому байты настоящие, а не подделанные вручную (как в tests/read.test.ts).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from '../src/excel/read';
import { writeWorkbook, type SheetSpec } from '../src/excel/write';
import { reportRow, sortReport, type ReportRow } from '../src/excel/validate';
import { ru } from '../src/i18n/ru';
import { PmSnapshotSchema, type PmSnapshot, type PmSnapshots } from '../src/pm/snapshot';

/** Настоящий снимок карты (как в tests/pmData.test.ts:12-17) — для ТК 8. */
function loadSnapshot(map: 'snp' | 'mrp'): PmSnapshot {
  const path = fileURLToPath(new URL(`../src/data/pm/${map}.json`, import.meta.url));
  return PmSnapshotSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** SNP: узел `urovni-sz`, снимок 17.09.2026 (src/data/pm/snp.json:104,108). */
const SNAPSHOTS: PmSnapshots = { snp: loadSnapshot('snp'), mrp: loadSnapshot('mrp') };

/** Синтетический снимок без зависимости от настоящих карт — для теста «карта mrp». */
function snap(map: 'snp' | 'mrp', snapshotAt: string, ids: readonly string[]): PmSnapshot {
  return {
    map,
    title: map,
    sourceUpdatedAt: '2026-09-01',
    snapshotAt,
    stages: [{ number: 1, title: 'Этап' }],
    nodes: Object.fromEntries(ids.map((id) => [id, 1])),
  };
}

/** SYN.snp узнаёт только «only-snp», SYN.mrp — только «only-mrp» (разные даты снимков). */
const SYN: PmSnapshots = {
  snp: snap('snp', '2026-09-17', ['only-snp']),
  mrp: snap('mrp', '2026-08-05', ['only-mrp']),
};

/** Заголовки без «Узел карты»: № шага, Шаг, Ссылка. */
const HL = ['№ шага', 'Шаг', 'Ссылка'];
/** Валидная ссылка на экран — там, где url не по теме теста. */
const L = 'https://a';

/** Собирает книгу writeWorkbook и читает её readWorkbook с переданными снимками. */
async function read(sheets: SheetSpec[], snaps: PmSnapshots = SNAPSHOTS) {
  const bytes = await writeWorkbook(sheets);
  return readWorkbook(bytes.slice().buffer, 'demo.xlsx', snaps);
}

/** Строки отчёта без уровня info — короче сверять danger/warning (как в read.test.ts). */
function withoutInfo(report: readonly ReportRow[]): ReportRow[] {
  return report.filter((r) => r.level !== 'info');
}

describe('ТК 2 (SPEC §8:398): ячейка «№ шага» числом 1.1 при соседней текстовой 1.1 → W03 и E06', () => {
  it('дубликат id после форматирования числа даёт E06 на повторе, W03 — на числовой ячейке', async () => {
    const result = await read([{ name: 'S', rows: [HL, ['1.1', 'A', L], [1.1, 'B', L]] }]);
    // E06 (danger) сортируется раньше W03 (warning) — SPEC §3.5:195.
    expect(withoutInfo(result.report)).toEqual([
      {
        level: 'danger',
        code: 'E06',
        sheet: 'S',
        row: 3,
        message: ru.report.codes.E06('1.1', 'S', 2),
      },
      { level: 'warning', code: 'W03', sheet: 'S', row: 3, message: ru.report.codes.W03() },
    ]);
  });
});

describe('E06 (SPEC §3.5:182): третье вхождение id тоже указывает на первое', () => {
  it('id "1" трижды → E06 на строках 3 и 4, сообщение обеих — про строку 2', async () => {
    const result = await read([
      { name: 'S', rows: [HL, ['1', 'A', L], ['1', 'B', L], ['1', 'C', L]] },
    ]);
    expect(withoutInfo(result.report)).toEqual([
      {
        level: 'danger',
        code: 'E06',
        sheet: 'S',
        row: 3,
        message: ru.report.codes.E06('1', 'S', 2),
      },
      {
        level: 'danger',
        code: 'E06',
        sheet: 'S',
        row: 4,
        message: ru.report.codes.E06('1', 'S', 2),
      },
    ]);
  });
});

describe('E06 (SPEC §3.5:182): id повторяется в файле, а не только на одном листе', () => {
  it('дубликат на втором листе указывает на первое вхождение на первом листе', async () => {
    const result = await read([
      { name: 'Блок 1', rows: [HL, ['1.1', 'A', L]] },
      { name: 'Блок 2', rows: [HL, ['1.1', 'B', L]] },
    ]);
    expect(withoutInfo(result.report)).toEqual([
      {
        level: 'danger',
        code: 'E06',
        sheet: 'Блок 2',
        row: 2,
        message: ru.report.codes.E06('1.1', 'Блок 1', 2),
      },
    ]);
  });
});

describe('E06 (SPEC §3.5:182): сравнение id после trim', () => {
  it('" 1.1 " считается тем же id, что "1.1"', async () => {
    const result = await read([{ name: 'S', rows: [HL, ['1.1', 'A', L], [' 1.1 ', 'B', L]] }]);
    expect(withoutInfo(result.report)).toEqual([
      {
        level: 'danger',
        code: 'E06',
        sheet: 'S',
        row: 3,
        message: ru.report.codes.E06('1.1', 'S', 2),
      },
    ]);
  });
});

describe('E06/E05 (план DN-06): пустой id не участвует в E06 — для него уже есть E05', () => {
  it('две строки с пустым id → две строки E05, ни одной E06', async () => {
    const result = await read([{ name: 'S', rows: [HL, ['', 'A', L], ['', 'B', L]] }]);
    expect(withoutInfo(result.report)).toEqual([
      { level: 'danger', code: 'E05', sheet: 'S', row: 2, message: ru.report.codes.E05() },
      { level: 'danger', code: 'E05', sheet: 'S', row: 3, message: ru.report.codes.E05() },
    ]);
  });
});

describe('ТК 3 (SPEC §8:399): пустой «Шаг» в непустой строке → E04, scenario не возвращается', () => {
  it('строка с заполненным «Действие», но пустым «Шаг» → только E04, без scenario', async () => {
    const result = await read([
      {
        name: 'S',
        rows: [
          ['№ шага', 'Шаг', 'Действие', 'Ссылка'],
          ['1', '', 'act', L],
        ],
      },
    ]);
    expect(withoutInfo(result.report)).toEqual([
      { level: 'danger', code: 'E04', sheet: 'S', row: 2, message: ru.report.codes.E04() },
    ]);
    expect(result).not.toHaveProperty('scenario');
  });
});

describe('E05 (SPEC §3.5:181): пустой «№ шага» в непустой строке', () => {
  it('строка с непустым «Шаг», но пустым «№ шага» → E05', async () => {
    const result = await read([{ name: 'S', rows: [HL, ['', 'x', L]] }]);
    expect(withoutInfo(result.report)).toEqual([
      { level: 'danger', code: 'E05', sheet: 'S', row: 2, message: ru.report.codes.E05() },
    ]);
  });
});

describe('E04+E05 (validateSteps в src/excel/validate.ts): проверки одной строки независимы', () => {
  it('пустые «Шаг» и «№ шага» в одной строке → обе строки отчёта, E04 раньше E05', async () => {
    const result = await read([
      {
        name: 'S',
        rows: [
          ['№ шага', 'Шаг', 'Действие', 'Ссылка'],
          ['', '', 'act', L],
        ],
      },
    ]);
    expect(withoutInfo(result.report)).toEqual([
      { level: 'danger', code: 'E04', sheet: 'S', row: 2, message: ru.report.codes.E04() },
      { level: 'danger', code: 'E05', sheet: 'S', row: 2, message: ru.report.codes.E05() },
    ]);
  });
});

describe('ТК 4 (SPEC §8:400): http:// → W01; ftp://x и «экран» → E07; пустая ссылка → W02', () => {
  it('пять строк с разными ссылками дают ожидаемые коды в порядке сортировки', async () => {
    const result = await read([
      {
        name: 'S',
        rows: [
          HL,
          ['1', 'a', 'http://x'],
          ['2', 'b', 'ftp://x'],
          ['3', 'c', 'экран'],
          ['4', 'd', ''],
          ['5', 'e', 'https://ok'],
        ],
      },
    ]);
    // https://ok (строка 6) — валидный экран без http://, кода не даёт.
    expect(withoutInfo(result.report)).toEqual([
      {
        level: 'danger',
        code: 'E07',
        sheet: 'S',
        row: 3,
        message: ru.report.codes.E07('ftp://x'),
      },
      {
        level: 'danger',
        code: 'E07',
        sheet: 'S',
        row: 4,
        message: ru.report.codes.E07('экран'),
      },
      { level: 'warning', code: 'W01', sheet: 'S', row: 2, message: ru.report.codes.W01() },
      { level: 'warning', code: 'W02', sheet: 'S', row: 5, message: ru.report.codes.W02() },
    ]);
  });
});

describe('W01/W02 (SPEC §3.5:173): warning не блокируют загрузку', () => {
  it('http:// и пустая ссылка — только warning, сценарий собирается', async () => {
    const result = await read([{ name: 'S', rows: [HL, ['1', 'a', 'http://x'], ['2', 'b', '']] }]);
    expect(withoutInfo(result.report)).toEqual([
      { level: 'warning', code: 'W01', sheet: 'S', row: 2, message: ru.report.codes.W01() },
      { level: 'warning', code: 'W02', sheet: 'S', row: 3, message: ru.report.codes.W02() },
    ]);
    expect(result.scenario?.blocks[0]?.steps.map((s) => s.url)).toEqual(['http://x', '']);
  });
});

describe('E07 (SPEC §3.3:138, §3.5:183): условие проверяет цель гиперссылки, а не видимый текст', () => {
  it('ячейка-гиперссылка с текстом «Открыть» и целью ftp://y → E07 по ftp://y', async () => {
    const result = await read([
      { name: 'S', rows: [HL, ['1', 'a', { text: 'Открыть', link: 'ftp://y' }]] },
    ]);
    expect(withoutInfo(result.report)).toEqual([
      {
        level: 'danger',
        code: 'E07',
        sheet: 'S',
        row: 2,
        message: ru.report.codes.E07('ftp://y'),
      },
    ]);
  });
});

describe('ТК 8 (SPEC §8:404, часть про validate): узел, которого нет в снимке, → W04', () => {
  const rows: SheetSpec['rows'] = [
    [...HL, 'Узел карты'],
    ['1', 'a', L, 'urovni-sz'],
    ['2', 'b', L, 'net-takogo'],
    ['3', 'c', L, 'constructor'],
    ['4', 'd', L, ''],
  ];

  it('urovni-sz есть на карте SNP, net-takogo и constructor — нет, пустой узел не проверяется', async () => {
    const result = await read([{ name: 'S', rows }]);
    // constructor — это не узел карты, а свойство прототипа Object.prototype:
    // проверка обязана использовать Object.hasOwn (src/excel/validate.ts:130,
    // как и src/pm/snapshot.ts:101), а не `in`.
    expect(withoutInfo(result.report)).toEqual([
      {
        level: 'warning',
        code: 'W04',
        sheet: 'S',
        row: 3,
        message: ru.report.codes.W04('net-takogo', 'SNP', '17.09.2026'),
      },
      {
        level: 'warning',
        code: 'W04',
        sheet: 'S',
        row: 4,
        message: ru.report.codes.W04('constructor', 'SNP', '17.09.2026'),
      },
    ]);
  });

  it('I03 — ровно одна строка на всю книгу, с картой и датой снимка (SPEC §3.5:191)', async () => {
    const result = await read([{ name: 'S', rows }]);
    expect(result.report.filter((r) => r.code === 'I03')).toEqual([
      {
        level: 'info',
        code: 'I03',
        sheet: '',
        row: null,
        message: ru.report.codes.I03('SNP', '17.09.2026'),
      },
    ]);
  });
});

describe('W04/I03 (SPEC §3.5:193): карта mrp берёт снимок MRP, а не SNP', () => {
  const rowsWithNode: SheetSpec['rows'] = [
    [...HL, 'Узел карты'],
    ['1', 'a', L, 'only-mrp'],
    ['2', 'b', L, 'only-snp'],
  ];

  it('_Сценарий задаёт «Карта: MRP» → узел only-snp не найден на MRP, дата — снимка MRP', async () => {
    const result = await read(
      [
        { name: '_Сценарий', rows: [['Карта', 'MRP']] },
        { name: 'S', rows: rowsWithNode },
      ],
      SYN,
    );
    expect(withoutInfo(result.report)).toEqual([
      {
        level: 'warning',
        code: 'W04',
        sheet: 'S',
        row: 3,
        message: ru.report.codes.W04('only-snp', 'MRP', '05.08.2026'),
      },
    ]);
    expect(result.report.filter((r) => r.code === 'I03')).toEqual([
      {
        level: 'info',
        code: 'I03',
        sheet: '',
        row: null,
        message: ru.report.codes.I03('MRP', '05.08.2026'),
      },
    ]);
  });

  it('без _Сценарий карта по умолчанию — snp: узел only-mrp не найден, дата — снимка SNP', async () => {
    const result = await read([{ name: 'S', rows: rowsWithNode }], SYN);
    expect(withoutInfo(result.report)).toEqual([
      {
        level: 'warning',
        code: 'W04',
        sheet: 'S',
        row: 2,
        message: ru.report.codes.W04('only-mrp', 'SNP', '17.09.2026'),
      },
    ]);
    expect(result.report.filter((r) => r.code === 'I03')).toEqual([
      {
        level: 'info',
        code: 'I03',
        sheet: '',
        row: null,
        message: ru.report.codes.I03('SNP', '17.09.2026'),
      },
    ]);
  });
});

describe('Сортировка отчёта на книге (SPEC §3.5:195): уровень → порядок листов → строка', () => {
  it('коды E03, W03, W05 (read.ts) и E04, E06, E07, W01, W02 (validate.ts) сортируются вместе', async () => {
    const result = await read([
      {
        name: 'A',
        rows: [
          [...HL, 'Лишняя'],
          ['1', 'a', 'http://x', 'z'],
          [2, '', '', ''],
        ],
      },
      { name: 'B', rows: [['№ шага', 'Шаг']] },
      { name: 'C', rows: [['x']] },
      { name: 'D', rows: [HL, ['1', 'd', 'ftp://q']] },
    ]);
    const rows = withoutInfo(result.report);
    // id "1" на листе D повторяет id "1" на листе A, строка 2 — первое вхождение
    // на всю книгу (SPEC §3.5:182), поэтому E06 листа D указывает на лист A.
    expect(rows.map((r) => [r.code, r.sheet, r.row])).toEqual([
      ['E04', 'A', 3],
      ['E03', 'C', null],
      ['E06', 'D', 2],
      ['E07', 'D', 2],
      ['W01', 'A', 2],
      ['W03', 'A', 3],
      ['W02', 'A', 3],
      ['W05', 'B', null],
    ]);
    const e06 = rows.find((r) => r.code === 'E06');
    expect(e06?.message).toBe(ru.report.codes.E06('1', 'A', 2));
  });
});

describe('sortReport (SPEC §3.5:195): уровень → порядок листов (книга, затем неизвестные — в конец) → строка', () => {
  it('сортирует строки разных уровней/листов/строк и не меняет входной массив', () => {
    const input: ReportRow[] = [
      reportRow('I01', 'A', null, 'I01'),
      reportRow('W02', 'A', 10, 'W02'),
      reportRow('E06', 'A', 3, 'E06'),
      reportRow('W02', 'A', 9, 'W02'),
      reportRow('E02', '', null, 'E02'),
      reportRow('E07', 'Z', 7, 'E07'),
      reportRow('W05', 'Z', null, 'W05'),
      reportRow('I03', '', null, 'I03'),
      reportRow('E04', 'A', 3, 'E04'),
      reportRow('W03', 'Z', 7, 'W03'),
      // 'Q' не входит в переданный порядок листов ['Z', 'A'] — «неизвестные — в конец»
      // это выбор sortReport, а не требование SPEC §3.5:195 или плана (см. комментарий
      // sortReport в src/excel/validate.ts).
      reportRow('W04', 'Q', 5, 'W04'),
    ];
    const before = [...input];

    const sorted = sortReport(input, ['Z', 'A']);

    expect(sorted.map((r) => [r.code, r.sheet, r.row])).toEqual([
      ['E02', '', null],
      ['E07', 'Z', 7],
      ['E06', 'A', 3],
      ['E04', 'A', 3],
      ['W05', 'Z', null],
      ['W03', 'Z', 7],
      ['W02', 'A', 9],
      ['W02', 'A', 10],
      ['W04', 'Q', 5],
      ['I03', '', null],
      ['I01', 'A', null],
    ]);
    expect(input).toEqual(before);
  });
});
