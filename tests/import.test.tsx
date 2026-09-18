// «Мои»: запись при загрузке и совпадение названий (окно A4′) — SPEC §4.8:341-350,
// §3.6:203-205. ТК 27 (SPEC §8:423) и ТК 28 (SPEC §8:424), дословно.
//
// Адресная часть ТК 27 (?scenario=my-deployment-demo-scenariy&step=1.1) — DN-16,
// здесь не проверяется: адрес страницы ещё не пишется.
//
// Эталон содержания сценария — tests/fixtures/deployment-demo.json/.xlsx
// (CLAUDE.md: не придумывать содержание). Название фикстуры «Deployment —
// демо-сценарий» даёт id 'my-deployment-demo-scenariy' (SPEC §3.6:203) —
// см. tests/library.test.ts:26-28, уже закреплено там.
//
// Хелперы (buildScenario, openImportDialog, selectFile, freshFixFile, bookFile,
// rSheets, rowIds, seedLibrary, Probe) — копия приёма tests/ImportModal.test.tsx и
// tests/Catalog.test.tsx: общий модуль не заводим (риск мёржа с DN-16/DN-26).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Dispatch } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppShell } from '../src/App';
import { StoreProvider } from '../src/state/store';
import type { AppAction, AppState } from '../src/state/reducer';
import { useAppStore } from '../src/state/context';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import { toIndexItem } from '../src/model/scenarioIndex';
import { LIBRARY_KEY, type LibraryStorage } from '../src/state/library';
import type { FetchFn } from '../src/state/shared';
import { formatScenarioDate } from '../src/i18n/date';
import { ru } from '../src/i18n/ru';
import { writeWorkbook, type SheetSpec } from '../src/excel/write';
import {
  findDuplicate,
  numberedFreeTitle,
  titleKey,
} from '../src/components/ImportModal/duplicate';
import { appBanner } from './helpers';
import fixtureJson from './fixtures/deployment-demo.json';

const importMetaUrl = import.meta.url;

const fixture = fixtureJson as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

/** Часы StoreProvider — loadedAt «Моих» (SPEC §3.1:100) детерминирован. */
const NOW = new Date(2026, 8, 18, 12, 0);
const now = (): Date => NOW;

/** ISO конкретного локального момента — как tests/Catalog.test.tsx:40-42. */
function localIso(y: number, m: number, d: number, h: number, min: number): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

const FIX_TITLE = fixture.title;
/** SPEC §3.6:203: 'my-' + слаг названия фикстуры, см. tests/library.test.ts:26-28. */
const FIX_ID = 'my-deployment-demo-scenariy';
/** «15.09.2026» в интерфейсе (не «сегодня, ЧЧ:ММ») — SPEC §4.2:253. */
const OLD = localIso(2026, 9, 15, 12, 0);

interface ScenarioOverrides {
  id: string;
  loadedAt: string;
  title?: string;
  fileName?: string;
  source?: 'local' | 'repo';
}

/** Копия приёма tests/Catalog.test.tsx:58-80 — общий хелпер не заводим (риск мёржа). */
function buildScenario(overrides: ScenarioOverrides): Scenario {
  const clone = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  return ScenarioSchema.parse({
    schema: 1,
    id: overrides.id,
    source: overrides.source ?? 'local',
    title: overrides.title ?? clone.title,
    module: clone.module,
    map: clone.map,
    fileName: overrides.fileName ?? 'deployment-demo.xlsx',
    loadedAt: overrides.loadedAt,
    blocks: clone.blocks.map((b, i) => ({
      n: i + 1,
      title: b.title,
      sheet: `Блок ${i + 1}`,
      steps: b.steps,
    })),
  });
}

/** «Мой» с названием фикстуры, загружен 15.09.2026 (SPEC §4.8:341). */
const EXISTING = buildScenario({
  id: FIX_ID,
  loadedAt: OLD,
  fileName: 'Deployment_demo_v2.xlsx',
});

/** Другой «мой» — не участвует в совпадении названия. */
const OTHER = buildScenario({
  id: 'my-deploy-pilot',
  title: 'Дёплой — пилот',
  loadedAt: localIso(2026, 9, 17, 12, 0),
  fileName: 'pilot.xlsx',
});

function seedLibrary(items: readonly Scenario[]): void {
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify({ schema: 1, items }));
}

function readStoredLibrary(): { schema: number; items: Scenario[] } {
  const raw = window.localStorage.getItem(LIBRARY_KEY);
  if (raw === null) throw new Error('LIBRARY_KEY отсутствует в localStorage');
  return JSON.parse(raw) as { schema: number; items: Scenario[] };
}

