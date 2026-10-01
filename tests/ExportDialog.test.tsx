// Окно «Перенести в общие» — A5.3 (SPEC §4.2:255, DN-rmz, ТК 34/35 —
// SPEC §8:430-431). Общий контракт Modal — SPEC §4.8:329, §11 №12; ширина в
// jsdom раскладкой не проверяется (CSS-модули — прокси) — здесь только
// `data-width`, реальные 480 px — e2e/mine.spec.ts (M3/M4). Отправку мокаем
// (gh/publish.ts — tests/publish.test.ts), скачивание тоже (механизм Blob —
// tests/download.test.ts); токен живёт в window.localStorage — как «Мои»
// (tests/Catalog.test.tsx).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { createInitialState, type AppState } from '../src/state/reducer';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import type { ScenarioIndexItem } from '../src/model/scenarioIndex';
import type { FetchFn } from '../src/state/shared';
import { GH_TOKEN_KEY } from '../src/state/ghToken';
import { publishScenario } from '../src/gh/publish';
import { ru } from '../src/i18n/ru';
import { ExportDialog } from '../src/components/ExportDialog/ExportDialog';
import { downloadMine } from '../src/components/ui/download';
import fixtureJson from './fixtures/deployment-demo.json';

vi.mock('../src/components/ui/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/ui/download')>();
  return { ...actual, downloadMine: vi.fn(() => Promise.resolve()) };
});

vi.mock('../src/gh/publish', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/gh/publish')>();
  return { ...actual, publishScenario: vi.fn() };
});

const fixture = fixtureJson as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

/** Копия приёма tests/DeleteDialog.test.tsx:25-43 — общий хелпер не заводим. */
function buildMine(id: string): Scenario {
  const clone = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  return ScenarioSchema.parse({
    schema: 1,
    id,
    source: 'local',
    title: clone.title,
    module: clone.module,
    map: clone.map,
    fileName: 'Deployment_demo_v2.xlsx',
    loadedAt: '2026-09-18T10:42:00.000Z',
    blocks: clone.blocks.map((b, i) => ({
      n: i + 1,
      title: b.title,
      sheet: `Блок ${i + 1}`,
      steps: b.steps,
    })),
  });
}

const mNew = buildMine('my-deployment-demo');

interface ProbeSnapshot {
  modal: { kind: string; scenarioId?: string } | null;
}

function Probe() {
  const { state } = useAppStore();
  const snapshot: ProbeSnapshot = { modal: state.modal };
  return <pre data-testid="state-probe">{JSON.stringify(snapshot)}</pre>;
}

/** fetchFn, чей промис не резолвится: индекс «Общих» не меняет заданное состояние. */
const pendingFetch: FetchFn = () => new Promise<Response>(() => undefined);

function renderDialog(
  opts: {
    scenarioId?: string;
    sharedItems?: ScenarioIndexItem[];
    library?: Scenario[];
  } = {},
): void {
  const scenarioId = opts.scenarioId ?? mNew.id;
  const initialState: AppState = {
    ...createInitialState(),
    library: { items: opts.library ?? [mNew], available: true },
    shared: { status: 'ready', items: opts.sharedItems ?? [] },
    modal: { kind: 'export', scenarioId },
  };
  render(
    <StoreProvider initialState={initialState} fetchFn={pendingFetch}>
      <ExportDialog scenarioId={scenarioId} />
      <Probe />
    </StoreProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(publishScenario).mockReset();
  vi.mocked(downloadMine).mockClear();
});

