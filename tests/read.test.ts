// @vitest-environment node
// SPEC §3.2-3.3 (:104-143): разбор книги в Scenario + отчёт. Приёмка DN-05 —
// ТК 5, 6, 7, 9 (SPEC §8:401-405, дословно) плюс сопутствующие случаи §3.3 из
// плана DN-05 (раздел 3.C). Книги собираются writeWorkbook — та же SheetJS,
// что читает readWorkbook, поэтому байты настоящие, а не подделанные вручную.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readWorkbook, recoverUtf8 } from '../src/excel/read';
import { writeWorkbook, type SheetSpec } from '../src/excel/write';
import { LEVELS, type ReportRow } from '../src/excel/validate';
import { ru } from '../src/i18n/ru';
import { ScenarioSchema } from '../src/model/schema';

const HEAD = ['№ шага', 'Шаг'];

const ZERO_SUMMARY = { sheets: 0, blocks: 0, steps: 0, withLink: 0, withNode: 0 };

/** Собирает книгу writeWorkbook и тут же читает её readWorkbook (план 3.C). */
async function read(sheets: SheetSpec[], fileName = 'demo.xlsx') {
  const bytes = await writeWorkbook(sheets);
  return readWorkbook(bytes.slice().buffer, fileName);
}

/** Строки отчёта без уровня info — так короче сверять danger/warning (план 3.C). */
function withoutInfo(report: readonly ReportRow[]): ReportRow[] {
  return report.filter((r) => r.level !== 'info');
}

describe('ТК 5 (SPEC §8:401): ячейка-гиперссылка с текстом «Открыть» → url = цель ссылки', () => {
  it('url берётся из l.Target, а не из видимого текста ячейки (SPEC §3.3:138)', async () => {
    const link = 'https://stand.example/app?a=1&b=2#frag';
    const result = await read([
      {
        name: 'Блок 1',
        rows: [
          ['№ шага', 'Шаг', 'Ссылка'],
          ['1.1', 'A', { text: 'Открыть', link }],
          ['1.2', 'B', 'https://plain.example/x'],
          ['1.3', 'C', { text: 'https://shown.example', link: 'https://target.example' }],
        ],
      },
    ]);
    const urls = result.scenario?.blocks[0]?.steps.map((s) => s.url);
    expect(urls).toEqual([link, 'https://plain.example/x', 'https://target.example']);
    expect(result.summary.withLink).toBe(3);
  });
});