interface LibraryProbeItem {
  id: string;
  title: string;
  loadedAt: string;
  fileName: string;
}

interface ProbeSnapshot {
  scenarioId: string | null;
  stepId: string | null;
  modal: { kind: string } | null;
  toast: string | null;
  library: LibraryProbeItem[];
}

/** Зонд состояния — по образцу tests/ImportModal.test.tsx:80-101, плюс список «Моих». */
function Probe({ capture }: { capture?: (dispatch: Dispatch<AppAction>) => void }) {
  const { state, dispatch } = useAppStore();
  capture?.(dispatch);
  const snapshot: ProbeSnapshot = {
    scenarioId: state.scenario?.id ?? null,
    stepId: state.stepId,
    modal: state.modal,
    toast: state.toast?.message ?? null,
    library: state.library.items.map(({ id, title, loadedAt, fileName }) => ({
      id,
      title,
      loadedAt,
      fileName,
    })),
  };
  return <pre data-testid="state-probe">{JSON.stringify(snapshot)}</pre>;
}

function probeState(): ProbeSnapshot {
  return JSON.parse(screen.getByTestId('state-probe').textContent ?? '{}') as ProbeSnapshot;
}

interface RenderOptions {
  initialState?: AppState;
  fetchFn?: FetchFn;
  storage?: LibraryStorage | null;
  capture?: (dispatch: Dispatch<AppAction>) => void;
}

function renderApp(opts: RenderOptions = {}): void {
  render(
    <StoreProvider
      initialState={opts.initialState}
      fetchFn={opts.fetchFn}
      storage={opts.storage}
      now={now}
    >
      <AppShell />
      <Probe capture={opts.capture} />
    </StoreProvider>,
  );
}

function uploadButton(): HTMLElement {
  // Скоуп на шапку A0 (tests/helpers.ts): пустые «Мои» (A5.1) рисуют свою
  // кнопку с тем же текстом (SPEC §4.2:255), а с открытым сценарием (DN-26)
  // второй <header> — заголовок StepCard внутри <article> — см.
  // tests/ImportModal.test.tsx:115-121.
  return within(appBanner()).getByRole('button', { name: ru.header.upload });
}