describe('ExportDialog — SPEC §4.2:255 (A5.3), ТК 34', () => {
  it('имя, data-width=480, текст с именем файла, подсказки, поле токена, кнопки; primary без токена недоступна', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: ru.exportDialog.title });
    expect(dialog).toHaveAttribute('data-width', '480');
    // my-deployment-demo → файл deployment-demo.xlsx (§4.2:255: id без my-).
    expect(dialog).toHaveTextContent(ru.exportDialog.body('deployment-demo.xlsx'));
    expect(dialog).toHaveTextContent(ru.exportDialog.stays);
    expect(within(dialog).queryByText(ru.exportDialog.exists)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(ru.exportDialog.tokenLabel)).toBeInTheDocument();

    // В теле окна есть и кнопка-ссылка «Скачать .xlsx вручную» — кнопки футера
    // проверяем по именам, не списком.
    const cancel = within(dialog).getByRole('button', { name: ru.exportDialog.cancel });
    expect(cancel).toHaveAttribute('data-variant', 'neutral');
    const send = within(dialog).getByRole('button', { name: ru.exportDialog.send });
    expect(send).toHaveAttribute('data-variant', 'primary');
    expect(send).toBeDisabled();
  });

  it('существующий общий с тем же id — строка «файл его заменит» видна', () => {
    const item: ScenarioIndexItem = {
      id: 'deployment-demo',
      title: 'Другой сценарий',
      module: '',
      map: 'snp',
      fileName: 'deployment-demo.xlsx',
      loadedAt: '2026-09-16T00:00:00.000Z',
      blocks: 1,
      steps: 2,
      withLink: 0,
    };
    renderDialog({ sharedItems: [item] });
    expect(screen.getByText(ru.exportDialog.exists)).toBeInTheDocument();
  });

  it('фокус при открытии — на поле токена (первое фокусируемое окна)', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByLabelText(ru.exportDialog.tokenLabel)).toHaveFocus());
  });

  it('сохранённый токен: поле заполнено, primary доступна, «Забыть токен» очищает', async () => {
    window.localStorage.setItem(GH_TOKEN_KEY, 'github_pat_saved');
    renderDialog();

    expect(screen.getByLabelText(ru.exportDialog.tokenLabel)).toHaveValue('github_pat_saved');
    expect(screen.getByRole('button', { name: ru.exportDialog.send })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: ru.exportDialog.forgetToken }));

    await waitFor(() => expect(window.localStorage.getItem(GH_TOKEN_KEY)).toBeNull());
    expect(screen.getByLabelText(ru.exportDialog.tokenLabel)).toHaveValue('');
    expect(screen.getByRole('button', { name: ru.exportDialog.send })).toBeDisabled();
  });

  it('«Скачать .xlsx вручную» вызывает downloadMine, окно остаётся открытым', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: ru.exportDialog.downloadManual }));

    expect(vi.mocked(downloadMine)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadMine)).toHaveBeenCalledWith(mNew);
    expect(screen.getByRole('dialog', { name: ru.exportDialog.title })).toBeInTheDocument();
  });

  it('неизвестный scenarioId — окно не рендерится', () => {
    renderDialog({ scenarioId: 'my-unknown' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ExportDialog — отправка в репозиторий (SPEC §4.2:255, ТК 35)', () => {
  function typeToken(): void {
    fireEvent.change(screen.getByLabelText(ru.exportDialog.tokenLabel), {
      target: { value: 'github_pat_fresh' },
    });
  }

  it('успех: publishScenario со сценарием и токеном; «Отправлено», ссылка на коммит, токен сохранён', async () => {
    const commitUrl = 'https://github.com/igordikinov/demo-script/commit/abc';
    vi.mocked(publishScenario).mockResolvedValue({ ok: true, commitUrl });
    renderDialog();

    typeToken();
    fireEvent.click(screen.getByRole('button', { name: ru.exportDialog.send }));

    await waitFor(() => expect(screen.getByText(ru.exportDialog.sentTitle)).toBeInTheDocument());
    expect(vi.mocked(publishScenario)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publishScenario)).toHaveBeenCalledWith(mNew, 'github_pat_fresh');
    expect(screen.getByText(ru.exportDialog.sentText)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: ru.exportDialog.sentLink });
    expect(link).toHaveAttribute('href', commitUrl);
    expect(window.localStorage.getItem(GH_TOKEN_KEY)).toBe('github_pat_fresh');
    // После успеха в футере только «Закрыть».
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([ru.exportDialog.cancel]);
  });

  it('401/403: текст про токен, сохранённый токен забыт; введённое остаётся — можно исправить', async () => {
    window.localStorage.setItem(GH_TOKEN_KEY, 'github_pat_bad');
    vi.mocked(publishScenario).mockResolvedValue({ ok: false, error: 'auth', status: 401 });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: ru.exportDialog.send }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(ru.exportDialog.errorAuth),
    );
    expect(window.localStorage.getItem(GH_TOKEN_KEY)).toBeNull();
    expect(screen.getByLabelText(ru.exportDialog.tokenLabel)).toHaveValue('github_pat_bad');
    expect(screen.getByRole('button', { name: ru.exportDialog.send })).toBeEnabled();
  });

  it('сеть: свой текст, окно остаётся в форме', async () => {
    vi.mocked(publishScenario).mockResolvedValue({ ok: false, error: 'network' });
    renderDialog();

    typeToken();
    fireEvent.click(screen.getByRole('button', { name: ru.exportDialog.send }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(ru.exportDialog.errorNetwork),
    );
    expect(screen.getByLabelText(ru.exportDialog.tokenLabel)).toBeInTheDocument();
  });

  it('отказ сборки книги (SheetJS не загрузился) — «не получилось отправить»', async () => {
    vi.mocked(publishScenario).mockRejectedValue(new TypeError('chunk failed'));
    renderDialog();

    typeToken();
    fireEvent.click(screen.getByRole('button', { name: ru.exportDialog.send }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(ru.exportDialog.errorOther),
    );
  });

  it('«Закрыть» — modal=null', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: ru.exportDialog.cancel }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