describe('DN-13n (SPEC §3.3:138, ТК 5): цель гиперссылки с кириллицей читается без искажений', () => {
  // Баг DN-04/DN-13n (история): писатель кладёт в rels корректный UTF-8, а старый
  // linkTarget() отдавал cell.l.Target как есть — SheetJS при чтении rels отдаёт
  // байты UTF-8, каждый поштучно перекодированный так, будто он был latin1
  // (классическая мojibake). Исправление — recoverUtf8() (src/excel/read.ts:96-111),
  // которую вызывает linkTarget() (src/excel/read.ts:117-120). Ожидание теста —
  // исходный адрес, побайтово равный записанному через writeWorkbook.
  it('кириллица в пути и в query читается как записана', async () => {
    const link = 'https://stand.example/путь?q=узел';
    const result = await read([
      {
        name: 'Блок 1',
        rows: [
          ['№ шага', 'Шаг', 'Ссылка'],
          ['1.1', 'A', { text: 'Открыть', link }],
        ],
      },
    ]);
    expect(result.scenario?.blocks[0]?.steps[0]?.url).toBe(link);
  });

  it('одиночный не-ASCII символ из Latin-1 (café) читается как записан', async () => {
    const link = 'https://ex.example/café';
    const result = await read([
      {
        name: 'Блок 1',
        rows: [
          ['№ шага', 'Шаг', 'Ссылка'],
          ['1.1', 'A', { text: 'Открыть', link }],
        ],
      },
    ]);
    expect(result.scenario?.blocks[0]?.steps[0]?.url).toBe(link);
  });

  it('ASCII-адрес не меняется', async () => {
    const link = 'https://stand.example/app?a=1&b=2#frag';
    const result = await read([
      {
        name: 'Блок 1',
        rows: [
          ['№ шага', 'Шаг', 'Ссылка'],
          ['1.1', 'A', { text: 'Открыть', link }],
        ],
      },
    ]);
    expect(result.scenario?.blocks[0]?.steps[0]?.url).toBe(link);
  });

  it('percent-encoded кириллица (адрес после сохранения в Excel) не декодируется и не меняется', async () => {
    const link = 'https://stand.example/%D0%BF%D1%83%D1%82%D1%8C?q=%D1%83%D0%B7%D0%B5%D0%BB';
    const result = await read([
      {
        name: 'Блок 1',
        rows: [
          ['№ шага', 'Шаг', 'Ссылка'],
          ['1.1', 'A', { text: 'Открыть', link }],
        ],
      },
    ]);
    expect(result.scenario?.blocks[0]?.steps[0]?.url).toBe(link);
  });

  // Пятый случай из плана DN-13n — «Latin-1-подобный адрес, который при обратном
  // перекодировании в UTF-8 невалиден» (проверка от переисправления) — через
  // writeWorkbook не собрать. Записывающая часть (write.ts:59) всегда отдаёт в rels
  // корректный UTF-8 для любой JS-строки, поэтому её байты, поштучно прочитанные как
  // latin1 (баг чтения) и затем поштучно перекодированные назад в UTF-8, гарантированно
  // декодируются — это ровно те же байты, которыми исходная строка была закодирована.
  // Не-UTF-8 байты в l.Target появились бы, только если вручную собрать zip/rels в
  // обход writeWorkbook — и это запрещено инструкцией задачи («не подделывай»). Этот
  // случай (и обе отсечки recoverUtf8) проверяется ниже прямым вызовом recoverUtf8,
  // в обход writeWorkbook/readWorkbook.
});

describe('recoverUtf8 (SPEC §3.3:138, DN-13n): отсечки до TextDecoder — прямой вызов, в обход writeWorkbook', () => {
  it('Latin-1-строка, чьи байты не образуют валидный UTF-8, не трогается ({ fatal: true })', () => {
    // 'é' = U+00E9 → charCodeAt = 0xE9 = 1110 1001. По маске 1110xxxx это ведущий байт
    // трёхбайтовой UTF-8-последовательности — за ним обязаны идти два продолжающих
    // байта вида 10xxxxxx. В строке 'é' — последний символ, после него в bytes[] ничего
    // нет, так что декодер получает 0xE9 без продолжения: валидной UTF-8-строки не
    // существует. С { fatal: true } TextDecoder бросает исключение, и recoverUtf8
    // возвращает переданную строку без изменений (в отличие от того же адреса,
    // прошедшего через writeWorkbook/readWorkbook в ТК выше: там мojibake — это уже два
    // отдельных байта 0xC3 0xA9, каждый из которых валиден как продолжение другого).
    const link = 'https://ex.example/café';
    expect(recoverUtf8(link)).toBe(link);
  });

  it('символ выше U+00FF (уже корректно декодированная кириллица) не трогается (code > 0xff)', () => {
    // 'у' = U+0443 = 1091 — больше 0x00FF, в один байт не укладывается. Первый же
    // такой символ обязан оборвать разбор и вернуть строку как есть: без этой отсечки
    // charCodeAt('у') записался бы в Uint8Array с усечением до младшего байта (0x43),
    // необратимо потеряв исходные данные.
    const link = 'https://stand.example/узел';
    expect(recoverUtf8(link)).toBe(link);
  });

  it('чистый ASCII не трогается (hasHighByte остаётся false)', () => {
    // Все символы 'https://ex.example/plain?a=1&b=2#frag' — код ≤ 0x7f (буквы, цифры,
    // ':', '/', '.', '?', '=', '&', '#'), значит hasHighByte ни разу не станет true, и
    // функция вернёт исходную строку, не заходя в TextDecoder.
    const link = 'https://ex.example/plain?a=1&b=2#frag';
    expect(recoverUtf8(link)).toBe(link);
  });

  it('искажённая latin1-строка восстанавливается в исходный адрес', () => {
    // Слово «путь» в UTF-8 (формула для U+0080–U+07FF: байт1 = 0xC0 | (cp >> 6),
    // байт2 = 0x80 | (cp & 0x3F)):
    //   п U+043F (0x043F >> 6 = 0x10, 0x043F & 0x3F = 0x3F) → 0xC0|0x10=0xD0, 0x80|0x3F=0xBF
    //   у U+0443 (0x0443 >> 6 = 0x11, 0x0443 & 0x3F = 0x03) → 0xC0|0x11=0xD1, 0x80|0x03=0x83
    //   т U+0442 (0x0442 >> 6 = 0x11, 0x0442 & 0x3F = 0x02) → 0xC0|0x11=0xD1, 0x80|0x02=0x82
    //   ь U+044C (0x044C >> 6 = 0x11, 0x044C & 0x3F = 0x0C) → 0xC0|0x11=0xD1, 0x80|0x0C=0x8C
    // Итого байты «путь» в UTF-8: D0 BF D1 83 D1 82 D1 8C. Баг SheetJS читает rels как
    // latin1 — каждый байт становится отдельным символом с тем же кодом, что и
    // собрано ниже через String.fromCharCode. Все восемь кодов ≤ 0xFF, и часть из них
    // > 0x7F: обе отсечки recoverUtf8 пропускают строку дальше, TextDecoder видит
    // ровно те байты, на которые раскладывается «путь» в UTF-8, и возвращает его.
    const mojibake =
      'https://stand.example/' +
      String.fromCharCode(0xd0, 0xbf, 0xd1, 0x83, 0xd1, 0x82, 0xd1, 0x8c);
    expect(recoverUtf8(mojibake)).toBe('https://stand.example/путь');
  });
});

