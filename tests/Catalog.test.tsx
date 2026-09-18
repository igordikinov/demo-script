// Каталог A5/A5.1 — SPEC §4.2:243-259, ТК 26 (SPEC §8:422) дословно, плюс
// UI-часть ТК 31 (SPEC §8:427: текст ошибки и «Повторить» в разделе, «Мои»
// открываются, после починки строки появились — состояние fetch/schema уже
// проверено tests/shared.test.tsx). Эталон содержания сценария —
// tests/fixtures/deployment-demo.json (CLAUDE.md: не придумывать содержание).
//
// Данные по разделам:
// - «Общие» — fetchFn отдаёт index.json с элементами S_MRP/S_DEPLOY/S_STAND (не
//   по алфавиту), S_DEPLOY получен toIndexItem() из настоящего сценария —
//   ./scenarios/deployment-demo.json отдаёт тот же сценарий (для открытия).
// - «Мои» — localStorage[LIBRARY_KEY] с M_OLD/M_NEW (порядок в сторе задаёт
//   readLibrary — по loadedAt, новые сверху, SPEC §3.6:204).
// - now = 18.09.2026 12:00; ISO-строки — через new Date(local…).toISOString(),
//   чтобы прогон не зависел от часового пояса машины (см. tests/date.test.ts).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppShell } from '../src/App';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import { toIndexItem, type ScenarioIndexItem } from '../src/model/scenarioIndex';
import { LIBRARY_KEY, type LibraryStorage } from '../src/state/library';
import type { FetchFn } from '../src/state/shared';
import { ru } from '../src/i18n/ru';
import { Catalog } from '../src/components/Catalog/Catalog';
import { downloadTemplate } from '../src/components/ui/download';
import fixtureJson from './fixtures/deployment-demo.json';

vi.mock('../src/components/ui/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/ui/download')>();
  return { ...actual, downloadTemplate: vi.fn(() => Promise.resolve()) };
});

const fixture = fixtureJson as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

/** ISO конкретного локального момента (без ручного вычисления смещения). */
function localIso(y: number, m: number, d: number, h: number, min: number): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

const now = (): Date => new Date(2026, 8, 18, 12, 0);

interface ScenarioOverrides {
  id: string;
  source: 'repo' | 'local';
  loadedAt: string;
  title?: string;
  module?: string;
  fileName?: string;
  /** Правит url конкретного шага по id — например, снять ссылку у 1.1 (M_OLD). */
  stepUrlOverrides?: Record<string, string>;
}

/** Копия приёма tests/Header.test.tsx:29-47, с точечной правкой url шага. */
function buildScenario(overrides: ScenarioOverrides): Scenario {
  const clone = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  return ScenarioSchema.parse({
    schema: 1,
    id: overrides.id,
    source: overrides.source,
    title: overrides.title ?? clone.title,
    module: overrides.module ?? clone.module,
    map: clone.map,
    fileName: overrides.fileName ?? 'deployment-demo.xlsx',
    loadedAt: overrides.loadedAt,
    blocks: clone.blocks.map((b, i) => ({
      n: i + 1,
      title: b.title,
      sheet: `Блок ${i + 1}`,
      steps: b.steps.map((s) => {
        const id = (s as { id: string }).id;
        const url = overrides.stepUrlOverrides?.[id];
        return url === undefined ? s : { ...s, url };
      }),
    })),
  });
}

// «Общие» (SPEC §3.7, index.json): деплой — настоящий сценарий (для открытия
// по ./scenarios/deployment-demo.json), MRP и «на стенд» — только элементы
// индекса (числа не требуют реального содержания шагов).
const deploymentScenario = buildScenario({
  id: 'deployment-demo',
  source: 'repo',
  loadedAt: localIso(2026, 9, 16, 12, 0),
});
const S_DEPLOY: ScenarioIndexItem = toIndexItem(deploymentScenario);
const S_MRP: ScenarioIndexItem = {
  id: 'mrp-webinar',
  title: 'MRP — вебинар, последовательность экранов',
  module: 'MRP',
  map: 'mrp',
  fileName: 'mrp-webinar.xlsx',
  loadedAt: localIso(2026, 9, 10, 12, 0),
  blocks: 4,
  steps: 34,
  withLink: 34,
};
const S_STAND: ScenarioIndexItem = {
  id: 'deploy-stand',
  title: 'Деплой на стенд',
  module: '',
  map: 'snp',
  fileName: 'deploy-stand.xlsx',
  loadedAt: localIso(2026, 9, 18, 9, 5),
  blocks: 1,
  steps: 2,
  withLink: 0,
};

