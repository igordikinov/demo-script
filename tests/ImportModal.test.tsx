// Окно загрузки A4 — SPEC §4.8 (:329-350) без блока совпадения названия A4′
// (§4.8:341-346 — DN-25, здесь не проверяется). Решение владельца 18.09.2026
// (bd DN-14): нажатие «Добавить в мои» не пишет в «Мои» (библиотеки ещё нет,
// DN-25) — closeModal → openScenario на первом шаге → тост
// ru.importModal.added(steps). ТК 19 — SPEC §8:415, дословно.
//
// Эталон содержания сценария — tests/fixtures/deployment-demo.json/.xlsx
// (CLAUDE.md: не придумывать содержание). Числа сводки {3 листа, 3 блока,
// 29 шагов, 24 со ссылкой, 26 с узлом} и 6 строк отчёта (5×W02 + I03) —
// tests/fixture.test.ts (ТК 1, SPEC §8:397), не изобретены заново.
//
// import.meta.url — в переменную до new URL(): в jsdom-окружении Vite иначе
// подставляет вместо файлового URL адрес self.location, см.
// tests/StepCard.test.tsx:28-36.
//
// readWorkbook/loadXlsx оборачиваются vi.fn(orig) (не vi.doMock — нужен
// персистентный счётчик вызовов на весь файл, включая внутренние вызовы из
// компонента).
vi.mock('../src/excel/read', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/excel/read')>();
  return { ...actual, readWorkbook: vi.fn(actual.readWorkbook) };
});
vi.mock('../src/excel/xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/excel/xlsx')>();
  return { ...actual, loadXlsx: vi.fn(actual.loadXlsx) };
});

import type { Dispatch } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppShell } from '../src/App';
import { StoreProvider } from '../src/state/store';
import {
  appReducer,
  createInitialState,
  type AppAction,
  type AppState,
} from '../src/state/reducer';
import { useAppStore } from '../src/state/context';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import { ru } from '../src/i18n/ru';
import { writeWorkbook, type SheetSpec } from '../src/excel/write';
import { COLUMNS } from '../src/excel/columns';
import { readWorkbook } from '../src/excel/read';
import { loadXlsx } from '../src/excel/xlsx';
import { XLSX_MIME_TYPE } from '../src/components/ui/download';
import fixtureJson from './fixtures/deployment-demo.json';

const importMetaUrl = import.meta.url;

const fixture = fixtureJson as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

/** Копия хелпера tests/Header.test.tsx:29-47 — общий вынести нельзя (риск мёржа с DN-16/DN-25). */
function buildScenario(id: string, source: 'repo' | 'local'): Scenario {
  const clone = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  return ScenarioSchema.parse({
    schema: 1,
    id,
    source,
    title: clone.title,
    module: clone.module,
    map: clone.map,
    fileName: 'deployment-demo.xlsx',
    loadedAt: '2026-09-16T00:00:00Z',
    blocks: clone.blocks.map((b, i) => ({
      n: i + 1,
      title: b.title,
      sheet: `Блок ${i + 1}`,
      steps: b.steps,
    })),
  });
}

interface ProbeSnapshot {
  scenarioId: string | null;
  stepId: string | null;
  modal: { kind: string } | null;
  toast: string | null;
}

/** Зонд состояния — по образцу tests/Header.test.tsx:52-64/tests/App.test.tsx:67-71. */
function Probe({ capture }: { capture?: (dispatch: Dispatch<AppAction>) => void }) {
  const { state, dispatch } = useAppStore();
  capture?.(dispatch);
  const snapshot: ProbeSnapshot = {
    scenarioId: state.scenario?.id ?? null,
    stepId: state.stepId,
    modal: state.modal,
    toast: state.toast?.message ?? null,
  };
  // <pre>, не <output>: implicit ARIA role у <output> — "status", что даёт
  // 2 совпадения на screen.getByRole('status') рядом с live-регионом Toast
  // (src/components/ui/Toast.tsx:60).
  return <pre data-testid="state-probe">{JSON.stringify(snapshot)}</pre>;
}

function renderApp(initialState?: AppState): void {
  render(
    <StoreProvider initialState={initialState}>
      <AppShell />
      <Probe />
    </StoreProvider>,
  );
}

function probeState(): ProbeSnapshot {
  return JSON.parse(screen.getByTestId('state-probe').textContent ?? '{}') as ProbeSnapshot;
}

function uploadButton(): HTMLElement {
  return screen.getByRole('button', { name: ru.header.upload });
}

