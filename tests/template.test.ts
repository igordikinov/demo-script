// @vitest-environment node
// ТК 10 (SPEC §8:406, дословно): «Шаблон §6 читается обратно без danger, 2 шага,
// 9 распознанных колонок». Остальные проверки (T3–T14) построены на
// §6:366–374 и §11:622 (решение DN-akk).
// Тексты примеров (T2, T3) — решение владельца 18.09.2026: шаг 1.1 и шаг 2.3
// (номер заменён на «1.2») фикстуры deployment-demo.json копируются в
// ru.template.examples дословно.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CFB, read, utils } from 'xlsx';
import { COLUMNS, SCENARIO_KEYS, SCENARIO_SHEET } from '../src/excel/columns';
import { readWorkbook } from '../src/excel/read';
import {
  TEMPLATE_FILE_NAME,
  blockSheet,
  buildTemplate,
  scenarioSheet,
} from '../src/excel/template';
import { writeWorkbook } from '../src/excel/write';
import { ru } from '../src/i18n/ru';
import type { Step } from '../src/model/schema';
import { PmSnapshotSchema, type PmSnapshots } from '../src/pm/snapshot';

/** Настоящие снимки карт (как в tests/read.test.ts) — шаблон не проверяет W04. */
const SNAPSHOTS: PmSnapshots = {
  snp: PmSnapshotSchema.parse(
    JSON.parse(
      readFileSync(fileURLToPath(new URL('../src/data/pm/snp.json', import.meta.url)), 'utf8'),
    ),
  ),
  mrp: PmSnapshotSchema.parse(
    JSON.parse(
      readFileSync(fileURLToPath(new URL('../src/data/pm/mrp.json', import.meta.url)), 'utf8'),
    ),
  ),
};

/** Единственный локальный вызов readWorkbook в файле: третий аргумент snapshots —
 * реальные снимки карт, чтобы карта `snp` (узлы примеров шаблона) сверялась
 * по-настоящему, без W04. */
async function readBook(bytes: Uint8Array, fileName: string) {
  return readWorkbook(new Uint8Array(bytes).buffer, fileName, SNAPSHOTS);
}

interface FixtureJson {
  readonly title: string;
  readonly module: string;
  readonly map: 'snp' | 'mrp';
  readonly blocks: readonly { readonly title: string; readonly steps: readonly Step[] }[];
}

const fixturePath = fileURLToPath(new URL('./fixtures/deployment-demo.json', import.meta.url));
const fixtureJson = JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureJson;

/** Шаг фикстуры по id (§8:406 T2/T3, решение владельца 18.09.2026). */
function fixtureStep(id: string): Step {
  for (const block of fixtureJson.blocks) {
    const step = block.steps.find((s) => s.id === id);
    if (step) return step;
  }
  throw new Error(`fixture step not found: ${id}`);
}

// Хелперы CFB — дословная копия tests/write.test.ts (общий файл-хелпер,
// копия в двух файлах допустима). SPEC §11:622.
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
  const bytes = content instanceof Uint8Array ? content : Uint8Array.from(content);
  return new TextDecoder().decode(bytes);
}

function zipText(bytes: Uint8Array, path: string): string {
  const container = cfb.read(bytes, { type: 'array' });
  const entry = cfb.find(container, '/' + path);
  if (!entry) throw new Error(`not found in zip: ${path}`);
  return toText(entry.content);
}

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

const PANE2 = '<pane ySplit="2" topLeftCell="A3" state="frozen"/>';