// «Мои» (SPEC §3.6): M_OLD теряет ссылку у шага 1.1 (isScreenUrl, §3.5:183) —
// 24 → 23 со ссылкой; title специально с «ё», чтобы проверить нормализацию
// поиска ё→е (SPEC §4.2:247).
const mOld = buildScenario({
  id: 'my-deploy-pilot',
  source: 'local',
  title: 'Дёплой — пилот',
  module: '',
  fileName: 'pilot.xlsx',
  loadedAt: localIso(2026, 9, 15, 12, 0),
  stepUrlOverrides: { '1.1': 'экран' },
});
const mNew = buildScenario({
  id: 'my-deployment-demo',
  source: 'local',
  fileName: 'Deployment_demo_v2.xlsx',
  loadedAt: localIso(2026, 9, 18, 10, 42),
});

function seedLibrary(items: Scenario[]): void {
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify({ schema: 1, items }));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** fetchFn с рабочим индексом (по умолчанию S_MRP/S_DEPLOY/S_STAND) и файлом deployment-demo. */
function sharedFetch(items: ScenarioIndexItem[] = [S_MRP, S_DEPLOY, S_STAND]): FetchFn {
  return vi.fn(async (url: string) => {
    if (url === './scenarios/index.json') {
      return jsonResponse({ schema: 1, builtAt: '', items });
    }
    if (url === './scenarios/deployment-demo.json') {
      return jsonResponse(deploymentScenario);
    }
    return new Response('not found', { status: 404 });
  });
}

interface ProbeSnapshot {
  scenarioId: string | null;
  stepId: string | null;
  modal: { kind: string; scenarioId?: string } | null;
  toast: string | null;
}

/** Зонд состояния — по образцу tests/Header.test.tsx/tests/ImportModal.test.tsx: <pre>, не <output> (роль "status" тоста). */
function Probe() {
  const { state } = useAppStore();
  const snapshot: ProbeSnapshot = {
    scenarioId: state.scenario?.id ?? null,
    stepId: state.stepId,
    modal: state.modal,
    toast: state.toast?.message ?? null,
  };
  return <pre data-testid="state-probe">{JSON.stringify(snapshot)}</pre>;
}

function probeState(): ProbeSnapshot {
  return JSON.parse(screen.getByTestId('state-probe').textContent ?? '{}') as ProbeSnapshot;
}

function renderCatalog(opts: { fetchFn?: FetchFn; storage?: LibraryStorage | null } = {}) {
  return render(
    <StoreProvider fetchFn={opts.fetchFn} storage={opts.storage}>
      <Catalog now={now} />
      <Probe />
    </StoreProvider>,
  );
}

/** Печатает в поле поиска (aria-label = ru.catalog.searchPlaceholder, SPEC §4.2:247). */
function search(query: string): void {
  fireEvent.change(screen.getByRole('searchbox', { name: ru.catalog.searchPlaceholder }), {
    target: { value: query },
  });
}

function sharedSection(): HTMLElement {
  return screen.getByRole('region', { name: ru.catalog.sharedTitle });
}

function localSection(): HTMLElement {
  return screen.getByRole('region', { name: ru.catalog.localTitle });
}

/** id строк в порядке DOM (контракт: <tr data-scenario-id={id}>). */
function rowIds(section: HTMLElement): string[] {
  return [...section.querySelectorAll('tr[data-scenario-id]')].map(
    (tr) => tr.getAttribute('data-scenario-id') ?? '',
  );
}

/** Число сценариев в шапке раздела (контракт: <span data-count>). */
function sectionCount(section: HTMLElement): string | null {
  return section.querySelector('[data-count]')?.textContent ?? null;
}