function openImportDialog(): Promise<HTMLElement> {
  fireEvent.click(uploadButton());
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

const FIX_BYTES = readFileSync(
  fileURLToPath(new URL('./fixtures/deployment-demo.xlsx', importMetaUrl)),
);

function freshFixFile(): File {
  return new File([FIX_BYTES], 'deployment-demo.xlsx');
}

async function bookFile(sheets: SheetSpec[], name: string): Promise<File> {
  const bytes = await writeWorkbook(sheets);
  // .slice(): Uint8Array<ArrayBufferLike>, отданный writeWorkbook, не подходит
  // под BlobPart без свежего ArrayBuffer (см. tests/ImportModal.test.tsx:171-176).
  return new File([bytes.slice()], name);
}

/** Книга без листа «_Сценарий» — название сценария = имя файла (SPEC §3.1:100). */
function rSheets(count: number): SheetSpec[] {
  const rows: (string | number)[][] = [['№ шага', 'Шаг']];
  for (let i = 1; i <= count; i += 1) {
    rows.push([`1.${i}`, `Шаг ${i}`]);
  }
  return [{ name: 'Блок 1', rows }];
}

function localSection(): HTMLElement {
  return screen.getByRole('region', { name: ru.catalog.localTitle });
}

/** id строк в порядке DOM — контракт tests/Catalog.test.tsx:201-206. */
function rowIds(section: HTMLElement): string[] {
  return [...section.querySelectorAll('tr[data-scenario-id]')].map(
    (tr) => tr.getAttribute('data-scenario-id') ?? '',
  );
}

function replaceRadio(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByRole('radio', { name: ru.importModal.replaceOption });
}

function addNewRadio(dialog: HTMLElement, newTitle: string): HTMLElement {
  return within(dialog).getByRole('radio', { name: ru.importModal.addAsNewOption(newTitle) });
}

/** Ждёт, что primary включена, и кликает по ней (совпадение уже разобрано). */
async function submitAfterCheck(dialog: HTMLElement, label: string): Promise<void> {
  const submit = within(dialog).getByRole('button', { name: label });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
}

describe('duplicate.ts — чистые функции (SPEC §4.8:341, :344)', () => {
  const X = buildScenario({ id: 'my-x', title: 'X', loadedAt: OLD });
  const xPadded = buildScenario({ id: 'my-x-pad', title: 'x ', loadedAt: OLD });

  it('titleKey: регистр и пробелы по краям не важны (SPEC §4.8:341)', () => {
    expect(titleKey('  ДЕМО ')).toBe('демо');
  });

  it('findDuplicate: первый в порядке списка с тем же titleKey, иначе undefined', () => {
    expect(findDuplicate([X, xPadded], ' X')).toBe(X);
    expect(findDuplicate([X, xPadded], 'Y')).toBeUndefined();
  });

  it('numberedFreeTitle: первый свободный суффикс среди «Моих» (SPEC §4.8:344)', () => {
    expect(numberedFreeTitle([X], 'X')).toBe(ru.importModal.numberedTitle('X', 2));
    expect(
      numberedFreeTitle([X, buildScenario({ id: 'my-x-2', title: 'X (2)', loadedAt: OLD })], 'X'),
    ).toBe(ru.importModal.numberedTitle('X', 3));
    expect(
      numberedFreeTitle([X, buildScenario({ id: 'my-x-2', title: 'x (2)', loadedAt: OLD })], 'X'),
    ).toBe(ru.importModal.numberedTitle('X', 3));
    expect(
      numberedFreeTitle([X, buildScenario({ id: 'my-x-3', title: 'X (3)', loadedAt: OLD })], 'X'),
    ).toBe(ru.importModal.numberedTitle('X', 2));
  });
});

describe('ТК 27 — SPEC §8:423 (без адреса, DN-16)', () => {
  it('загрузка нового файла → первая строка в «Моих», сценарий открыт; повтор с другим названием — id без конфликтов', async () => {
    let capturedDispatch: Dispatch<AppAction> | null = null;
    renderApp({
      capture: (dispatch) => {
        capturedDispatch = dispatch;
      },
    });

    const dialog = await openImportDialog();
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);

    // «Мои» пусты — совпадений нет, primary без «Заменить/Добавить» (SPEC §4.8:344).
    expect(within(dialog).queryByRole('radiogroup')).not.toBeInTheDocument();
    await submitAfterCheck(dialog, ru.importModal.submitAdd);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const probe = probeState();
    expect(probe.scenarioId).toBe(FIX_ID);
    expect(probe.stepId).toBe('1.1');
    expect(probe.toast).toBe(ru.importModal.added(29));
    expect(probe.library.map((item) => item.id)).toEqual([FIX_ID]);

    const stored = readStoredLibrary();
    expect(stored.items.map((item) => item.id)).toEqual([FIX_ID]);
    expect(stored.items[0]?.source).toBe('local');
    expect(stored.items[0]?.loadedAt).toBe(NOW.toISOString());

    if (capturedDispatch === null) throw new Error('Probe не отдал dispatch');
    act(() => {
      capturedDispatch?.({ type: 'closeScenario' });
    });
    expect(rowIds(localSection())[0]).toBe(FIX_ID);

    // Повтор: файл без листа «_Сценарий» → название = имя файла, слаг тот же,
    // что у FIX_ID (SPEC §3.1:100, §3.6:203) — id получает суффикс -2.
    const dialog2 = await openImportDialog();
    selectFile(dialog2, await bookFile(rSheets(2), 'Deployment demo scenariy.xlsx'));
    await within(dialog2).findByText(ru.importModal.step2);
    expect(within(dialog2).queryByRole('radiogroup')).not.toBeInTheDocument();
    await submitAfterCheck(dialog2, ru.importModal.submitAdd);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const probe2 = probeState();
    expect(probe2.scenarioId).toBe(`${FIX_ID}-2`);
    expect(probe2.toast).toBe(ru.importModal.added(2));
    expect(probe2.library.map((item) => item.id)).toEqual([`${FIX_ID}-2`, FIX_ID]);
  });
});