/** Клик по кнопке шапки, дожидается появления диалога (SPEC §4.8:329).
 * .focus() перед click — как в tests/Modal.test.tsx:184-185: jsdom не переводит
 * фокус на элемент при клике сам по себе, а возврат фокуса на кнопку после
 * закрытия (SPEC §4.8:329) проверяется через сравнение с document.activeElement. */
function openImportDialog(): Promise<HTMLElement> {
  const trigger = uploadButton();
  trigger.focus();
  fireEvent.click(trigger);
  return screen.findByRole('dialog', { name: ru.importModal.title });
}

function fileInput(dialog: HTMLElement): HTMLInputElement {
  const el = dialog.querySelector('input[type="file"]');
  if (!(el instanceof HTMLInputElement)) throw new Error('input[type=file] не найден в диалоге');
  return el;
}

function selectFile(dialog: HTMLElement, file: File): void {
  fireEvent.change(fileInput(dialog), { target: { files: [file] } });
}

function reportTableOf(dialog: HTMLElement): HTMLTableElement {
  const table = within(dialog)
    .getByRole('columnheader', { name: ru.importModal.reportColumns.level })
    .closest('table');
  if (!table) throw new Error('таблица отчёта не найдена');
  return table;
}

function sheetTableOf(dialog: HTMLElement): HTMLTableElement {
  const table = within(dialog)
    .getByRole('columnheader', { name: ru.importModal.sheetColumns.steps })
    .closest('table');
  if (!table) throw new Error('таблица листов не найдена');
  return table;
}

/** Строки таблицы без строки заголовков (та тоже role="row"). */
function bodyRows(table: HTMLTableElement): HTMLElement[] {
  return within(table).getAllByRole('row').slice(1);
}

function cellTexts(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent?.trim() ?? '');
}

async function bookFile(sheets: SheetSpec[], name: string): Promise<File> {
  const bytes = await writeWorkbook(sheets);
  // .slice(): Uint8Array<ArrayBufferLike>, отданный writeWorkbook, не подходит
  // под BlobPart без свежего ArrayBuffer.
  return new File([bytes.slice()], name);
}

/** Книга с E04 (§8:415): пустой «Шаг» в строке 1.1. */
const E04_SHEETS: SheetSpec[] = [
  {
    name: 'Блок 1',
    rows: [
      ['№ шага', 'Шаг', 'Ссылка'],
      ['1.1', '', 'https://a.example'],
      ['1.2', 'B', 'https://b.example'],
    ],
  },
];

function warnSheets(): SheetSpec[] {
  return [{ name: 'Блок 1', rows: [COLUMNS.map((col) => col.header), ['1.1', 'Первый шаг']] }];
}

function rSheets(count: number): SheetSpec[] {
  const rows: (string | number)[][] = [['№ шага', 'Шаг']];
  for (let i = 1; i <= count; i += 1) {
    rows.push([`1.${i}`, `Шаг ${i}`]);
  }
  return [{ name: 'Блок 1', rows }];
}

const XLS = new File(['x'], 'old.xls');

const FIX_BYTES = readFileSync(
  fileURLToPath(new URL('./fixtures/deployment-demo.xlsx', importMetaUrl)),
);

function freshFixFile(): File {
  return new File([FIX_BYTES], 'deployment-demo.xlsx');
}

const FIX_SUMMARY_TEXT = ru.summary.text({ sheets: 3, blocks: 3, steps: 29, withLink: 24 });

/** Строки без ссылки во фикстуре (tests/fixture.test.ts:62-68, ТК 1) — не выдумано заново. */
const FIX_NO_LINK_ROWS: readonly { sheet: string; row: number }[] = [
  { sheet: 'Блок 2', row: 5 },
  { sheet: 'Блок 2', row: 13 },
  { sheet: 'Блок 3', row: 5 },
  { sheet: 'Блок 3', row: 8 },
  { sheet: 'Блок 3', row: 9 },
];

const FIX_REPORT_ROWS: string[][] = [
  ...FIX_NO_LINK_ROWS.map(({ sheet, row }) => [
    ru.report.levels.warning,
    sheet,
    String(row),
    ru.report.codes.W02(),
  ]),
  [ru.report.levels.info, '', ru.report.noRow, ru.report.codes.I03('SNP', '17.09.2026')],
];

