// Контракт App — план DN-10, раздел 3.5: App = StoreProvider(AppShell),
// AppShell = <Header/><main/><Toast restartKey={toast?.seq}/> (без restartKey
// повторный showToast с тем же текстом не перезапускает отсчёт — план,
// дефект «D9» из Toast, здесь проверяется через AppShell). seq передаётся
// именно в restartKey, а не в key: живой регион role="status" — один и тот
// же DOM-узел между тостами (план DN-k9y), key на Toast пересоздал бы его.
// Тост держится 3200 мс (SPEC §4.8:346, план D4: advanceTimersByTime внутри
// act, т.к. таймер вызывает dispatch в StoreProvider).
import { act, render, screen, within } from '@testing-library/react';
import type { Dispatch } from 'react';
import App, { AppShell } from '../src/App';
import { StoreProvider } from '../src/state/store';
import { appReducer, createInitialState, type AppAction } from '../src/state/reducer';
import { useAppStore } from '../src/state/context';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import { ru } from '../src/i18n/ru';
import fixtureJson from './fixtures/deployment-demo.json';

const fixture = fixtureJson as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

/** Копия хелпера tests/Header.test.tsx:29-47 — общий не заводим (риск мёржа с DN-16/DN-26). */
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

describe('App', () => {
  it('renders main landmark', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('шапка каталога видна вместе с main (А1)', () => {
    render(<App />);
    const banner = screen.getByRole('banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(ru.header.appTitle)).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

describe('App: хост тоста (SPEC §4.8:346 — 3,2 с)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('тост из initialState виден, гаснет ровно через 3200 мс (А2)', () => {
    const initialState = {
      ...createInitialState(),
      toast: { message: ru.openScreen.popupBlocked, seq: 1 },
    };
    render(
      <StoreProvider initialState={initialState}>
        <AppShell />
      </StoreProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(ru.openScreen.popupBlocked);

    act(() => {
      vi.advanceTimersByTime(3199);
    });
    expect(screen.getByRole('status')).toHaveTextContent(ru.openScreen.popupBlocked);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  // Probe вытаскивает dispatch стора наружу, чтобы тесты А3/А4 могли слать
  // showToast напрямую, не проходя через реальный UI-триггер тоста.
  function Probe({ capture }: { capture: (dispatch: Dispatch<AppAction>) => void }) {
    const { dispatch: d } = useAppStore();
    capture(d);
    return null;
  }

  it('повторный showToast с тем же текстом перезапускает отсчёт, регион role="status" — тот же узел (А3)', () => {
    let dispatch: Dispatch<AppAction> | null = null;

    render(
      <StoreProvider>
        <AppShell />
        <Probe
          capture={(d) => {
            dispatch = d;
          }}
        />
      </StoreProvider>,
    );
    if (dispatch === null) {
      throw new Error('Probe не отдал dispatch');
    }
    // Регион запоминаем до первого showToast (toast ещё null), чтобы поймать
    // мутацию «key={toast?.seq} на Toast» — она пересоздаёт узел при первом
    // же показе.
    const region = screen.getByRole('status');

    act(() => {
      dispatch?.({ type: 'showToast', message: ru.openScreen.popupBlocked });
    });
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getByRole('status')).toHaveTextContent(ru.openScreen.popupBlocked);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      dispatch?.({ type: 'showToast', message: ru.openScreen.popupBlocked });
    });
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getByRole('status')).toHaveTextContent(ru.openScreen.popupBlocked);

    act(() => {
      vi.advanceTimersByTime(3199);
    });
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getByRole('status')).toHaveTextContent(ru.openScreen.popupBlocked);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('показ → закрытие по таймеру → показ того же текста: регион role="status" — тот же узел (А4)', () => {
    let dispatch: Dispatch<AppAction> | null = null;

    render(
      <StoreProvider>
        <AppShell />
        <Probe
          capture={(d) => {
            dispatch = d;
          }}
        />
      </StoreProvider>,
    );
    if (dispatch === null) {
      throw new Error('Probe не отдал dispatch');
    }
    const region = screen.getByRole('status');

    act(() => {
      dispatch?.({ type: 'showToast', message: ru.openScreen.popupBlocked });
    });
    expect(screen.getByRole('status')).toBe(region);

    act(() => {
      vi.advanceTimersByTime(3200);
    });
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    act(() => {
      dispatch?.({ type: 'showToast', message: ru.openScreen.popupBlocked });
    });
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getByRole('status')).toHaveTextContent(ru.openScreen.popupBlocked);
  });
});

describe('App: каталог в main, когда сценарий не открыт (SPEC §4.2:247, DN-24)', () => {
  it('h1 «Сценарии» — заголовок уровня 1, виден внутри main', () => {
    render(<App />);
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeInTheDocument();
  });

  it('открытый сценарий скрывает каталог: заголовка уровня 1 нет (по роли — «Сценарии» есть и в ссылке шапки, SPEC §4.1:241)', () => {
    const scenario = buildScenario('deployment-demo', 'repo');
    const initialState = appReducer(createInitialState(), { type: 'openScenario', scenario });
    render(
      <StoreProvider initialState={initialState}>
        <AppShell />
      </StoreProvider>,
    );
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