function findRow(section: HTMLElement, id: string): HTMLTableRowElement {
  const row = section.querySelector(`tr[data-scenario-id="${id}"]`);
  if (!(row instanceof HTMLTableRowElement)) throw new Error(`строка ${id} не найдена`);
  return row;
}

/** Текст всех <td> строки по порядку колонок (SPEC §4.2:252). */
function cellTexts(row: HTMLTableRowElement): string[] {
  return [...row.querySelectorAll('td')].map((td) => td.textContent ?? '');
}

describe('Catalog: SPEC §4.2:247-257, ТК 26 — SPEC §8:422', () => {
  it('источники, порядок и содержимое строк обеих таблиц', async () => {
    seedLibrary([mOld, mNew]);
    renderCatalog({ fetchFn: sharedFetch() });

    expect(screen.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: ru.catalog.searchPlaceholder }),
    ).toBeInTheDocument();

    const shared = sharedSection();
    await waitFor(() => expect(rowIds(shared)).toHaveLength(3));
    // Индекс отдан не по алфавиту — каталог сам не пересортировывает (SPEC §3.7:228).
    expect(rowIds(shared)).toEqual(['mrp-webinar', 'deployment-demo', 'deploy-stand']);
    expect(sectionCount(shared)).toBe('3');
    expect(within(shared).getByText(ru.catalog.sharedHint)).toBeInTheDocument();
    expect(
      within(shared).getByRole('columnheader', { name: ru.catalog.columns.updated }),
    ).toBeInTheDocument();

    const local = localSection();
    // «Мои» читаются readLibrary — новые сверху (SPEC §3.6:204), не порядок хранилища.
    expect(rowIds(local)).toEqual(['my-deployment-demo', 'my-deploy-pilot']);
    expect(sectionCount(local)).toBe('2');
    expect(within(local).getByText(ru.catalog.localHint)).toBeInTheDocument();
    expect(
      within(local).getByRole('columnheader', { name: ru.catalog.columns.loaded }),
    ).toBeInTheDocument();

    // deployment-demo: общий, Badge SNP, 3/29/24, «16.09.2026», шеврон есть, корзины нет.
    const deployRow = findRow(shared, 'deployment-demo');
    expect(within(deployRow).getByText('deployment-demo.xlsx')).toBeInTheDocument();
    expect(within(deployRow).getByText('SNP')).toHaveAttribute('data-tone', 'module');
    const deployCells = cellTexts(deployRow);
    expect(deployCells[2]).toBe('3');
    expect(deployCells[3]).toBe('29');
    expect(deployCells[4]).toBe('24');
    expect(deployCells[5]).toBe('16.09.2026');
    const chevron = deployRow.querySelector('svg[data-icon="chevron-right"]');
    expect(chevron).not.toBeNull();
    expect(chevron?.querySelector('path')).toHaveAttribute('d', 'M9 6l6 6-6 6');
    expect(deployRow.querySelector('svg[data-icon="trash"]')).toBeNull();

    // deploy-stand: модуль '' → без Badge, «сегодня, 09:05».
    const standRow = findRow(shared, 'deploy-stand');
    expect(standRow.querySelector('[data-tone="module"]')).toBeNull();
    expect(cellTexts(standRow)[5]).toBe(ru.catalog.today('09:05'));

    // M_NEW: «сегодня, 10:42», 3/29/24, корзина есть, шеврона нет.
    const newRow = findRow(local, 'my-deployment-demo');
    const newCells = cellTexts(newRow);
    expect(newCells[2]).toBe('3');
    expect(newCells[3]).toBe('29');
    expect(newCells[4]).toBe('24');
    expect(newCells[5]).toBe(ru.catalog.today('10:42'));
    expect(newRow.querySelector('svg[data-icon="chevron-right"]')).toBeNull();
    const trashSvg = newRow.querySelector('svg[data-icon="trash"]');
    expect(trashSvg).not.toBeNull();
    const trashPaths = [...(trashSvg?.querySelectorAll('path') ?? [])].map((p) =>
      p.getAttribute('d'),
    );
    expect(trashPaths).toEqual(['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6']);

    // M_OLD: «15.09.2026», без Badge, 3/29/23 (шаг 1.1 без http-ссылки).
    const oldRow = findRow(local, 'my-deploy-pilot');
    expect(oldRow.querySelector('[data-tone="module"]')).toBeNull();
    const oldCells = cellTexts(oldRow);
    expect(oldCells[2]).toBe('3');
    expect(oldCells[3]).toBe('29');
    expect(oldCells[4]).toBe('23');
    expect(oldCells[5]).toBe('15.09.2026');
  });

  it.each([
    ['DEPLOY', ['deployment-demo'], ['my-deployment-demo']],
    ['деплой', ['deploy-stand'], ['my-deploy-pilot']],
    ['дёплой', ['deploy-stand'], ['my-deploy-pilot']],
    ['ДЕПЛОЙ', ['deploy-stand'], ['my-deploy-pilot']],
    ['  deploy  ', ['deployment-demo'], ['my-deployment-demo']],
  ])(
    'поиск "%s" фильтрует оба раздела: «Общие» %j, «Мои» %j',
    async (query, sharedIds, localIds) => {
      seedLibrary([mOld, mNew]);
      renderCatalog({ fetchFn: sharedFetch() });
      await waitFor(() => expect(rowIds(sharedSection())).toHaveLength(3));

      search(query);

      expect(rowIds(sharedSection())).toEqual(sharedIds);
      expect(rowIds(localSection())).toEqual(localIds);
      expect(sectionCount(sharedSection())).toBe(String(sharedIds.length));
      expect(sectionCount(localSection())).toBe(String(localIds.length));
    },
  );

  it('поиск "MRP": «Общие» — только mrp-webinar, «Мои» — «Ничего не найдено»', async () => {
    seedLibrary([mOld, mNew]);
    renderCatalog({ fetchFn: sharedFetch() });
    await waitFor(() => expect(rowIds(sharedSection())).toHaveLength(3));

    search('MRP');

    expect(rowIds(sharedSection())).toEqual(['mrp-webinar']);
    const local = localSection();
    expect(within(local).getByText(ru.catalog.notFound)).toBeInTheDocument();
    expect(sectionCount(local)).toBe('0');
  });

  it('поиск "webinar": имя файла не ищется — оба раздела «Ничего не найдено»', async () => {
    seedLibrary([mOld, mNew]);
    renderCatalog({ fetchFn: sharedFetch() });
    await waitFor(() => expect(rowIds(sharedSection())).toHaveLength(3));

    search('webinar');

    expect(within(sharedSection()).getByText(ru.catalog.notFound)).toBeInTheDocument();
    expect(within(localSection()).getByText(ru.catalog.notFound)).toBeInTheDocument();
  });

  it('поиск "zzz": оба раздела «Ничего не найдено», числа 0, таблиц нет', async () => {
    seedLibrary([mOld, mNew]);
    renderCatalog({ fetchFn: sharedFetch() });
    await waitFor(() => expect(rowIds(sharedSection())).toHaveLength(3));

    search('zzz');

    const shared = sharedSection();
    const local = localSection();
    expect(shared.querySelector('table')).toBeNull();
    expect(local.querySelector('table')).toBeNull();
    expect(sectionCount(shared)).toBe('0');
    expect(sectionCount(local)).toBe('0');
  });

  it('очистка запроса ("") возвращает все строки — 3/2', async () => {
    seedLibrary([mOld, mNew]);
    renderCatalog({ fetchFn: sharedFetch() });
    await waitFor(() => expect(rowIds(sharedSection())).toHaveLength(3));

    search('zzz');
    search('');

    expect(rowIds(sharedSection())).toEqual(['mrp-webinar', 'deployment-demo', 'deploy-stand']);
    expect(rowIds(localSection())).toEqual(['my-deployment-demo', 'my-deploy-pilot']);
    expect(sectionCount(sharedSection())).toBe('3');
    expect(sectionCount(localSection())).toBe('2');
  });
});