const FIX_SHEET_ROWS: string[][] = fixture.blocks.map((block, i) => [
  ru.importModal.blockRow(i + 1, block.title),
  String(block.steps.length),
]);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Открытие окна (SPEC §4.8:329, §1:20)', () => {
  it('заголовок, крестик, зона в фокусе, шаблон без шага 2, primary disabled', async () => {
    renderApp();
    const dialog = await openImportDialog();

    const closeButton = within(dialog).getByRole('button', { name: ru.importModal.close });
    expect(closeButton).toHaveAttribute('title', ru.importModal.close);

    const zone = within(dialog).getByRole('button', { name: ru.importModal.dropPrompt });
    expect(zone).toHaveAccessibleDescription(ru.importModal.dropHint);
    await waitFor(() => expect(zone).toHaveFocus());

    expect(fileInput(dialog)).toHaveAttribute('accept', '.xlsx');

    expect(within(dialog).queryByText(ru.importModal.step2)).not.toBeInTheDocument();

    const submit = within(dialog).getByRole('button', { name: ru.importModal.submitAdd });
    expect(submit).toBeDisabled();
    expect(within(dialog).queryByText(ru.importModal.fixErrors)).not.toBeInTheDocument();

    const items = within(dialog).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(ru.importModal.templateRules);

    expect(loadXlsx).toHaveBeenCalled();
  });
});

const CLOSE_CASES: readonly [string, (dialog: HTMLElement) => void][] = [
  ['Esc', () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })],
  [
    'клик по фону',
    (dialog) => {
      const overlay = dialog.parentElement;
      if (!overlay) throw new Error('оверлей не найден');
      fireEvent.click(overlay);
    },
  ],
  [
    '«Отмена»',
    (dialog) => {
      fireEvent.click(within(dialog).getByRole('button', { name: ru.importModal.cancel }));
    },
  ],
  [
    'крестик',
    (dialog) => {
      fireEvent.click(within(dialog).getByRole('button', { name: ru.importModal.close }));
    },
  ],
];