describe('ТК 6 (SPEC §8:402): строка заголовков и название блока', () => {
  it('заголовки в строке 1 → название блока = имя листа', async () => {
    const result = await read([{ name: 'Лист А', rows: [HEAD, ['1', 'x']] }]);
    expect(result.scenario?.blocks[0]).toMatchObject({
      n: 1,
      title: 'Лист А',
      sheet: 'Лист А',
    });
    expect(result.scenario?.blocks[0]?.steps).toHaveLength(1);
  });

  it('заголовки в строке 2 при заполненной A1 → название блока = A1', async () => {
    const result = await read([{ name: 'Лист А', rows: [['Название блока'], HEAD, ['1', 'x']] }]);
    expect(result.scenario?.blocks[0]?.title).toBe('Название блока');
  });

  it('пустая A1, непустая A2 → название блока = A2', async () => {
    const result = await read([{ name: 'Лист А', rows: [[], ['Второй'], HEAD, ['1', 'x']] }]);
    expect(result.scenario?.blocks[0]?.title).toBe('Второй');
  });

  it('непустые A1 и A2 → название блока — самая верхняя строка (SPEC §3.2:112, план п.4)', async () => {
    const result = await read([
      { name: 'Лист А', rows: [['Первый'], ['Второй'], HEAD, ['1', 'x']] },
    ]);
    expect(result.scenario?.blocks[0]?.title).toBe('Первый');
  });

  const E03_CASES: ReadonlyArray<readonly [string, SheetSpec['rows']]> = [
    ['над заголовком название и пустые строки', [['Название'], [], [], HEAD, ['1', 'x']]],
    ['над заголовком только пустые строки', [[], [], [], HEAD, ['1', 'x']]],
  ];

  it.each(E03_CASES)('заголовки в строке 4 → E03 (%s)', async (_label, rows) => {
    const result = await read([
      { name: 'Плохой', rows },
      { name: 'Хороший', rows: [HEAD, ['1', 'x']] },
    ]);
    expect(withoutInfo(result.report)).toEqual([
      {
        level: 'danger',
        code: 'E03',
        sheet: 'Плохой',
        row: null,
        message: ru.report.codes.E03(),
      },
    ]);
    expect(result.scenario).toBeUndefined();
    expect(result.summary).toEqual({ sheets: 2, blocks: 1, steps: 1, withLink: 0, withNode: 0 });
  });

  it('совсем пустой лист без !ref → E03 (план, открытый вопрос 7)', async () => {
    const result = await read([
      { name: 'Пусто', rows: [] },
      { name: 'Хороший', rows: [HEAD, ['1', 'x']] },
    ]);
    expect(withoutInfo(result.report).map((r) => [r.code, r.sheet])).toEqual([['E03', 'Пусто']]);
  });

  it('заголовки не в колонке A → название блока = имя листа (SPEC §3.2:112)', async () => {
    const result = await read([
      {
        name: 'S',
        rows: [
          [null, ...HEAD],
          [null, '1', 'x'],
        ],
      },
    ]);
    expect(result.scenario?.blocks[0]).toMatchObject({
      title: 'S',
      steps: [expect.objectContaining({ id: '1', title: 'x' })],
    });
  });
});