describe('ТК 10 (SPEC §8:406): шаблон §6 читается обратно без danger, 2 шага, 9 колонок', () => {
  it('T1: сценарий из шаблона — без danger/I01/I02, summary, метаданные, блок 1', async () => {
    const bytes = await buildTemplate();
    const r = await readBook(bytes, TEMPLATE_FILE_NAME);

    expect(r.report.some((row) => row.level === 'danger')).toBe(false);
    expect(r.report.some((row) => row.code === 'I01' || row.code === 'I02')).toBe(false);
    expect(r.summary).toEqual({ sheets: 1, blocks: 1, steps: 2, withLink: 1, withNode: 2 });
    // Пример 2 (фикстура 2.3 → id «1.2») без ссылки — W02 (SPEC §3.5:185); I03 —
    // единственная книжная строка про снимок карты snp (SPEC §3.5:191). Оба узла
    // примеров есть в src/data/pm/snp.json (снимок от 17.09.2026) — W04 нет.
    expect(r.report).toEqual([
      {
        level: 'warning',
        code: 'W02',
        sheet: 'Блок 1',
        row: 4,
        message: ru.report.codes.W02(),
      },
      {
        level: 'info',
        code: 'I03',
        sheet: '',
        row: null,
        message: ru.report.codes.I03('SNP', '17.09.2026'),
      },
    ]);

    const scenario = r.scenario;
    expect(scenario).toBeDefined();
    if (!scenario) throw new Error('scenario missing');
    // Литералы §6:370 «Название | Новый сценарий», «Модуль | SNP», «Карта | snp».
    expect(scenario.title).toBe('Новый сценарий');
    expect(scenario.module).toBe('SNP');
    expect(scenario.map).toBe('snp');
    // §6:371 «A1 — Название блока».
    expect(scenario.blocks[0]).toMatchObject({ n: 1, sheet: 'Блок 1', title: 'Название блока' });
  });

  it('T2: шаг 1 = фикстура 1.1, шаг 2 = фикстура 2.3 с id «1.2» и пустой ссылкой', async () => {
    const bytes = await buildTemplate();
    const r = await readBook(bytes, TEMPLATE_FILE_NAME);
    const steps = r.scenario?.blocks[0]?.steps;
    expect(steps?.[0]).toEqual(fixtureStep('1.1'));
    expect(steps?.[1]).toEqual({ ...fixtureStep('2.3'), id: '1.2' });
    expect(steps?.[1]?.url).toBe('');
  });
});

describe('T3 (решение владельца 18.09.2026): ru.template.examples сверен с фикстурой', () => {
  it('ru.template.examples — [шаг 1.1, шаг 2.3 с id «1.2»]', () => {
    expect(ru.template.examples).toEqual([
      fixtureStep('1.1'),
      { ...fixtureStep('2.3'), id: '1.2' },
    ]);
  });
});

describe('T4 (SPEC §6:368): имя файла шаблона', () => {
  it('TEMPLATE_FILE_NAME === «Шаблон демо-сценария.xlsx»', () => {
    expect(TEMPLATE_FILE_NAME).toBe('Шаблон демо-сценария.xlsx');
  });
});

describe('T5 (SPEC §6:366-372): порядок листов шаблона', () => {
  it('_Сценарий, Блок 1, _Инструкция', async () => {
    const bytes = await buildTemplate();
    const wb = read(bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual(['_Сценарий', 'Блок 1', '_Инструкция']);
  });
});

describe('T6 (SPEC §6:370): лист _Сценарий — Название/Модуль/Карта', () => {
  it('строки колонки A/B ровно три, в этом порядке', async () => {
    const bytes = await buildTemplate();
    const wb = read(bytes, { type: 'array' });
    const ws = wb.Sheets[SCENARIO_SHEET];
    if (!ws) throw new Error('_Сценарий missing');
    const rows = utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, blankrows: false });
    expect(rows).toEqual([
      ['Название', 'Новый сценарий'],
      ['Модуль', 'SNP'],
      ['Карта', 'snp'],
    ]);
  });
});

describe('T7 (SPEC §6:371): лист «Блок 1» — название блока, 9 заголовков, !ref', () => {
  it('A1 — «Название блока», строка 2 — 9 заголовков §3.2, !ref = A1:I500', async () => {
    const bytes = await buildTemplate();
    const wb = read(bytes, { type: 'array' });
    const ws = wb.Sheets['Блок 1'];
    if (!ws) throw new Error('Блок 1 missing');
    expect(ws.A1?.v).toBe('Название блока');
    const rows = utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
    expect(rows[1]).toEqual([
      '№ шага',
      'Шаг',
      'Действие',
      'Экран',
      'Ссылка',
      'Бизнес-ценность',
      'Ожидаемый результат',
      'Комментарий',
      'Узел карты',
    ]);
    expect(ws['!ref']).toBe('A1:I500');
  });
});

describe('T8 (SPEC §6:371): ширины колонок «Блок 1»', () => {
  it('10, 36, 48, 28, 40, 60, 40, 30, 40', async () => {
    const bytes = await buildTemplate();
    const wb = read(bytes, { type: 'array', cellStyles: true });
    const cols = wb.Sheets['Блок 1']?.['!cols'] ?? [];
    expect(cols.map((c) => c.wch)).toEqual([10, 36, 48, 28, 40, 60, 40, 30, 40]);
  });
});