describe('Catalog: «Мои» пусты — A5.1 (SPEC §4.2:257, ТК 26)', () => {
  it('пунктирная рамка вместо таблицы: текст, «Скачать шаблон», «Загрузить из Excel», число 0, подсказка', () => {
    renderCatalog({ fetchFn: sharedFetch() });
    const local = localSection();

    expect(within(local).getByText(ru.catalog.localEmpty)).toBeInTheDocument();
    expect(
      within(local).getByRole('button', { name: ru.catalog.downloadTemplate }),
    ).toBeInTheDocument();
    expect(within(local).getByRole('button', { name: ru.catalog.upload })).toBeInTheDocument();
    expect(local.querySelector('table')).toBeNull();
    expect(sectionCount(local)).toBe('0');
    expect(within(local).getByText(ru.catalog.localHint)).toBeInTheDocument();
  });

  it('«Загрузить из Excel» в A5.1 открывает окно импорта', () => {
    renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: ru.catalog.upload }));
    expect(probeState().modal).toEqual({ kind: 'import' });
  });

  it('«Скачать шаблон» в A5.1 вызывает downloadTemplate ровно один раз', () => {
    renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: ru.catalog.downloadTemplate }));
    expect(vi.mocked(downloadTemplate)).toHaveBeenCalledTimes(1);
  });

  it('запрос "zzz" — A5.1 остаётся (пустой раздел не путается с «Ничего не найдено»)', () => {
    renderCatalog();
    search('zzz');
    expect(screen.getByText(ru.catalog.localEmpty)).toBeInTheDocument();
  });
});