describe('ТК 7 (SPEC §8:403): алиасы «Посыл клиенту» → value, «Экран / Раздел системы» → screen; «Лишняя» → I01', () => {
  it('шаг собран по алиасам, нераспознанная колонка даёт I01, недостающие — I02', async () => {
    const result = await read([
      {
        name: 'Блок',
        rows: [
          ['№ шага', 'Шаг', 'Посыл клиенту', 'Экран / Раздел системы', 'Лишняя'],
          ['1.1', 'A', 'Ценность', 'Экран X', 'мусор'],
        ],
      },
    ]);
    expect(result.scenario?.blocks[0]?.steps[0]).toEqual({
      id: '1.1',
      title: 'A',
      action: '',
      screen: 'Экран X',
      url: '',
      value: 'Ценность',
      result: '',
      comment: '',
      node: '',
    });

    expect(result.report.filter((r) => r.code === 'I01')).toEqual([
      {
        level: 'info',
        code: 'I01',
        sheet: 'Блок',
        row: null,
        message: ru.report.codes.I01('Лишняя'),
      },
    ]);

    const i02 = result.report.filter((r) => r.code === 'I02');
    expect(i02.map((r) => r.message)).toEqual(
      ['Действие', 'Ссылка', 'Ожидаемый результат', 'Комментарий', 'Узел карты'].map((name) =>
        ru.report.codes.I02(name),
      ),
    );
    expect(i02.every((r) => r.row === null)).toBe(true);
  });

  it('«Название шага» — алиас title рядом с «Шаг»: берётся первое вхождение, без I01 (план, дефект 3)', async () => {
    const result = await read([
      {
        name: 'Блок',
        rows: [
          ['№ шага', 'Шаг', 'Название шага'],
          ['1', 'A', 'B'],
        ],
      },
    ]);
    expect(result.scenario?.blocks[0]?.steps[0]?.title).toBe('A');
    expect(result.report.filter((r) => r.code === 'I01')).toEqual([]);
  });

  it('две нераспознанные колонки → две строки I01 с исходными текстами заголовков (SPEC §3.5:189, план п.7 «одна строка на лист» = одна строка на нераспознанную колонку)', async () => {
    const result = await read([
      {
        name: 'Блок',
        rows: [
          ['№ шага', 'Шаг', 'Лишняя 1', 'Лишняя 2'],
          ['1.1', 'A', 'x', 'y'],
        ],
      },
    ]);
    expect(result.report.filter((r) => r.code === 'I01')).toEqual([
      {
        level: 'info',
        code: 'I01',
        sheet: 'Блок',
        row: null,
        message: ru.report.codes.I01('Лишняя 1'),
      },
      {
        level: 'info',
        code: 'I01',
        sheet: 'Блок',
        row: null,
        message: ru.report.codes.I01('Лишняя 2'),
      },
    ]);
  });
});

