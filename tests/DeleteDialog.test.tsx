// Окно удаления «моего» сценария — A5.2 (SPEC §4.2:255, макет
// design/catalog-mockup.html:243-250). Общий контракт Modal — SPEC §4.8:329,
// §11 №12 (один Modal на все окна, отступы едины); ширина в jsdom раскладкой
// не проверяется (CSS-модули — прокси) — здесь только `data-width`, реальные
// 480 px — e2e/mine.spec.ts (M2). Замечание из bd DN-02: у Modal нет проверки
// ширины 480 (A5.2) — покрыто здесь.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { createInitialState, type AppState } from '../src/state/reducer';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import type { LibraryStorage } from '../src/state/library';
import { ru } from '../src/i18n/ru';
import { DeleteDialog } from '../src/components/DeleteDialog/DeleteDialog';
import fixtureJson from './fixtures/deployment-demo.json';

const fixture = fixtureJson as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

/** Копия приёма tests/reducer.test.ts:36-52 — общий хелпер не заводим. */
function buildScenario(id: string): Scenario {
  const clone = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  return ScenarioSchema.parse({
    schema: 1,
    id,
    source: 'local',
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

const mNew = buildScenario('my-deployment-demo');

interface ProbeSnapshot {
  modal: { kind: string } | null;
  toast: string | null;
  library: string[];
}

function Probe() {
  const { state } = useAppStore();
  const snapshot: ProbeSnapshot = {
    modal: state.modal,
    toast: state.toast?.message ?? null,
    library: state.library.items.map((item) => item.id),
  };
  return <pre data-testid="state-probe">{JSON.stringify(snapshot)}</pre>;
}

function probeState(): ProbeSnapshot {
  return JSON.parse(screen.getByTestId('state-probe').textContent ?? '{}') as ProbeSnapshot;
}

/** Хранилище в памяти: getItem/removeItem видят то, что записал setItem. */
function memoryStorage(items: readonly Scenario[]): {
  storage: LibraryStorage;
  raw: () => string | null;
} {
  let value: string | null = JSON.stringify({ schema: 1, items });
  return {
    storage: {
      getItem: () => value,
      setItem: (_key: string, v: string) => {
        value = v;
      },
      removeItem: () => {
        value = null;
      },
    },
    raw: () => value,
  };
}

/** Хранилище, где запись всегда бросает квоту (SPEC §3.6:205). */
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

function renderDialog(opts: {
  scenarioId?: string;
  storage: LibraryStorage;
  library?: Scenario[];
}): void {
  const scenarioId = opts.scenarioId ?? mNew.id;
  const initialState: AppState = {
    ...createInitialState(),
    library: { items: opts.library ?? [mNew], available: true },
    modal: { kind: 'delete', scenarioId },
  };
  render(
    <StoreProvider initialState={initialState} storage={opts.storage}>
      <DeleteDialog scenarioId={scenarioId} />
      <Probe />
    </StoreProvider>,
  );
}

describe('DeleteDialog — SPEC §4.2:255, CAT:243-250 (A5.2)', () => {
  it('имя, data-width=480, текст, кнопки [Отмена, Удалить] по data-variant; крестика нет', () => {
    const { storage } = memoryStorage([mNew]);
    renderDialog({ storage });

    const dialog = screen.getByRole('dialog', { name: ru.deleteDialog.title });
    expect(dialog).toHaveAttribute('data-width', '480');
    expect(dialog).toHaveTextContent(ru.deleteDialog.body(mNew.title));

    const buttons = within(dialog).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      ru.deleteDialog.cancel,
      ru.deleteDialog.confirm,
    ]);
    expect(buttons[0]).toHaveAttribute('data-variant', 'neutral');
    expect(buttons[1]).toHaveAttribute('data-variant', 'destructive');
    expect(
      within(dialog).queryByRole('button', { name: ru.importModal.close }),
    ).not.toBeInTheDocument();
  });

  it('фокус при открытии — на «Отмена» (в макете крестика нет)', async () => {
    const { storage } = memoryStorage([mNew]);
    renderDialog({ storage });

    const cancel = screen.getByRole('button', { name: ru.deleteDialog.cancel });
    await waitFor(() => expect(cancel).toHaveFocus());
  });

  const CLOSE_CASES: readonly [string, () => void][] = [
    ['Esc', () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })],
    [
      'клик по фону',
      () => {
        const dialog = screen.getByRole('dialog');
        const overlay = dialog.parentElement;
        if (!overlay) throw new Error('оверлей не найден');
        fireEvent.click(overlay);
      },
    ],
    [
      '«Отмена»',
      () => fireEvent.click(screen.getByRole('button', { name: ru.deleteDialog.cancel })),
    ],
  ];

  describe.each(CLOSE_CASES)('закрытие без удаления: %s (SPEC §11 №12)', (_label, close) => {
    it('окно закрывается, «Мои» и хранилище не меняются, тоста нет', async () => {
      const { storage, raw } = memoryStorage([mNew]);
      const before = raw();
      renderDialog({ storage });

      close();

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(raw()).toBe(before);
      expect(probeState().library).toEqual([mNew.id]);
      expect(probeState().toast).toBeNull();
      expect(probeState().modal).toBeNull();
    });
  });

  it('«Удалить»: modal=null, «Мои» пусты, тост «Сценарий удалён» (SPEC §4.2:255)', async () => {
    const { storage, raw } = memoryStorage([mNew]);
    renderDialog({ storage });

    fireEvent.click(screen.getByRole('button', { name: ru.deleteDialog.confirm }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probeState().modal).toBeNull();
    expect(probeState().library).toEqual([]);
    expect(probeState().toast).toBe(ru.deleteDialog.deleted);
    const stored = JSON.parse(raw() ?? '{}') as { items: Scenario[] };
    expect(stored.items).toEqual([]);
  });

  it('квота при удалении: окно остаётся открытым, список прежний, тост про квоту (SPEC §3.6:205)', async () => {
    renderDialog({ storage: quotaStorage([mNew]) });

    fireEvent.click(screen.getByRole('button', { name: ru.deleteDialog.confirm }));

    await waitFor(() => expect(probeState().toast).toBe(ru.library.quotaExceeded));
    expect(screen.getByRole('dialog', { name: ru.deleteDialog.title })).toBeInTheDocument();
    expect(probeState().library).toEqual([mNew.id]);
  });

  it('неизвестный scenarioId — окно не рендерится', () => {
    const { storage } = memoryStorage([mNew]);
    renderDialog({ scenarioId: 'my-unknown', storage });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
