// Контракт App — план DN-10, раздел 3.5: App = StoreProvider(AppShell),
// AppShell = <Header/><main/><Toast restartKey={toast?.seq}/> (без restartKey
// повторный showToast с тем же текстом не перезапускает отсчёт — план,
// дефект «D9» из Toast, здесь проверяется через AppShell). seq передаётся
// именно в restartKey, а не в key: живой регион role="status" — один и тот
// же DOM-узел между тостами (план DN-k9y), key на Toast пересоздал бы его.
// Тост держится 3200 мс (SPEC §4.8:346, план D4: advanceTimersByTime внутри
// act, т.к. таймер вызывает dispatch в StoreProvider).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Dispatch } from 'react';
import App, { AppShell } from '../src/App';
import { StoreProvider } from '../src/state/store';
import { appReducer, createInitialState, flatSteps, type AppAction } from '../src/state/reducer';
import { useAppStore } from '../src/state/context';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import { toIndexItem } from '../src/model/scenarioIndex';
import { LIBRARY_KEY } from '../src/state/library';
import type { FetchFn } from '../src/state/shared';
import { ru } from '../src/i18n/ru';
import { appBanner } from './helpers';
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

  it('открытый сценарий скрывает каталог: нет h1 «Сценарии», поиска и региона «Общие»; h1 — название шага (А1)', () => {
    const scenario = buildScenario('deployment-demo', 'repo');
    const initialState = appReducer(createInitialState(), { type: 'openScenario', scenario });
    render(
      <StoreProvider initialState={initialState}>
        <AppShell />
      </StoreProvider>,
    );
    // Единственный h1 — название активного шага (StepCard, SPEC §4.4), а не
    // «Сценарии» (§4.2:247): queryByRole('heading', {level:1}) без name было
    // бы true и без карточки — имя проверяем явно.
    expect(
      screen.queryByRole('heading', { level: 1, name: ru.catalog.title }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('searchbox', { name: ru.catalog.searchPlaceholder }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: ru.catalog.sharedTitle })).not.toBeInTheDocument();
    const s11 = findStep(scenario, '1.1');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(s11.title);
  });
});

/** Копия findStep из tests/StepCard.test.tsx:70–76 — своя, чтобы не заводить общий хелпер (риск мёржа). */
function findStep(source: Scenario, stepId: string) {
  const step = flatSteps(source).find((candidate) => candidate.id === stepId);
  if (step === undefined) {
    throw new Error(`фикстура не знает шаг ${stepId}`);
  }
  return step;
}