describe('ТК 9 (SPEC §8:405): листы _* не становятся блоками; _Сценарий задаёт название/модуль/карту', () => {
  it('_Сценарий задаёт title/module/map; _Инструкция не становится блоком', async () => {
    const result = await read(
      [
        {
          name: '_Сценарий',
          rows: [
            ['Название', 'Мой сценарий'],
            ['Модуль', 'MRP'],
            ['Карта', 'MRP'],
          ],
        },
        { name: '_Инструкция', rows: [HEAD, ['9.9', 'Не блок']] },
        { name: 'Блок 1', rows: [HEAD, ['1.1', 'A']] },
      ],
      'file.xlsx',
    );
    expect(result.scenario).toMatchObject({ title: 'Мой сценарий', module: 'MRP', map: 'mrp' });
    expect(result.scenario?.blocks.map((b) => [b.n, b.sheet])).toEqual([[1, 'Блок 1']]);
    expect(result.summary.sheets).toBe(1);
  });

  it('без листа _Сценарий название сценария = имя файла без расширения (SPEC §3.2:109)', async () => {
    const result = await read([{ name: 'Блок 1', rows: [HEAD, ['1.1', 'A']] }], 'Демо 1.xlsx');
    expect(result.scenario).toMatchObject({
      title: 'Демо 1',
      module: '',
      map: 'snp',
      id: 'demo-1',
      source: 'local',
      loadedAt: '',
      fileName: 'Демо 1.xlsx',
    });
  });

  it('неизвестное значение «Карта» → snp, без строки отчёта (план, открытый вопрос 3)', async () => {
    const result = await read([
      { name: '_Сценарий', rows: [['Карта', 'xyz']] },
      { name: 'Блок 1', rows: [HEAD, ['1', 'x']] },
    ]);
    expect(result.scenario?.map).toBe('snp');
    expect(withoutInfo(result.report)).toEqual([]);
  });
});

describe('SPEC §3.3:137: номер шага числом → W03, cell.w сохраняет отображаемый текст', () => {
  it('id ["1.10","2"], пустая строка пропущена, W03 на строке 4', async () => {
    const result = await read([{ name: 'S', rows: [HEAD, ['1.10', 'A'], [], [2, 'B']] }]);
    expect(result.scenario?.blocks[0]?.steps.map((s) => s.id)).toEqual(['1.10', '2']);
    expect(withoutInfo(result.report)).toEqual([
      { level: 'warning', code: 'W03', sheet: 'S', row: 4, message: ru.report.codes.W03() },
    ]);
    expect(result.scenario).toBeDefined();
  });

  it('числовой id берётся из cell.w, а не String(cell.v): 0.1+0.2 → "0.3" (SPEC §3.3:137)', async () => {
    // SheetJS показывает cell.w «0.3» для 0.1+0.2, а String(cell.v) даёт
    // «0.30000000000000004» — это ловит мутацию, читающую id через String(cell.v).
    const value = 0.1 + 0.2;
    const result = await read([{ name: 'S', rows: [HEAD, [value, 'A']] }]);
    expect(result.scenario?.blocks[0]?.steps.map((s) => s.id)).toEqual(['0.3']);
    expect(withoutInfo(result.report)).toEqual([
      { level: 'warning', code: 'W03', sheet: 'S', row: 2, message: ru.report.codes.W03() },
    ]);
  });
});

describe('SPEC §3.3:139: строка пропускается, только если пусты все распознанные колонки (заметка DN-04)', () => {
  it('строка с текстом только в нераспознанной колонке пропускается, даже в хвосте формата "@" до A500', async () => {
    const result = await read([
      {
        name: 'Блок',
        rows: [
          ['Блок'],
          ['№ шага', 'Шаг', 'Действие', 'Лишняя'],
          ['1.1', 'A', ''],
          [],
          ['1.2', 'B', 'act'],
          ['', '', '', 'только лишняя'],
        ],
        textRanges: ['A3:A500'],
      },
    ]);
    expect(result.scenario?.blocks[0]?.steps.map((s) => s.id)).toEqual(['1.1', '1.2']);
    expect(withoutInfo(result.report)).toEqual([]);
  });
});