describe('Catalog: хранилище недоступно (SPEC §3.6:206)', () => {
  it('подсказка «Мои» заменяется на storageUnavailable, localHint не показан', () => {
    renderCatalog({ storage: null });
    const local = localSection();
    expect(within(local).getByText(ru.library.storageUnavailable)).toBeInTheDocument();
    expect(within(local).queryByText(ru.catalog.localHint)).not.toBeInTheDocument();
  });
});

describe('Catalog: «Общие» грузятся (SPEC §4.2:256)', () => {
  it('3 строки-скелета, aria-busy, числа нет', () => {
    renderCatalog(); // fetchFn не передан → глобальный fetch (tests/setup.ts) висит вечно.
    const shared = sharedSection();
    expect(shared).toHaveAttribute('aria-busy', 'true');
    const skeletons = shared.querySelectorAll('tr[data-skeleton="true"]');
    expect(skeletons).toHaveLength(3);
    for (const row of skeletons) {
      expect(row).toHaveAttribute('aria-hidden', 'true');
    }
    expect(shared.querySelector('[data-count]')).toBeNull();
    expect(shared.querySelector('tr[data-scenario-id]')).toBeNull();
  });

  it('во время поиска ("zzz") загрузка остаётся видна — запрос на источник не влияет', () => {
    renderCatalog();
    search('zzz');
    const shared = sharedSection();
    expect(shared.querySelectorAll('tr[data-skeleton="true"]')).toHaveLength(3);
    expect(shared).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Catalog: «Общие» пусты после загрузки (SPEC §4.2:256)', () => {
  it('«Общих сценариев пока нет», число 0, таблицы нет; запрос не меняет состояние', async () => {
    const fetchFn = sharedFetch([]);
    renderCatalog({ fetchFn });
    const shared = sharedSection();
    await waitFor(() =>
      expect(within(shared).getByText(ru.catalog.sharedEmpty)).toBeInTheDocument(),
    );
    expect(shared.querySelector('table')).toBeNull();
    expect(sectionCount(shared)).toBe('0');

    search('zzz');
    expect(within(shared).getByText(ru.catalog.sharedEmpty)).toBeInTheDocument();
  });
});

describe('Catalog: ТК 31 — SPEC §8:427, UI (ошибка/повтор индекса «Общих»)', () => {
  it.each([
    ['404', (): Response => new Response('not found', { status: 404 })],
    ['schema: 2', (): Response => jsonResponse({ schema: 2, builtAt: '', items: [] })],
  ])(
    'индекс не проходит (%s) → текст ошибки и «Повторить», числа нет, «Мои» открываются',
    async (_label, makeBadIndex) => {
      seedLibrary([mOld, mNew]);
      const fetchFn = vi.fn<FetchFn>(async (url) =>
        url === './scenarios/index.json'
          ? makeBadIndex()
          : new Response('not found', { status: 404 }),
      );
      renderCatalog({ fetchFn });

      const shared = sharedSection();
      await waitFor(() =>
        expect(within(shared).getByText(ru.shared.loadFailed)).toBeInTheDocument(),
      );
      expect(within(shared).getByRole('button', { name: ru.shared.retry })).toBeInTheDocument();
      expect(shared.querySelector('[data-count]')).toBeNull();

      const local = localSection();
      fireEvent.click(within(local).getByRole('button', { name: mNew.title }));
      expect(probeState().scenarioId).toBe('my-deployment-demo');
      expect(probeState().stepId).toBe('1.1');
    },
  );

  it('404 → «Повторить» → снова загрузка (скелеты) → валидный индекс → строки появились', async () => {
    let resolveSecond: ((response: Response) => void) | null = null;
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    // Вызов через отдельно объявленную функцию — иначе TS сужает resolveSecond
    // до `never` при чтении в той же области видимости, что и присвоение
    // внутри исполнителя Promise (известная особенность контроля потока TS,
    // не баг теста — воспроизведено изолированно вне этого файла).
    function resolveIndex(response: Response): void {
      resolveSecond?.(response);
    }
    renderCatalog({ fetchFn });

    const shared = sharedSection();
    await waitFor(() => expect(within(shared).getByText(ru.shared.loadFailed)).toBeInTheDocument());

    fireEvent.click(within(shared).getByRole('button', { name: ru.shared.retry }));
    expect(shared.querySelectorAll('tr[data-skeleton="true"]')).toHaveLength(3);

    resolveIndex(jsonResponse({ schema: 1, builtAt: '', items: [S_DEPLOY] }));

    await waitFor(() => expect(rowIds(shared)).toEqual(['deployment-demo']));
    expect(within(shared).queryByText(ru.shared.loadFailed)).not.toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenNthCalledWith(1, './scenarios/index.json');
    expect(fetchFn).toHaveBeenNthCalledWith(2, './scenarios/index.json');
  });
});

describe('Catalog: открытие сценария (SPEC §4.2:254)', () => {
  it('клик по «моему» → openScenario, первый шаг (1.1)', () => {
    seedLibrary([mNew]);
    renderCatalog({ fetchFn: sharedFetch() });
    const local = localSection();
    fireEvent.click(within(local).getByRole('button', { name: mNew.title }));
    expect(probeState().scenarioId).toBe('my-deployment-demo');
    expect(probeState().stepId).toBe('1.1');
  });

  it('клик по общему → fetchFn вызван с адресом сценария, открывается на первом шаге', async () => {
    const fetchFn = sharedFetch();
    renderCatalog({ fetchFn });
    const shared = sharedSection();
    await waitFor(() => expect(rowIds(shared)).toHaveLength(3));

    fireEvent.click(within(shared).getByRole('button', { name: deploymentScenario.title }));

    await waitFor(() => expect(probeState().scenarioId).toBe('deployment-demo'));
    expect(probeState().stepId).toBe('1.1');
    expect(fetchFn).toHaveBeenCalledWith('./scenarios/deployment-demo.json');
  });

  it('общий отдаёт 404 → scenarioId остаётся null, тост loadFailed', async () => {
    const fetchFn = vi.fn<FetchFn>(async (url) =>
      url === './scenarios/index.json'
        ? jsonResponse({ schema: 1, builtAt: '', items: [S_DEPLOY] })
        : new Response('not found', { status: 404 }),
    );
    renderCatalog({ fetchFn });
    const shared = sharedSection();
    await waitFor(() => expect(rowIds(shared)).toHaveLength(1));

    fireEvent.click(within(shared).getByRole('button', { name: deploymentScenario.title }));

    await waitFor(() => expect(probeState().toast).toBe(ru.shared.loadFailed));
    expect(probeState().scenarioId).toBeNull();
  });

  it('кнопка строки — BUTTON type="button" (Enter по нативной кнопке проверяется в e2e)', () => {
    seedLibrary([mNew]);
    renderCatalog({ fetchFn: sharedFetch() });
    const button = within(localSection()).getByRole('button', { name: mNew.title });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });
});

describe('Catalog: корзина «моих» (SPEC §4.2:255, часть ТК 29 — SPEC §8:425)', () => {
  it('клик по корзине → openDelete, сценарий не открывается', () => {
    seedLibrary([mNew]);
    renderCatalog({ fetchFn: sharedFetch() });
    const trash = within(localSection()).getByRole('button', {
      name: ru.catalog.deleteFromBrowser,
    });
    fireEvent.click(trash);
    expect(probeState().modal).toEqual({ kind: 'delete', scenarioId: 'my-deployment-demo' });
    expect(probeState().scenarioId).toBeNull();
  });

  it('title = deleteFromBrowser, aria-describedby указывает на элемент с названием строки', () => {
    seedLibrary([mNew]);
    renderCatalog({ fetchFn: sharedFetch() });
    const trash = within(localSection()).getByRole('button', {
      name: ru.catalog.deleteFromBrowser,
    });
    expect(trash).toHaveAttribute('title', ru.catalog.deleteFromBrowser);
    const describedBy = trash.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const label = describedBy === null ? null : document.getElementById(describedBy);
    expect(label).not.toBeNull();
    expect(label).toHaveTextContent(mNew.title);
  });
});

// ТК 29 (SPEC §8:425), окно удаления A5.2 (SPEC §4.2:255): рендерится на уровне
// AppShell (src/App.tsx: modal?.kind === 'delete'), поэтому здесь — AppShell, а
// не голый Catalog, как в остальных describe этого файла.
describe('Catalog: ТК 29 — SPEC §8:425 (окно удаления A5.2)', () => {
  function renderShell(items: Scenario[]) {
    seedLibrary(items);
    return render(
      <StoreProvider fetchFn={sharedFetch()}>
        <AppShell />
        <Probe />
      </StoreProvider>,
    );
  }

  function trashOf(id: string): HTMLElement {
    return within(findRow(localSection(), id)).getByRole('button', {
      name: ru.catalog.deleteFromBrowser,
    });
  }

  function storedLibraryIds(): string[] {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as { items: Scenario[] };
    return parsed.items.map((item) => item.id);
  }

  it('корзина → окно → «Удалить»: строки нет ни в каталоге, ни в localStorage, тост', async () => {
    renderShell([mNew, mOld]);
    const trash = trashOf(mNew.id);
    trash.focus();
    fireEvent.click(trash);

    expect(probeState().scenarioId).toBeNull();
    const dialog = screen.getByRole('dialog', { name: ru.deleteDialog.title });
    expect(dialog).toHaveTextContent(ru.deleteDialog.body(mNew.title));

    fireEvent.click(within(dialog).getByRole('button', { name: ru.deleteDialog.confirm }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(rowIds(localSection())).toEqual([mOld.id]);
    expect(storedLibraryIds()).toEqual([mOld.id]);
    expect(probeState().toast).toBe(ru.deleteDialog.deleted);
    expect(probeState().scenarioId).toBeNull();
  });

  it('«Отмена»: без изменений, фокус возвращается на корзину', async () => {
    renderShell([mNew, mOld]);
    const before = window.localStorage.getItem(LIBRARY_KEY);
    const trash = trashOf(mNew.id);
    trash.focus();
    fireEvent.click(trash);

    const dialog = screen.getByRole('dialog', { name: ru.deleteDialog.title });
    fireEvent.click(within(dialog).getByRole('button', { name: ru.deleteDialog.cancel }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.localStorage.getItem(LIBRARY_KEY)).toBe(before);
    expect(rowIds(localSection())).toEqual([mNew.id, mOld.id]);
    expect(probeState().toast).toBeNull();
    expect(probeState().modal).toBeNull();
    await waitFor(() => expect(trash).toHaveFocus());
  });

  it('удаление последнего «моего» → A5.1 (localEmpty)', async () => {
    renderShell([mNew]);
    const trash = trashOf(mNew.id);
    fireEvent.click(trash);

    const dialog = screen.getByRole('dialog', { name: ru.deleteDialog.title });
    fireEvent.click(within(dialog).getByRole('button', { name: ru.deleteDialog.confirm }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(localSection()).getByText(ru.catalog.localEmpty)).toBeInTheDocument();
  });
});