describe('T9 (SPEC §6:371): колонка A строк 3-500 «Блок 1» — текстовый формат «@»', () => {
  it('A3, A4, A50, A500 — z:"@"; A501 нет; B3 не «@»', async () => {
    const bytes = await buildTemplate();
    const wb = read(bytes, { type: 'array', cellNF: true, sheetStubs: true });
    const ws = wb.Sheets['Блок 1'];
    expect(ws?.A3?.z).toBe('@');
    expect(ws?.A4?.z).toBe('@');
    expect(ws?.A50?.z).toBe('@');
    expect(ws?.A500?.z).toBe('@');
    expect(ws?.A501).toBeUndefined();
    expect(ws?.B3?.z).not.toBe('@');
  });
});

describe('T10 (SPEC §6:371, §11:622, решение DN-akk): строка 2 «Блок 1» закреплена', () => {
  it('PANE2 в XML «Блок 1»; у _Сценарий и _Инструкция <pane нет', async () => {
    const bytes = await buildTemplate();
    expect(sheetXml(bytes, 'Блок 1')).toContain(PANE2);
    expect(sheetXml(bytes, '_Сценарий')).not.toContain('<pane');
    expect(sheetXml(bytes, '_Инструкция')).not.toContain('<pane');
  });
});

describe('T11 (SPEC §6:372): лист _Инструкция — таблица колонок и правила листов', () => {
  it('строка 1 — заголовки таблицы, строки 2-10 — 9 колонок COLUMNS, ниже — templateRules', async () => {
    const bytes = await buildTemplate();
    const wb = read(bytes, { type: 'array' });
    const ws = wb.Sheets['_Инструкция'];
    if (!ws) throw new Error('_Инструкция missing');
    const rows = utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });

    expect(rows[0]).toEqual(['Колонка', 'Обязательна', 'Что писать']);

    const columnRows = rows.slice(1, 1 + COLUMNS.length);
    expect(columnRows.map((r) => r[0])).toEqual(COLUMNS.map((c) => c.header));
    expect(columnRows.map((r) => r[1])).toEqual(COLUMNS.map((c) => (c.required ? 'да' : 'нет')));
    for (const r of columnRows) {
      expect((r[2] ?? '').trim().length).toBeGreaterThan(0);
    }

    const columnACells = rows.map((r) => r[0]);
    for (const rule of ru.importModal.templateRules) {
      expect(columnACells).toContain(rule);
    }
  });
});

describe('T12: детерминизм buildTemplate', () => {
  it('два вызова дают побайтово равные байты', async () => {
    const first = await buildTemplate();
    const second = await buildTemplate();
    expect(Buffer.from(second)).toEqual(Buffer.from(first));
  });
});

describe('T13: SCENARIO_KEYS — read.ts понимает все три ключа _Сценарий', () => {
  it('Название/Модуль/Карта читаются обратно для MRP', async () => {
    const bytes = await writeWorkbook([
      scenarioSheet({ title: 'Т', module: 'MRP', map: 'mrp' }),
      blockSheet('Блок 1', 'Б', [fixtureStep('1.1')]),
    ]);
    const r = await readBook(bytes, 'x.xlsx');
    expect(r.scenario?.title).toBe('Т');
    expect(r.scenario?.module).toBe('MRP');
    expect(r.scenario?.map).toBe('mrp');
  });
});

describe('T14: константы шаблона', () => {
  it('SCENARIO_SHEET === "_Сценарий" (SPEC §3.2:109)', () => {
    expect(SCENARIO_SHEET).toBe('_Сценарий');
  });

  it('SCENARIO_KEYS === {title:"Название", module:"Модуль", map:"Карта"} (SPEC §3.2:109)', () => {
    expect(SCENARIO_KEYS).toEqual({ title: 'Название', module: 'Модуль', map: 'Карта' });
  });

  it('blockSheet("Блок 1","Т",[]) — colWidths/textRanges/freezeRows по SPEC §6:371', () => {
    expect(blockSheet('Блок 1', 'Т', [])).toMatchObject({
      colWidths: [10, 36, 48, 28, 40, 60, 40, 30, 40],
      textRanges: ['A3:A500'],
      freezeRows: 2,
    });
  });
});