describe('SPEC §3.5 W05/п.5 плана: пропущенный лист (W05) занимает номер блока', () => {
  it('W05 без I01 на пустом листе; следующий блок получает n=2', async () => {
    const result = await read([
      { name: '_Сценарий', rows: [['Название', 'X']] },
      { name: 'Пустой', rows: [['№ шага', 'Шаг', 'Лишняя']], textRanges: ['A2:A500'] },
      { name: 'Блок', rows: [HEAD, ['1', 'x']] },
    ]);
    expect(result.report.filter((r) => r.sheet === 'Пустой')).toEqual([
      {
        level: 'warning',
        code: 'W05',
        sheet: 'Пустой',
        row: null,
        message: ru.report.codes.W05(),
      },
    ]);
    expect(result.scenario?.blocks.map((b) => b.n)).toEqual([2]);
    expect(result.summary).toMatchObject({ sheets: 2, blocks: 1 });
  });
});

describe('SPEC §3.5 E02: нет ни одного листа-блока со шагами', () => {
  it('только _Сценарий → E02, summary — нули, ключа scenario нет', async () => {
    const result = await read([{ name: '_Сценарий', rows: [['Название', 'X']] }]);
    expect(result).toEqual({
      report: [
        { level: 'danger', code: 'E02', sheet: '', row: null, message: ru.report.codes.E02() },
      ],
      summary: ZERO_SUMMARY,
    });
    expect(result).not.toHaveProperty('scenario');
  });

  it('единственный лист-блок — заголовок без строк данных → W05 по листу И E02 по книге (SPEC §3.5:178, план п.8: E02 считает собранные блоки, не число листов-блоков)', async () => {
    const result = await read([{ name: 'Блок', rows: [HEAD] }]);
    expect(withoutInfo(result.report)).toEqual([
      { level: 'warning', code: 'W05', sheet: 'Блок', row: null, message: ru.report.codes.W05() },
      { level: 'danger', code: 'E02', sheet: '', row: null, message: ru.report.codes.E02() },
    ]);
    expect(result.summary).toEqual({ sheets: 1, blocks: 0, steps: 0, withLink: 0, withNode: 0 });
    expect(result.scenario).toBeUndefined();
  });
});

describe('SPEC §3.3:136, план 0.(a)/0.(c): E01 — файл не читается как книга Excel', () => {
  const csv = new TextEncoder().encode('№ шага,Шаг\n1.1,x\n').buffer;
  const html = new TextEncoder().encode(
    '<table><tr><td>№ шага</td><td>Шаг</td></tr><tr><td>1.1</td><td>x</td></tr></table>',
  ).buffer;
  const empty = new ArrayBuffer(0);
  const brokenZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]).slice().buffer;

  it.each([
    ['CSV с валидными заголовками', csv],
    ['HTML-таблица с валидными заголовками', html],
    ['пустой ArrayBuffer', empty],
    ['сигнатура PK + мусор — не ZIP', brokenZip],
  ] as const)('%s → E01, сценарий не собирается', async (_label, buf) => {
    const result = await readWorkbook(buf, 'x.xlsx');
    expect(result).toEqual({
      report: [
        { level: 'danger', code: 'E01', sheet: '', row: null, message: ru.report.codes.E01() },
      ],
      summary: ZERO_SUMMARY,
    });
  });
});

describe('SPEC §3.3:137, §11 №15: trim только по краям, переносы строк внутри сохраняются', () => {
  it('action и comment', async () => {
    const result = await read([
      {
        name: 'S',
        rows: [
          ['№ шага', 'Шаг', 'Действие', 'Комментарий'],
          ['1', 'x', 'строка 1\nстрока 2', '  a\nb  '],
        ],
      },
    ]);
    expect(result.scenario?.blocks[0]?.steps[0]).toMatchObject({
      action: 'строка 1\nстрока 2',
      comment: 'a\nb',
    });
  });
});

