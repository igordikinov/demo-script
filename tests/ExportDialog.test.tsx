// Окно «Перенести в общие» — A5.3 (SPEC §4.2:255, DN-rmz, ТК 34 — SPEC §8:430).
// Общий контракт Modal — SPEC §4.8:329, §11 №12; ширина в jsdom раскладкой не
// проверяется (CSS-модули — прокси) — здесь только `data-width`, реальные
// 480 px — e2e/mine.spec.ts (M3). Имя файла и книгу считают чистые функции
// src/excel/export.ts (tests/export.test.ts); скачивание мокается — сам
// механизм Blob проверен tests/download.test.ts.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { createInitialState, type AppState } from '../src/state/reducer';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import type { ScenarioIndexItem } from '../src/model/scenarioIndex';
import type { FetchFn } from '../src/state/shared';
import { ru } from '../src/i18n/ru';
import { ExportDialog } from '../src/components/ExportDialog/ExportDialog';
import { downloadMine } from '../src/components/ui/download';
import fixtureJson from './fixtures/deployment-demo.json';

vi.mock('../src/components/ui/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/ui/download')>();
  return { ...actual, downloadMine: vi.fn(() => Promise.resolve()) };
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

function probeState(): ProbeSnapshot {
  return JSON.parse(screen.getByTestId('state-probe').textContent ?? '{}') as ProbeSnapshot;
}

/** fetchFn, чей промис не резолвится: индекс «Общих» не меняет заданное состояние. */
const pendingFetch: FetchFn = () => new Promise<Response>(() => undefined);

function sharedItem(id: string): ScenarioIndexItem {
  return {
    id,
    title: 'Другой сценарий',
    module: '',
    map: 'snp',
    fileName: `${id}.xlsx`,
    loadedAt: '2026-09-16T00:00:00.000Z',
    blocks: 1,
    steps: 2,
    withLink: 0,
  };
}

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

describe('ExportDialog — SPEC §4.2:255 (A5.3), ТК 34', () => {
  it('имя, data-width=480, текст с именем файла, подсказка, кнопки [Закрыть, primary]; крестика нет', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: ru.exportDialog.title });
    expect(dialog).toHaveAttribute('data-width', '480');
    // my-deployment-demo → файл deployment-demo.xlsx (§4.2:255: id без my-).
    expect(dialog).toHaveTextContent(ru.exportDialog.body('deployment-demo.xlsx'));
    expect(dialog).toHaveTextContent(ru.exportDialog.stays);
    expect(within(dialog).queryByText(ru.exportDialog.exists)).not.toBeInTheDocument();

    const buttons = within(dialog).getAllByRole('button');
    // Ровно две кнопки — крестика нет (как у A5.2): cancel совпадает по тексту с
    // подписью крестика importModal.close («Закрыть»), поэтому кнопок должно
    // быть ровно две, а не три.
    expect(buttons.map((b) => b.textContent)).toEqual([
      ru.exportDialog.cancel,
      ru.exportDialog.submit,
    ]);
    expect(buttons[0]).toHaveAttribute('data-variant', 'neutral');
    expect(buttons[1]).toHaveAttribute('data-variant', 'primary');
  });

  it('фокус при открытии — на «Закрыть»', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: ru.exportDialog.cancel })).toHaveFocus(),
    );
  });

  it('существующий общий с тем же id — строка «файл его заменит» видна', () => {
    renderDialog({ sharedItems: [sharedItem('deployment-demo')] });
    expect(screen.getByText(ru.exportDialog.exists)).toBeInTheDocument();
  });

  it('«Скачать .xlsx» вызывает downloadMine со сценарием, окно остаётся открытым', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: ru.exportDialog.submit }));

    expect(vi.mocked(downloadMine)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadMine)).toHaveBeenCalledWith(mNew);
    expect(screen.getByRole('dialog', { name: ru.exportDialog.title })).toBeInTheDocument();
    expect(probeState().modal).toEqual({ kind: 'export', scenarioId: mNew.id });
  });

  it('«Закрыть» — modal=null, «Мои» не меняются', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: ru.exportDialog.cancel }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probeState().modal).toBeNull();
  });

  it('неизвестный scenarioId — окно не рендерится', () => {
    renderDialog({ scenarioId: 'my-unknown' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
