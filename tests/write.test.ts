// @vitest-environment node
// SPEC §3.3:136-138 задаёт опции чтения (type:'array', cellDates:false) и то,
// как id/url отражаются в cell.w/cell.l.Target — читатель DN-05 полагается
// именно на эти признаки. Здесь проверяется писатель (src/excel/write.ts,
// план DN-04): книга собирается и тут же читается обратно тем же SheetJS.
// Статический `import ... from 'xlsx'` вне src/** ESLint не запрещает
// (tests/eslintRules.test.ts, план п.3).
import { CFB, read, type WorkBook } from 'xlsx';
import { writeWorkbook, type SheetSpec } from '../src/excel/write';

const BASE_READ_OPTS = { type: 'array', cellDates: false } as const;

function readBack(bytes: Uint8Array, extra: Record<string, unknown> = {}): WorkBook {
  return read(bytes, { ...BASE_READ_OPTS, ...extra });
}

describe('writeWorkbook', () => {
  it('возвращает Uint8Array, начинающийся с сигнатуры zip (PK)', async () => {
    const bytes = await writeWorkbook([{ name: 'S', rows: [['x']] }]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it('порядок и имена листов сохраняются: _Сценарий, Блок 1, _Инструкция (SPEC §6:366-368)', async () => {
    const sheets: SheetSpec[] = [
      { name: '_Сценарий', rows: [['Название', 'Новый сценарий']] },
      { name: 'Блок 1', rows: [['Название блока'], ['№ шага', 'Шаг']] },
      { name: '_Инструкция', rows: [['Колонка', 'Обязательна']] },
    ];
    const wb = readBack(await writeWorkbook(sheets));
    expect(wb.SheetNames).toEqual(['_Сценарий', 'Блок 1', '_Инструкция']);
  });

  it('текстовая ячейка "1.10" остаётся "1.10" (t:"s", w:"1.10") — SPEC §3.3:137', async () => {
    const wb = readBack(await writeWorkbook([{ name: 'S', rows: [['1.10']] }]));
    const cell = wb.Sheets['S']?.A1;
    expect(cell?.t).toBe('s');
    expect(cell?.v).toBe('1.10');
    expect(cell?.w).toBe('1.10');
  });

  it('число 1.1 в соседней строке с текстовой "1.1" — числовая t:"n", у обеих w:"1.1" (подготовка к ТК2, SPEC:394)', async () => {
    const wb = readBack(
      await writeWorkbook([
        {
          name: 'S',
          rows: [[1.1], ['1.1']],
        },
      ]),
    );
    const numeric = wb.Sheets['S']?.A1;
    const text = wb.Sheets['S']?.A2;
    expect(numeric?.t).toBe('n');
    expect(numeric?.v).toBe(1.1);
    expect(numeric?.w).toBe('1.1');
    expect(text?.t).toBe('s');
    expect(text?.w).toBe('1.1');
  });

  it('ячейка-гиперссылка: v — текст, l.Target — цель ссылки (подготовка к ТК5, SPEC §3.3:138; только ASCII-URL — план, G2)', async () => {
    const link = 'https://stand.example/app?a=1&b=2#frag';
    const wb = readBack(await writeWorkbook([{ name: 'S', rows: [[{ text: 'Открыть', link }]] }]));
    const cell = wb.Sheets['S']?.A1;
    expect(cell?.v).toBe('Открыть');
    expect(cell?.l?.Target).toBe(link);
  });

  it('ширины колонок сохраняются в wch (SPEC §6:367)', async () => {
    const colWidths = [10, 36, 48, 28, 40, 60, 40, 30, 40];
    const bytes = await writeWorkbook([{ name: 'S', rows: [['x']], colWidths }]);
    const wb = readBack(bytes, { cellStyles: true });
    const cols = wb.Sheets['S']?.['!cols'] ?? [];
    expect(cols.map((c) => c.wch)).toEqual(colWidths);
  });

  it('textRanges даёт формат "@" на весь диапазон, включая пустые ячейки (SPEC §6:367)', async () => {
    // rows[0]/[1] — пустые строки 1-2, rows[2] — строка 3 с данными в A и B.
    const rows: SheetSpec['rows'] = [[], [], ['x', 'y']];
    const bytes = await writeWorkbook([{ name: 'S', rows, textRanges: ['A3:A500'] }]);
    const wb = readBack(bytes, { cellNF: true, sheetStubs: true });
    const sheet = wb.Sheets['S'];
    expect(sheet?.A3?.z).toBe('@'); // со значением
    expect(sheet?.A4?.z).toBe('@'); // пустая, но внутри диапазона
    expect(sheet?.A500?.z).toBe('@'); // граница диапазона
    expect(sheet?.A501).toBeUndefined(); // за границей
    expect(sheet?.B3?.z).not.toBe('@'); // соседняя колонка не форматирована
  });

  it('null, undefined и пустая строка вне диапазонов формата — ячейка отсутствует', async () => {
    const bytes = await writeWorkbook([{ name: 'S', rows: [['x', null, undefined, '', 'y']] }]);
    const wb = readBack(bytes);
    const sheet = wb.Sheets['S'];
    expect(sheet?.A1).toBeDefined();
    expect(sheet?.B1).toBeUndefined();
    expect(sheet?.C1).toBeUndefined();
    expect(sheet?.D1).toBeUndefined();
    expect(sheet?.E1).toBeDefined();
  });

  it('многострочный текст и & < > " читаются обратно без изменений', async () => {
    const value = 'строка 1\nстрока 2 & <тег> "кавычки"';
    const wb = readBack(await writeWorkbook([{ name: 'S', rows: [[value]] }]));
    expect(wb.Sheets['S']?.A1?.v).toBe(value);
  });

  it('два вызова с одинаковым входом дают побайтово равные результаты (важно для scenarios/, DN-08)', async () => {
    const sheets: SheetSpec[] = [
      {
        name: 'S',
        rows: [
          ['x', 1],
          ['y', 2],
        ],
      },
    ];
    const first = await writeWorkbook(sheets);
    const second = await writeWorkbook(sheets);
    expect(Buffer.from(second)).toEqual(Buffer.from(first));
  });

  it.each([
    ['имя с недопустимым символом', 'a/b'],
    ['имя длиннее 31 символа', 'S'.repeat(32)],
  ])('отклоняет промис: %s', async (_label, name) => {
    await expect(writeWorkbook([{ name, rows: [['x']] }])).rejects.toBeTruthy();
  });

  it('отклоняет промис: повтор имени листа', async () => {
    await expect(
      writeWorkbook([
        { name: 'S', rows: [['x']] },
        { name: 'S', rows: [['y']] },
      ]),
    ).rejects.toBeTruthy();
  });

  it('отклоняет промис: пустой список листов', async () => {
    await expect(writeWorkbook([])).rejects.toBeTruthy();
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])(
    'отклоняет промис: %s в числовой ячейке (план: SheetJS молча написал бы #NUM!)',
    async (_label, n) => {
      await expect(writeWorkbook([{ name: 'S', rows: [[n]] }])).rejects.toBeTruthy();
    },
  );
});

// SPEC §6:371, §11:622 (решение DN-akk): SheetJS Community Edition не пишет
// <pane> в XML листа — freezeRows дописывает эту строку после X.write через
// встроенный в SheetJS CFB. Хелперы zipText/sheetXml разбирают zip средствами
// CFB.read/CFB.find; тот же хелпер дословно повторён в tests/template.test.ts
// (общий файл-хелпер, копия допустима).
interface CfbEntry {
  content: Uint8Array | number[];
}
interface CfbContainer {
  FileIndex: CfbEntry[];
}
interface CfbApi {
  read(data: Uint8Array, opts: { type: 'array' }): CfbContainer;
  find(container: CfbContainer, path: string): CfbEntry | null;
}
const cfb = CFB as CfbApi;

function toText(content: Uint8Array | number[]): string {
  // Buffer (Node) и Uint8Array (браузер) — дефект D3.
  const bytes = content instanceof Uint8Array ? content : Uint8Array.from(content);
  return new TextDecoder().decode(bytes);
}

/** Текст файла внутри zip; путь — без ведущего `/`, дефект D1 (CFB.find ищет только с ним). */
function zipText(bytes: Uint8Array, path: string): string {
  const container = cfb.read(bytes, { type: 'array' });
  const entry = cfb.find(container, '/' + path);
  if (!entry) throw new Error(`not found in zip: ${path}`);
  return toText(entry.content);
}

/** XML листа по его имени — через xl/workbook.xml и xl/_rels/workbook.xml.rels, а не по позиции. */
function sheetXml(bytes: Uint8Array, name: string): string {
  const wbXml = zipText(bytes, 'xl/workbook.xml');
  const sheetMatch = wbXml.match(
    new RegExp(`<sheet name="${name}" sheetId="\\d+" r:id="(rId\\d+)"/>`),
  );
  const rid = sheetMatch?.[1];
  if (rid === undefined) throw new Error(`sheet not found in workbook.xml: ${name}`);
  const relsXml = zipText(bytes, 'xl/_rels/workbook.xml.rels');
  const relMatch = relsXml.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`));
  const target = relMatch?.[1];
  if (target === undefined) throw new Error(`relationship not found: ${rid}`);
  return zipText(bytes, 'xl/' + target);
}

/** Локальные заголовки zip по порядку записи (сигнатура `PK\x03\x04` = 0x04034b50). */
function localHeaders(bytes: Uint8Array): { stamp: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headers: { stamp: number }[] = [];
  let off = 0;
  while (off + 4 <= bytes.length && view.getUint32(off, true) === 0x04034b50) {
    headers.push({ stamp: view.getUint32(off + 10, true) });
    const nameLen = view.getUint16(off + 26, true);
    const extraLen = view.getUint16(off + 28, true);
    const csz = view.getUint32(off + 18, true);
    off += 30 + nameLen + extraLen + csz;
  }
  return headers;
}

const PANE2 = '<pane ySplit="2" topLeftCell="A3" state="frozen"/>';

describe('freezeRows (DN-akk, SPEC §6:371)', () => {
  it('W1: freezeRows=2 у «Блок 1» — PANE2 в его XML, у остальных листов <pane нет', async () => {
    const sheets: SheetSpec[] = [
      { name: '_Сценарий', rows: [['a']] },
      { name: 'Блок 1', rows: [['t'], ['№ шага', 'Шаг']], freezeRows: 2 },
      { name: '_Инструкция', rows: [['x']] },
    ];
    const bytes = await writeWorkbook(sheets);
    expect(sheetXml(bytes, 'Блок 1')).toContain(PANE2);
    expect(sheetXml(bytes, '_Сценарий')).not.toContain('<pane');
    expect(sheetXml(bytes, '_Инструкция')).not.toContain('<pane');
  });

  it('W2: freezeRows=1 — pane ySplit="1" topLeftCell="A2"', async () => {
    const bytes = await writeWorkbook([{ name: 'S', rows: [['x'], ['y']], freezeRows: 1 }]);
    expect(sheetXml(bytes, 'S')).toContain('<pane ySplit="1" topLeftCell="A2" state="frozen"/>');
  });

  it('W3: без freezeRows ни один лист не содержит <pane', async () => {
    const sheets: SheetSpec[] = [
      { name: '_Сценарий', rows: [['a']] },
      { name: 'Блок 1', rows: [['t'], ['№ шага', 'Шаг']] },
    ];
    const bytes = await writeWorkbook(sheets);
    expect(sheetXml(bytes, '_Сценарий')).not.toContain('<pane');
    expect(sheetXml(bytes, 'Блок 1')).not.toContain('<pane');
  });

  it('W4: два вызова с тем же входом дают побайтово равные результаты', async () => {
    const sheets: SheetSpec[] = [
      { name: '_Сценарий', rows: [['a']] },
      { name: 'Блок 1', rows: [['t'], ['№ шага', 'Шаг']], freezeRows: 2 },
      { name: '_Инструкция', rows: [['x']] },
    ];
    const first = await writeWorkbook(sheets);
    const second = await writeWorkbook(sheets);
    expect(Buffer.from(second)).toEqual(Buffer.from(first));
  });

  it('W5: локальные заголовки zip не несут мусорный CFB-timestamp (дефект D2)', async () => {
    const sheets: SheetSpec[] = [
      { name: '_Сценарий', rows: [['a']] },
      { name: 'Блок 1', rows: [['t'], ['№ шага', 'Шаг']], freezeRows: 2 },
      { name: '_Инструкция', rows: [['x']] },
    ];
    const bytes = await writeWorkbook(sheets);
    const headers = localHeaders(bytes);
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header.stamp).toBe(0);
  });

  it('W6: книга читается read() — порядок листов и заголовок «№ шага» на месте', async () => {
    const sheets: SheetSpec[] = [
      { name: '_Сценарий', rows: [['a']] },
      { name: 'Блок 1', rows: [['t'], ['№ шага', 'Шаг']], freezeRows: 2 },
      { name: '_Инструкция', rows: [['x']] },
    ];
    const bytes = await writeWorkbook(sheets);
    const wb = read(bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual(['_Сценарий', 'Блок 1', '_Инструкция']);
    expect(wb.Sheets['Блок 1']?.A2?.v).toBe('№ шага');
  });

  it.each([
    ['0', 0],
    ['-1', -1],
    ['1.5', 1.5],
    ['NaN', Number.NaN],
  ])('W7: отклоняет промис при freezeRows = %s', async (_label, freezeRows) => {
    await expect(writeWorkbook([{ name: 'S', rows: [['x']], freezeRows }])).rejects.toBeTruthy();
  });
});