describe('SPEC §3.3:143, план п.11: summary.withLink по isScreenUrl, withNode по node !== ""', () => {
  it('withLink=2 (http и https считаются), withNode=2', async () => {
    const result = await read([
      {
        name: 'S',
        rows: [
          ['№ шага', 'Шаг', 'Ссылка', 'Узел карты'],
          ['1', 'a', 'https://a', 'n1'],
          ['2', 'b', 'http://b', ''],
          ['3', 'c', 'ftp://x', ''],
          ['4', 'd', '', 'n4'],
        ],
      },
    ]);
    // scenario не проверяется: ftp://x — E07 из DN-06, здесь его ещё нет.
    expect(result.summary).toEqual({ sheets: 1, blocks: 1, steps: 4, withLink: 2, withNode: 2 });
  });
});

describe('SPEC §3.1:100, §3.6:203: id — слаг baseName(fileName), фолбэк "scenario"', () => {
  it('"Демо сценарий.v2.xlsx" → id "demo-scenariy-v2", title без расширения, проходит ScenarioSchema', async () => {
    const result = await read(
      [{ name: 'Блок 1', rows: [HEAD, ['1', 'x']] }],
      'Демо сценарий.v2.xlsx',
    );
    expect(result.scenario).toMatchObject({
      schema: 1,
      id: 'demo-scenariy-v2',
      source: 'local',
      loadedAt: '',
      fileName: 'Демо сценарий.v2.xlsx',
      title: 'Демо сценарий.v2',
    });
    expect(ScenarioSchema.safeParse(result.scenario).success).toBe(true);
  });

  it('"---.xlsx" → фолбэк id "scenario" (§3.6:203)', async () => {
    const result = await read([{ name: 'Блок 1', rows: [HEAD, ['1', 'x']] }], '---.xlsx');
    expect(result.scenario?.id).toBe('scenario');
  });
});

describe('SPEC §3.1: пустой «Шаг» — сценарий не возвращается через ScenarioSchema.safeParse (E04 — DN-06)', () => {
  it('пустой title → scenario отсутствует; строку отчёта не проверяем (E04 ещё нет)', async () => {
    const result = await read([
      {
        name: 'Блок 1',
        rows: [
          ['№ шага', 'Шаг', 'Действие'],
          ['1', '', 'act'],
        ],
      },
    ]);
    expect(result.scenario).toBeUndefined();
  });
});

describe('LEVELS (SPEC §3.5): уровни кодов совпадают с таблицей SPEC.md (validate.test.ts — вне скоупа DN-05)', () => {
  it('LEVELS содержит те же 15 кодов с теми же уровнями', () => {
    const specPath = fileURLToPath(new URL('../SPEC.md', import.meta.url));
    const lines = readFileSync(specPath, 'utf8').split(/\r?\n/);
    const ROW = /^\| ([EWI]0\d) \| (danger|warning|info) \|/;
    const fromSpec: Record<string, string> = {};
    for (const line of lines) {
      const m = ROW.exec(line);
      if (m) fromSpec[m[1] as string] = m[2] as string;
    }
    expect(LEVELS).toEqual(fromSpec);
  });
});

describe('план DN-05, раздел 2, шаг 4: loadXlsx вызывается вне try — сбой загрузки не глотается в E01', () => {
  it('readWorkbook отклоняет промис, если сама загрузка SheetJS падает', async () => {
    const bytes = await writeWorkbook([{ name: 'S', rows: [HEAD, ['1', 'x']] }]);
    const buf = bytes.slice().buffer;
    vi.resetModules();
    vi.doMock('xlsx', () => {
      throw new Error('cdn недоступен');
    });
    try {
      const fresh = await import('../src/excel/read');
      await expect(fresh.readWorkbook(buf, 'demo.xlsx')).rejects.toThrow();
    } finally {
      vi.doUnmock('xlsx');
    }
  });
});