describe('App: раскладка и переходы экрана сценария (SPEC §4.1:241, §4.3, §4.4, §4.7:318; DN-26)', () => {
  const shared = buildScenario('deployment-demo', 'repo');
  const mine = buildScenario('my-deployment-demo', 'local');

  function seedLibrary(items: Scenario[]): void {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify({ schema: 1, items }));
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
  }

  // Без явного возвращаемого типа: FetchFn стёр бы Mock<…>, и .mock.calls
  // (нужен в А7) не типизировался бы — как в tests/Catalog.test.tsx, где
  // счётчик вызовов проверяют через expect(fetchFn), не через .mock напрямую.
  /** fetchFn с индексом из одного элемента (shared) и файлом сценария (§3.7:230). */
  function sharedFetch() {
    return vi.fn(async (url: Parameters<FetchFn>[0]) => {
      if (url === './scenarios/index.json') {
        return jsonResponse({ schema: 1, builtAt: '', items: [toIndexItem(shared)] });
      }
      if (url === './scenarios/deployment-demo.json') {
        return jsonResponse(shared);
      }
      return new Response('not found', { status: 404 });
    });
  }

  // appBanner (различает шапку A0 и заголовок StepCard внутри <article> —
  // aria-query 5.3.0 не учитывает ancestor-констрейнт banner) — tests/helpers.ts,
  // общий для всех jsdom-тестов, где сценарий может быть открыт.

  interface ProbeSnapshot {
    scenario: string | null;
    stepId: string | null;
  }

  /** Зонд состояния — <pre>, не <output>, иначе второй role="status" рядом с тостом. */
  function StateProbe() {
    const { state } = useAppStore();
    const snapshot: ProbeSnapshot = { scenario: state.scenario?.id ?? null, stepId: state.stepId };
    return <pre data-testid="state-probe">{JSON.stringify(snapshot)}</pre>;
  }

  function probeState(): ProbeSnapshot {
    return JSON.parse(screen.getByTestId('state-probe').textContent ?? '{}') as ProbeSnapshot;
  }

  it('прокрутка: открытие и возврат в каталог начинаются с верха страницы; полоса схемы scrollIntoView не вызывает (SPEC §4.1:241, §4.3:267, §4.10:358, DN-91e)', () => {
    seedLibrary([mine]);
    render(
      <StoreProvider>
        <AppShell />
      </StoreProvider>,
    );
    // AppShell сбрасывает прокрутку окна при смене сценария (SPEC §4.1:241,
    // §4.10:358) через window.scrollTo(0, 0) (DN-26). Заглушка — tests/setup.ts
    // (как и scrollIntoView ниже): jsdom реализует scrollTo, но пишет «Not
    // implemented» в консоль и не совершает прокрутку.
    const scrollToSpy = vi.mocked(window.scrollTo);
    // Первый рендер страницу не трогает — она и так наверху.
    expect(scrollToSpy).not.toHaveBeenCalled();

    const localRegion = screen.getByRole('region', { name: ru.catalog.localTitle });
    fireEvent.click(within(localRegion).getByRole('button', { name: mine.title }));
    expect(screen.getByRole('region', { name: ru.scheme.title })).toBeInTheDocument();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);

    // DN-91e (§4.3:267): полоса схемы прокручивает только себя по горизонтали
    // (scrollLeft контейнера) — scrollIntoView она не вызывает вовсе, значит
    // сбросу окна (§4.10:358) больше нечего опережать.
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    expect(scrollIntoView).not.toHaveBeenCalled();

    // Переход к другому шагу — не смена экрана: окно не сбрасывается, и клик
    // по самой полосе тоже не вызывает scrollIntoView.
    const step110 = document.querySelector('[data-step-id="1.10"]');
    if (step110 === null) {
      throw new Error('в схеме нет шага 1.10');
    }
    fireEvent.click(step110);
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: ru.header.back }));
    expect(screen.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeInTheDocument();
    expect(scrollToSpy).toHaveBeenCalledTimes(2);
    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);
  });

  it('полоса схемы — вне main, карточка — внутри main, активный шаг 1.1 (А2)', () => {
    const initialState = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario: shared,
    });
    render(
      <StoreProvider initialState={initialState}>
        <AppShell />
      </StoreProvider>,
    );

    const region = screen.getByRole('region', { name: ru.scheme.title });
    const main = screen.getByRole('main');
    expect(main.contains(region)).toBe(false);
    // Схема — раньше main в порядке DOM (SPEC §4.3 «под шапкой», §4.4 «под схемой»).
    expect(Boolean(region.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    );

    const article = within(main).getByRole('article');
    const s11 = findStep(shared, '1.1');
    expect(within(article).getByRole('heading', { level: 1 })).toHaveTextContent(s11.title);

    const activeStep = region.querySelector('[data-step-id="1.1"]');
    expect(activeStep).toHaveAttribute('aria-current', 'step');
  });

  it('«мой»: клик строки открывает сценарий на первом шаге, Tag «мой», без Tag «общий» (А3)', () => {
    seedLibrary([mine]);
    render(
      <StoreProvider>
        <AppShell />
        <StateProbe />
      </StoreProvider>,
    );

    const localRegion = screen.getByRole('region', { name: ru.catalog.localTitle });
    fireEvent.click(within(localRegion).getByRole('button', { name: mine.title }));

    const s11 = findStep(mine, '1.1');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(s11.title);
    expect(screen.getByText(ru.card.position(1, 1, 11))).toBeInTheDocument();
    expect(probeState()).toEqual({ scenario: 'my-deployment-demo', stepId: '1.1' });

    const banner = within(appBanner());
    expect(banner.getByText(ru.header.tagLocal)).toBeInTheDocument();
    expect(banner.queryByText(ru.header.tagRepo)).not.toBeInTheDocument();

    expect(screen.getByRole('region', { name: ru.scheme.title })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: ru.catalog.title }),
    ).not.toBeInTheDocument();
  });

  it('общий: открытие на первом шаге, переход к 1.10, «‹ Сценарии», повторное открытие без повторного fetch (А4–А7)', async () => {
    const fetchFn = sharedFetch();
    render(
      <StoreProvider fetchFn={fetchFn}>
        <AppShell />
        <StateProbe />
      </StoreProvider>,
    );

    // А4
    const sharedRegion = screen.getByRole('region', { name: ru.catalog.sharedTitle });
    const openButton = await within(sharedRegion).findByRole('button', { name: shared.title });
    fireEvent.click(openButton);

    const s11 = findStep(shared, '1.1');
    expect(await screen.findByRole('heading', { level: 1, name: s11.title })).toBeInTheDocument();
    let banner = within(appBanner());
    expect(banner.getByText(ru.header.tagRepo)).toBeInTheDocument();
    expect(banner.queryByText(ru.header.tagLocal)).not.toBeInTheDocument();
    expect(probeState()).toEqual({ scenario: 'deployment-demo', stepId: '1.1' });

    // А5
    const step110 = document.querySelector('[data-step-id="1.10"]');
    if (step110 === null) {
      throw new Error('в схеме нет шага 1.10');
    }
    fireEvent.click(step110);
    const s110 = findStep(shared, '1.10');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(s110.title);
    expect(screen.getByText(ru.card.position(1, 10, 11))).toBeInTheDocument();
    expect(step110).toHaveAttribute('aria-current', 'step');
    expect(probeState().stepId).toBe('1.10');

    // А6
    fireEvent.click(screen.getByRole('button', { name: ru.header.back }));
    expect(screen.getByRole('heading', { level: 1, name: ru.catalog.title })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: ru.scheme.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    banner = within(appBanner());
    expect(banner.queryByText(ru.header.tagRepo)).not.toBeInTheDocument();
    expect(banner.queryByText(ru.header.tagLocal)).not.toBeInTheDocument();
    expect(probeState()).toEqual({ scenario: null, stepId: null });

    const sharedRegionAgain = screen.getByRole('region', { name: ru.catalog.sharedTitle });
    expect(
      within(sharedRegionAgain).getByRole('button', { name: shared.title }),
    ).toBeInTheDocument();
    expect(sharedRegionAgain.querySelectorAll('tr[data-skeleton="true"]')).toHaveLength(0);

    // А7
    fireEvent.click(within(sharedRegionAgain).getByRole('button', { name: shared.title }));
    expect(await screen.findByRole('heading', { level: 1, name: s11.title })).toBeInTheDocument();
    expect(probeState()).toEqual({ scenario: 'deployment-demo', stepId: '1.1' });

    const calledUrls = fetchFn.mock.calls.map(([url]) => url);
    expect(calledUrls.filter((url) => url === './scenarios/index.json')).toHaveLength(1);
    expect(calledUrls.filter((url) => url === './scenarios/deployment-demo.json')).toHaveLength(1);
  });
});