describe('ТК 28 — SPEC §8:424, дословно', () => {
  it('«Заменить его»: id прежний, элементов столько же, loadedAt новее', async () => {
    seedLibrary([OTHER, EXISTING]);
    renderApp();

    const dialog = await openImportDialog();
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);

    const expectedDate = formatScenarioDate(OLD, new Date());
    expect(
      within(dialog).getByRole('radiogroup', {
        name: ru.importModal.duplicate(FIX_TITLE, expectedDate),
      }),
    ).toBeInTheDocument();
    expect(replaceRadio(dialog)).toBeChecked();
    expect(addNewRadio(dialog, ru.importModal.numberedTitle(FIX_TITLE, 2))).not.toBeChecked();
    expect(
      within(dialog).getByRole('button', { name: ru.importModal.submitReplace }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: ru.importModal.submitAdd }),
    ).not.toBeInTheDocument();

    await submitAfterCheck(dialog, ru.importModal.submitReplace);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const probe = probeState();
    expect(probe.library.map((item) => item.id)).toEqual([FIX_ID, 'my-deploy-pilot']);
    const replaced = probe.library[0];
    if (replaced === undefined) throw new Error('заменённый элемент не найден');
    expect(replaced.fileName).toBe('deployment-demo.xlsx');
    expect(replaced.loadedAt).toBe(NOW.toISOString());
    expect(Date.parse(replaced.loadedAt)).toBeGreaterThan(Date.parse(OLD));

    const stored = readStoredLibrary();
    const storedReplaced = stored.items.find((item) => item.id === FIX_ID);
    expect(storedReplaced?.loadedAt).toBe(NOW.toISOString());

    expect(probe.scenarioId).toBe(FIX_ID);
    expect(probe.stepId).toBe('1.1');
    expect(probe.toast).toBe(ru.importModal.updated(29));
  });

  it('текст блока совпадения дословно, название в нём выделено (SPEC §4.8:341)', async () => {
    seedLibrary([OTHER, EXISTING]);
    renderApp();

    const dialog = await openImportDialog();
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);

    // Части строки склеиваются ровно в ru.importModal.duplicate — текст SPEC §4.8:341.
    const expectedDate = formatScenarioDate(OLD, new Date());
    const parts = ru.importModal.duplicateParts(FIX_TITLE, expectedDate);
    expect(`${parts.before}${parts.title}${parts.after}`).toBe(
      ru.importModal.duplicate(FIX_TITLE, expectedDate),
    );

    // Название — отдельным <b>, как `.notice b` в design/catalog-mockup.html:71, :225.
    const group = within(dialog).getByRole('radiogroup');
    const bold = group.querySelectorAll('b');
    expect(bold).toHaveLength(1);
    expect(bold[0]?.textContent).toBe(parts.title);
  });

  it('«Добавить как новый»: название с « (2)», новый id, прежний сценарий не изменён', async () => {
    seedLibrary([OTHER, EXISTING]);
    renderApp();

    const dialog = await openImportDialog();
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);

    const newTitle = ru.importModal.numberedTitle(FIX_TITLE, 2);
    fireEvent.click(addNewRadio(dialog, newTitle));
    await submitAfterCheck(dialog, ru.importModal.submitAddNew);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const probe = probeState();
    expect(probe.library).toHaveLength(3);
    const added = probe.library[0];
    expect(added).toEqual(expect.objectContaining({ id: `${FIX_ID}-2`, title: newTitle }));
    const untouched = probe.library.find((item) => item.id === FIX_ID);
    expect(untouched).toEqual(expect.objectContaining({ title: FIX_TITLE, loadedAt: OLD }));
    expect(probe.scenarioId).toBe(`${FIX_ID}-2`);
    expect(probe.toast).toBe(ru.importModal.added(29));
  });

  it('мой с названием общего сценария — блок совпадения не показывается (SPEC §4.8:346)', async () => {
    const sharedItem = toIndexItem(
      buildScenario({
        id: 'deployment-demo',
        source: 'repo',
        loadedAt: OLD,
        fileName: 'deployment-demo.xlsx',
      }),
    );
    const fetchFn: FetchFn = vi.fn(async (url: string) => {
      if (url === './scenarios/index.json') {
        return new Response(JSON.stringify({ schema: 1, builtAt: '', items: [sharedItem] }), {
          status: 200,
        });
      }
      return new Response('not found', { status: 404 });
    });
    renderApp({ fetchFn });

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: ru.catalog.sharedTitle })).getByText(FIX_TITLE),
      ).toBeInTheDocument(),
    );

    const dialog = await openImportDialog();
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);

    expect(within(dialog).queryByRole('radiogroup')).not.toBeInTheDocument();
    await submitAfterCheck(dialog, ru.importModal.submitAdd);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const probe = probeState();
    expect(probe.library).toEqual([expect.objectContaining({ id: FIX_ID, title: FIX_TITLE })]);
  });

  it('совпадение без учёта регистра и пробелов по краям (SPEC §4.8:341)', async () => {
    const existingLoose = buildScenario({
      id: FIX_ID,
      title: `  ${FIX_TITLE.toUpperCase()}  `,
      loadedAt: OLD,
    });
    seedLibrary([existingLoose]);
    renderApp();

    const dialog = await openImportDialog();
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);

    expect(within(dialog).getByRole('radiogroup')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: ru.importModal.submitReplace }),
    ).toBeInTheDocument();

    await submitAfterCheck(dialog, ru.importModal.submitReplace);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const probe = probeState();
    expect(probe.library).toHaveLength(1);
    expect(probe.library[0]?.id).toBe(FIX_ID);
  });

  it('первый свободный номер ищется среди «Моих» (SPEC §4.8:344)', async () => {
    const existingNumbered = buildScenario({
      id: `${FIX_ID}-2`,
      title: ru.importModal.numberedTitle(FIX_TITLE, 2),
      loadedAt: localIso(2026, 9, 16, 12, 0),
      fileName: 'v2.xlsx',
    });
    seedLibrary([EXISTING, existingNumbered]);
    renderApp();

    const dialog = await openImportDialog();
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);

    const newTitle = ru.importModal.numberedTitle(FIX_TITLE, 3);
    expect(
      within(dialog).getByRole('radio', { name: ru.importModal.addAsNewOption(newTitle) }),
    ).toBeInTheDocument();

    fireEvent.click(addNewRadio(dialog, newTitle));
    await submitAfterCheck(dialog, ru.importModal.submitAddNew);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const probe = probeState();
    const saved = probe.library.find((item) => item.id === `${FIX_ID}-3`);
    expect(saved?.title).toBe(newTitle);
    expect(probe.library.find((item) => item.id === FIX_ID)).toBeDefined();
  });

  it('переключение вариантов меняет подпись primary; новый выбор файла возвращает «Заменить его» (SPEC §4.8:343)', async () => {
    seedLibrary([EXISTING]);
    renderApp();

    const dialog = await openImportDialog();
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);

    const newTitle = ru.importModal.numberedTitle(FIX_TITLE, 2);
    expect(replaceRadio(dialog)).toBeChecked();

    fireEvent.click(addNewRadio(dialog, newTitle));
    expect(
      within(dialog).getByRole('button', { name: ru.importModal.submitAddNew }),
    ).toBeInTheDocument();

    fireEvent.click(replaceRadio(dialog));
    expect(
      within(dialog).getByRole('button', { name: ru.importModal.submitReplace }),
    ).toBeInTheDocument();

    fireEvent.click(addNewRadio(dialog, newTitle));
    expect(
      within(dialog).getByRole('button', { name: ru.importModal.submitAddNew }),
    ).toBeInTheDocument();

    // Новый выбор файла — тот же дубль пересчитан заново, выбор сброшен на «Заменить его» (SPEC §4.8:343).
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);
    expect(replaceRadio(dialog)).toBeChecked();
    expect(
      within(dialog).getByRole('button', { name: ru.importModal.submitReplace }),
    ).toBeInTheDocument();
  });
});