describe.each(CLOSE_CASES)('закрытие окна: %s (SPEC §4.8:329)', (_label, close) => {
  it('диалог исчезает, фокус возвращается на кнопку шапки', async () => {
    renderApp();
    const trigger = uploadButton();
    const dialog = await openImportDialog();

    close(dialog);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('Клик по зоне (SPEC §4.8:331)', () => {
  it('вызывает клик по скрытому input[type=file] ровно один раз', async () => {
    renderApp();
    const dialog = await openImportDialog();
    const clickSpy = vi.spyOn(fileInput(dialog), 'click');

    fireEvent.click(within(dialog).getByRole('button', { name: ru.importModal.dropPrompt }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

describe('XLS → E01 без чтения книги (SPEC §4.8:337)', () => {
  it('отчёт из одной строки E01; readWorkbook и FileReader не вызываются', async () => {
    const readAsArrayBuffer = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
    renderApp();
    const dialog = await openImportDialog();

    selectFile(dialog, XLS);
    await within(dialog).findByText(ru.importModal.step2);

    const rows = bodyRows(reportTableOf(dialog));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error('строка отчёта не найдена');
    const badge = within(row).getByText(ru.report.levels.danger);
    expect(badge).toHaveAttribute('data-tone', 'danger');
    expect(cellTexts(row)).toEqual([
      ru.report.levels.danger,
      '',
      ru.report.noRow,
      ru.report.codes.E01(),
    ]);

    expect(readWorkbook).not.toHaveBeenCalled();
    expect(readAsArrayBuffer).not.toHaveBeenCalled();

    const zone = within(dialog).getByRole('button', { name: 'old.xls' });
    expect(zone).toHaveAccessibleDescription(ru.importModal.reselectHint);

    expect(within(dialog).getByRole('button', { name: ru.importModal.submitAdd })).toBeDisabled();
    expect(within(dialog).getByText(ru.importModal.fixErrors)).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('columnheader', { name: ru.importModal.sheetColumns.steps }),
    ).not.toBeInTheDocument();

    expect(
      within(dialog).getByText(ru.summary.text({ sheets: 0, blocks: 0, steps: 0, withLink: 0 })),
    ).toBeInTheDocument();
  });
});

describe('Состояние «Проверяю файл…» (SPEC §4.8:331, §4.8:337)', () => {
  it('сразу после выбора — checking без описания и без шага 2, затем результат разбора', async () => {
    renderApp();
    const dialog = await openImportDialog();

    selectFile(dialog, freshFixFile());

    const checkingZone = within(dialog).getByRole('button', { name: ru.importModal.checking });
    expect(checkingZone).not.toHaveAccessibleDescription();
    // Строка подсказки остаётся — пустая и скрытая от чтения: она держит высоту зоны.
    const hintSlot = checkingZone.querySelector('span[aria-hidden="true"]');
    expect(hintSlot).not.toBeNull();
    expect(hintSlot).toBeEmptyDOMElement();
    expect(within(dialog).queryByText(ru.importModal.step2)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: ru.importModal.submitAdd })).toBeDisabled();

    await within(dialog).findByText(FIX_SUMMARY_TEXT);
    const doneZone = within(dialog).getByRole('button', { name: 'deployment-demo.xlsx' });
    expect(doneZone).toHaveAccessibleDescription(ru.importModal.checkedOk);
  });
});

describe('Чистый файл (deployment-demo.xlsx) — SPEC §4.8:339, ТК 1 (§8:397)', () => {
  it('таблица листов, 6 строк отчёта в порядке листов, primary активна, без прокрутки', async () => {
    renderApp();
    const dialog = await openImportDialog();

    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);

    const sheetRows = bodyRows(sheetTableOf(dialog)).map(cellTexts);
    expect(sheetRows).toEqual(FIX_SHEET_ROWS);

    const reportTable = reportTableOf(dialog);
    const reportRows = bodyRows(reportTable).map(cellTexts);
    expect(reportRows).toEqual(FIX_REPORT_ROWS);
    expect(reportTable.parentElement).not.toHaveAttribute('data-scroll');

    expect(within(dialog).queryByText(ru.importModal.fixErrors)).not.toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: ru.importModal.submitAdd });
    await waitFor(() => expect(submit).toBeEnabled());
  });
});

describe('Нажатие primary после чистого файла (SPEC §4.8:350, решение владельца 18.09.2026)', () => {
  it('окно закрывается, сценарий открыт на первом шаге, тост «добавлен», фокус на кнопке шапки', async () => {
    renderApp();
    const trigger = uploadButton();
    const dialog = await openImportDialog();

    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);
    const submit = within(dialog).getByRole('button', { name: ru.importModal.submitAdd });
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.click(submit);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(ru.importModal.added(29));
    expect(within(screen.getByRole('banner')).getByText(fixture.title)).toBeInTheDocument();

    const probe = probeState();
    expect(probe.stepId).toBe('1.1');
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('ТК 19 (SPEC §8:415, дословно)', () => {
  it('файл с E04 → «Добавить в мои» disabled, подсказка видна; «Отмена» — прежний сценарий на месте', async () => {
    const scenario = buildScenario('deployment-demo', 'repo');
    const initialState = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '1.10',
    });
    renderApp(initialState);

    const dialog = await openImportDialog();
    selectFile(dialog, await bookFile(E04_SHEETS, 'bad.xlsx'));
    await within(dialog).findByText(ru.importModal.fixErrors);

    const rows = bodyRows(reportTableOf(dialog));
    const firstRow = rows[0];
    if (!firstRow) throw new Error('строка отчёта не найдена');
    expect(cellTexts(firstRow)).toEqual([
      ru.report.levels.danger,
      'Блок 1',
      '2',
      ru.report.codes.E04(),
    ]);

    const submit = within(dialog).getByRole('button', { name: ru.importModal.submitAdd });
    expect(submit).toBeDisabled();

    const zone = within(dialog).getByRole('button', { name: 'bad.xlsx' });
    expect(zone).toHaveAccessibleDescription(ru.importModal.reselectHint);

    expect(
      within(dialog).queryByRole('columnheader', { name: ru.importModal.sheetColumns.steps }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(ru.summary.text({ sheets: 1, blocks: 1, steps: 2, withLink: 2 })),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: ru.importModal.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const probe = probeState();
    expect(probe.scenarioId).toBe('deployment-demo');
    expect(probe.stepId).toBe('1.10');
    expect(probe.toast).toBeNull();
  });
});

describe('Книга только с предупреждением (SPEC §4.8:331 — «Файл проверен без ошибок»)', () => {
  it('описание зоны checkedOk (не reselectHint), primary активна, fixErrors нет', async () => {
    renderApp();
    const dialog = await openImportDialog();

    selectFile(dialog, await bookFile(warnSheets(), 'warn.xlsx'));
    await within(dialog).findByText(ru.importModal.step2);

    const zone = within(dialog).getByRole('button', { name: 'warn.xlsx' });
    expect(zone).toHaveAccessibleDescription(ru.importModal.checkedOk);

    expect(within(dialog).queryByText(ru.importModal.fixErrors)).not.toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: ru.importModal.submitAdd });
    await waitFor(() => expect(submit).toBeEnabled());
  });
});

describe('Пилюли уровня — только по-русски (SPEC §3.5:193, §11:623)', () => {
  it('«ошибка»/«предупреждение»/«информация» видны, danger/warning/info в тексте нет', async () => {
    renderApp();
    const dialog = await openImportDialog();

    selectFile(dialog, await bookFile(E04_SHEETS, 'bad.xlsx'));
    await within(dialog).findByText(ru.importModal.fixErrors);
    const dangerTable = reportTableOf(dialog);
    expect(dangerTable.textContent ?? '').not.toMatch(/\bdanger\b|\bwarning\b|\binfo\b/);
    expect(dangerTable.textContent).toContain(ru.report.levels.danger);
    expect(dangerTable.textContent).toContain(ru.report.levels.info);

    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(FIX_SUMMARY_TEXT);
    const warnTable = reportTableOf(dialog);
    expect(warnTable.textContent ?? '').not.toMatch(/\bdanger\b|\bwarning\b|\binfo\b/);
    expect(warnTable.textContent).toContain(ru.report.levels.warning);
    expect(warnTable.textContent).toContain(ru.report.levels.info);
  });
});

describe.each([
  ['R12 (12 строк)', 4, undefined],
  ['R13 (13 строк)', 5, 'true'],
] as const)('прокрутка отчёта длиннее 12 строк (SPEC §4.8:339): %s', (_label, steps, scroll) => {
  it('data-scroll на обёртке таблицы отчёта', async () => {
    renderApp();
    const dialog = await openImportDialog();

    selectFile(dialog, await bookFile(rSheets(steps), `r${String(steps)}.xlsx`));
    await within(dialog).findByText(ru.importModal.step2);

    const wrapper = reportTableOf(dialog).parentElement;
    if (scroll === undefined) {
      expect(wrapper).not.toHaveAttribute('data-scroll');
    } else {
      expect(wrapper).toHaveAttribute('data-scroll', scroll);
    }
  });
});

describe('Перетаскивание файла (SPEC §4.8:331 — «работает перетаскивание»)', () => {
  it('dragOver отменяет действие по умолчанию; drop с файлом даёт результат разбора', async () => {
    renderApp();
    const dialog = await openImportDialog();
    const zone = within(dialog).getByRole('button', { name: ru.importModal.dropPrompt });

    const dragOverNotCancelled = fireEvent.dragOver(zone);
    expect(dragOverNotCancelled).toBe(false);

    fireEvent.drop(zone, { dataTransfer: { files: [freshFixFile()] } });
    await within(dialog).findByText(FIX_SUMMARY_TEXT);
  });
});

describe('Повторный выбор файла (SPEC §4.8:331 — «выбрать исправленный файл»)', () => {
  it('после E04 выбор чистого файла убирает «ошибка», активирует primary', async () => {
    renderApp();
    const dialog = await openImportDialog();

    selectFile(dialog, await bookFile(E04_SHEETS, 'bad.xlsx'));
    await within(dialog).findByText(ru.importModal.fixErrors);

    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(FIX_SUMMARY_TEXT);

    expect(within(dialog).queryByText(ru.report.levels.danger)).not.toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: ru.importModal.submitAdd });
    await waitFor(() => expect(submit).toBeEnabled());
  });
});

describe('Сбой загрузки SheetJS (SPEC §1:20 — SheetJS только через loadXlsx)', () => {
  it('зона возвращается к dropPrompt, шаг 2 пропадает, primary остаётся disabled', async () => {
    vi.mocked(readWorkbook).mockRejectedValueOnce(new Error('chunk'));
    renderApp();
    const dialog = await openImportDialog();

    selectFile(dialog, freshFixFile());

    await within(dialog).findByRole('button', { name: ru.importModal.dropPrompt });
    expect(within(dialog).queryByText(ru.importModal.step2)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: ru.importModal.submitAdd })).toBeDisabled();
  });
});

describe('«Скачать шаблон» (SPEC §4.8:331, §6:368)', () => {
  it('Blob с TEMPLATE_FILE_NAME и XLSX_MIME_TYPE, revoke вызван, окно остаётся открытым', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tpl');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicks: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ download: this.download, href: this.href });
    });

    renderApp();
    const dialog = await openImportDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: ru.importModal.downloadTemplate }));

    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0]?.download).toBe(ru.template.fileName);
    expect(clicks[0]?.href).toBe('blob:tpl');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const call = createObjectURL.mock.calls[0];
    if (!call) throw new Error('createObjectURL не вызван');
    const blob = call[0] as Blob;
    expect(blob.type).toBe(XLSX_MIME_TYPE);
    expect(blob.size).toBeGreaterThan(0);

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:tpl'));
    expect(document.querySelector('a[download]')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