/** Хранилище, где чтение отдаёт seed-список, а запись всегда бросает квоту. */
function quotaStorage(items: readonly Scenario[]): LibraryStorage {
  const raw = JSON.stringify({ schema: 1, items });
  return {
    getItem: () => raw,
    setItem: () => {
      throw new DOMException('full', 'QuotaExceededError');
    },
    removeItem: () => undefined,
  };
}

const QUOTA_CASES: readonly [string, Scenario[], string][] = [
  ['добавление в пустые «Мои»', [], ru.importModal.submitAdd],
  ['замена при совпадении названия', [EXISTING], ru.importModal.submitReplace],
];

describe.each(QUOTA_CASES)('Квота при %s (SPEC §3.6:205)', (_label, seeded, submitLabel) => {
  it('окно остаётся открытым, тост про квоту, «Мои» не меняются', async () => {
    renderApp({ storage: quotaStorage(seeded) });
    const dialog = await openImportDialog();
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);

    await submitAfterCheck(dialog, submitLabel);

    await waitFor(() => expect(probeState().toast).toBe(ru.library.quotaExceeded));
    expect(screen.getByRole('dialog', { name: ru.importModal.title })).toBeInTheDocument();
    const probe = probeState();
    expect(probe.scenarioId).toBeNull();
    expect(probe.library.map((item) => item.id)).toEqual(seeded.map((item) => item.id));
  });
});

describe('«Отмена» после совпадения (SPEC §4.8:350)', () => {
  it('окно закрывается без изменений: хранилище, «Мои» и состояние прежние', async () => {
    seedLibrary([EXISTING]);
    renderApp();
    const before = window.localStorage.getItem(LIBRARY_KEY);

    const dialog = await openImportDialog();
    selectFile(dialog, freshFixFile());
    await within(dialog).findByText(ru.importModal.step2);
    expect(within(dialog).getByRole('radiogroup')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: ru.importModal.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(window.localStorage.getItem(LIBRARY_KEY)).toBe(before);
    const probe = probeState();
    expect(probe.library.map((item) => item.id)).toEqual([FIX_ID]);
    expect(probe.scenarioId).toBeNull();
    expect(probe.toast).toBeNull();
  });
});
