// ТК 17 (SPEC §8:413, дословно): «"Показать на карте" → iframe.src =
// pmLink(...).url; смена шага меняет src; у шага без узла iframe нет».
// Компонент — DN-15 (SPEC §4.6:311–315, design/Демо-навигатор v2.dc.html:171–181).
// Хелперы и фикстура — копии из tests/StepCard.test.tsx (CLAUDE.md: не
// придумывать содержание сценария). Сеть не нужна: jsdom не грузит src у iframe.
import { StrictMode, type Dispatch } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, render, screen, within } from '@testing-library/react';
import { ScenarioSchema, type Scenario, type Step } from '../src/model/schema';
import {
  appReducer,
  createInitialState,
  flatSteps,
  type AppAction,
  type AppState,
} from '../src/state/reducer';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { ru } from '../src/i18n/ru';
import { pmLink } from '../src/pm/pmLink';
import { pmSnapshots } from '../src/pm/snapshots';
import { StepCard } from '../src/components/StepCard/StepCard';
import {
  PROCESS_MAP_EMBED_ID,
  ProcessMapSection,
} from '../src/components/ProcessMapSection/ProcessMapSection';
import { AppShell } from '../src/App';

// Тот же приём с переменной, что в tests/StepCard.test.tsx: Vite в jsdom иначе
// подставит вместо файлового URL адрес self.location.
const importMetaUrl = import.meta.url;
const fixturePath = fileURLToPath(new URL('./fixtures/deployment-demo.json', importMetaUrl));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

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

const scenario = buildScenario('deployment-demo', 'repo');

function findStep(source: Scenario, stepId: string): Step {
  const step = flatSteps(source).find((candidate) => candidate.id === stepId);
  if (step === undefined) {
    throw new Error(`фикстура не знает шаг ${stepId}`);
  }
  return step;
}

function Probe({ capture }: { capture?: (dispatch: Dispatch<AppAction>) => void }) {
  const { dispatch } = useAppStore();
  capture?.(dispatch);
  return null;
}

/**
 * Открывает сценарий на нужном шаге, дополняя начальное состояние (например, mapOpen).
 * `strict` — обернуть в StrictMode (DN-us0, D3): двойной запуск эффектов при
 * монтировании не должен давать лишнюю прокрутку к карте.
 */
function renderMap(
  source: Scenario,
  stepId: string,
  patch: Partial<AppState> = {},
  capture?: (dispatch: Dispatch<AppAction>) => void,
  strict = false,
) {
  const opened = appReducer(createInitialState(), {
    type: 'openScenario',
    scenario: source,
    stepId,
  });
  const initialState: AppState = { ...opened, ...patch };
  const tree = (
    <StoreProvider initialState={initialState}>
      <StepCard />
      <ProcessMapSection />
      <Probe capture={capture} />
    </StoreProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const node110 = findStep(scenario, '1.10').node;
const node111 = findStep(scenario, '1.11').node;
const URL_110 = `https://igordikinov.github.io/process-map/?stage=4&node=${node110}`;
const URL_111 = `https://igordikinov.github.io/process-map/?stage=4&node=${node111}`;

const stage4Title = pmSnapshots().snp.stages.find((s) => s.number === 4)?.title;
if (stage4Title === undefined) {
  throw new Error('в снимке snp нет этапа 4 (см. src/data/pm/snp.json)');
}

describe('ТК 17 (SPEC §8:413): «Показать на карте» → iframe.src = pmLink(...).url; смена шага меняет src; у шага без узла iframe нет', () => {
  it('до клика по «Показать на карте» iframe нет', () => {
    renderMap(scenario, '1.10');
    expect(screen.queryByTitle(ru.processMap.iframeTitle)).not.toBeInTheDocument();
  });

  it('после клика src === pmLink(...).url (и совпадает с литеральным адресом)', () => {
    renderMap(scenario, '1.10');
    act(() => {
      screen.getByRole('button', { name: ru.processMap.show }).click();
    });
    const iframe = screen.getByTitle(ru.processMap.iframeTitle);
    const link = pmLink('snp', node110);
    if (link === null) {
      throw new Error('фикстура: у шага 1.10 нет узла карты snp');
    }
    expect(iframe.getAttribute('src')).toBe(link.url);
    expect(iframe.getAttribute('src')).toBe(URL_110);
  });

  it('смена шага (1.10 → 1.11) меняет src, кнопка остаётся «Скрыть карту»', () => {
    let dispatch: Dispatch<AppAction> | null = null;
    renderMap(scenario, '1.10', {}, (d) => {
      dispatch = d;
    });
    act(() => {
      screen.getByRole('button', { name: ru.processMap.show }).click();
    });

    act(() => {
      dispatch?.({ type: 'nextStep' });
    });
    const iframe = screen.getByTitle(ru.processMap.iframeTitle);
    expect(iframe.getAttribute('src')).toBe(URL_111);
    expect(screen.getByRole('button', { name: ru.processMap.hide })).toBeInTheDocument();
  });

  describe('шаг без узла (SPEC §4.6:314) — iframe не рендерится, даже если признак включён', () => {
    it('selectStep на 3.7 убирает iframe и заголовок «PROCESS MAP»; возврат на 1.11 (признак сохранился) — iframe снова есть', () => {
      let dispatch: Dispatch<AppAction> | null = null;
      renderMap(scenario, '1.10', {}, (d) => {
        dispatch = d;
      });
      act(() => {
        screen.getByRole('button', { name: ru.processMap.show }).click();
      });

      act(() => {
        dispatch?.({ type: 'selectStep', stepId: '3.7' });
      });
      expect(screen.queryByTitle(ru.processMap.iframeTitle)).not.toBeInTheDocument();
      expect(screen.queryByText(ru.processMap.embedTitle)).not.toBeInTheDocument();

      act(() => {
        dispatch?.({ type: 'selectStep', stepId: '1.11' });
      });
      expect(screen.getByTitle(ru.processMap.iframeTitle)).toHaveAttribute('src', URL_111);
    });

    it('mapOpen=true изначально на 3.7 — iframe нет', () => {
      renderMap(scenario, '3.7', { mapOpen: true });
      expect(screen.queryByTitle(ru.processMap.iframeTitle)).not.toBeInTheDocument();
    });

    it("1.10 с узлом 'constructor' и mapOpen=true — узел неизвестен, iframe нет", () => {
      const patched: Scenario = {
        ...scenario,
        blocks: scenario.blocks.map((block) => ({
          ...block,
          steps: block.steps.map((step) =>
            step.id === '1.10' ? { ...step, node: 'constructor' } : step,
          ),
        })),
      };
      renderMap(patched, '1.10', { mapOpen: true });
      expect(screen.queryByTitle(ru.processMap.iframeTitle)).not.toBeInTheDocument();
    });
  });

  it('атрибуты iframe: title, loading="lazy", referrerpolicy="no-referrer"; регион «PROCESS MAP» содержит текст этапа, id совпадает с aria-controls кнопки', () => {
    renderMap(scenario, '1.10');
    act(() => {
      screen.getByRole('button', { name: ru.processMap.show }).click();
    });
    const iframe = screen.getByTitle(ru.processMap.iframeTitle);
    expect(iframe).toHaveAttribute('loading', 'lazy');
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');

    const region = screen.getByRole('region', { name: ru.processMap.embedTitle });
    expect(region).toHaveAttribute('id', PROCESS_MAP_EMBED_ID);
    expect(within(region).getByText(ru.processMap.stage(4, stage4Title))).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: ru.processMap.hide });
    expect(toggle).toHaveAttribute('aria-controls', region.getAttribute('id'));
  });

  it('«Скрыть карту» убирает iframe', () => {
    renderMap(scenario, '1.10');
    act(() => {
      screen.getByRole('button', { name: ru.processMap.show }).click();
    });
    act(() => {
      screen.getByRole('button', { name: ru.processMap.hide }).click();
    });
    expect(screen.queryByTitle(ru.processMap.iframeTitle)).not.toBeInTheDocument();
  });

  it('mapOpen=false изначально у шага с узлом — iframe нет', () => {
    renderMap(scenario, '1.10', { mapOpen: false });
    expect(screen.queryByTitle(ru.processMap.iframeTitle)).not.toBeInTheDocument();
  });
});

// Держать этот тест здесь, а не в App.test.tsx (DN-15): раскладка встроенной
// карты — часть этого компонента, а не App.
describe('Раскладка (SPEC §4.4:285): встроенная карта — секция под карточкой, внутри main', () => {
  it('регион карты внутри main, идёт после article', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '1.10',
    });
    const initialState: AppState = { ...opened, mapOpen: true };
    render(
      <StoreProvider initialState={initialState}>
        <AppShell />
      </StoreProvider>,
    );
    const main = screen.getByRole('main');
    const article = screen.getByRole('article');
    const region = screen.getByRole('region', { name: ru.processMap.embedTitle });

    expect(main).toContainElement(region);
    expect(article.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// Прокрутка к встроенной карте после «Показать на карте» — решение владельца
// 19.09.2026, записано в SPEC §4.6:311 (DN-us0). Хелперы — рядом, а не в
// отдельном файле: используются только этими тестами (тот же приём, что и
// копии buildScenario/findStep выше — общий файл рискует конфликтом при
// параллельном мёрже).
const H = window.innerHeight;

interface MapScrollCall {
  arg: unknown;
  target: HTMLElement;
}

/**
 * Заголовку встроенной карты (элементу внутри #process-map-embed, через
 * closest) — прямоугольник {mapTop, mapBottom}; всем остальным, включая
 * шапку карточки шага, — видимый прямоугольник 100..171, как в
 * tests/navigation.test.tsx, чтобы правило карточки §4.5:291 не добавляло
 * свой вызов scrollIntoView в счётчик этих тестов.
 */
function stubRects(mapTop: number, mapBottom: number): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ): DOMRect {
    const inMap = this.closest(`#${PROCESS_MAP_EMBED_ID}`) !== null;
    const top = inMap ? mapTop : 100;
    const bottom = inMap ? mapBottom : 171;
    return {
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON() {
        return {};
      },
    };
  });
}

/** Вызовы scrollIntoView, у которых this — элемент внутри секции встроенной карты. */
function mapScrollCalls(): MapScrollCall[] {
  const mock = vi.mocked(Element.prototype.scrollIntoView).mock;
  const calls: MapScrollCall[] = [];
  mock.contexts.forEach((context, index) => {
    // context — ThisParameterType у type-erased метода на прототипе (unknown,
    // как и в tests/navigation.test.tsx: scrollIntoView вызывается только на
    // элементах DOM). Приведение — не any, тип сужен явно.
    const target = context as HTMLElement;
    if (target.closest(`#${PROCESS_MAP_EMBED_ID}`) !== null) {
      calls.push({ arg: mock.calls[index]?.[0], target });
    }
  });
  return calls;
}

/** Копия mql() из tests/setup.ts: полная заглушка MediaQueryList под конкретный запрос. */
function mql(media: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
}

/** matches — true только у запроса prefers-reduced-motion, и только если reduce. */
function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => mql(query, reduce && query === '(prefers-reduced-motion: reduce)')),
  );
}

describe('Прокрутка к встроенной карте после «Показать на карте» (SPEC §4.6:311; DN-us0)', () => {
  // getBoundingClientRect подменяется через vi.spyOn (stubRects) ниже — без
  // restoreAllMocks реализация утекла бы в другие тесты этого файла (DN-us0).
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['ниже края', H + 302, H + 326],
    ['пересекает нижний край', H - 10, H + 14],
    ['выше края', -80, -56],
  ] as const)(
    'U1: заголовок карты %s — «Показать на карте» прокручивает к нему (smooth)',
    (_label, top, bottom) => {
      renderMap(scenario, '1.10');
      stubRects(top, bottom);
      act(() => {
        screen.getByRole('button', { name: ru.processMap.show }).click();
      });

      const calls = mapScrollCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0]?.arg).toEqual({ block: 'start', behavior: 'smooth' });
      const target = calls[0]?.target;
      if (target === undefined) {
        throw new Error('нет вызова scrollIntoView у заголовка карты');
      }
      expect(
        within(target).getByRole('heading', { name: ru.processMap.embedTitle }),
      ).toBeInTheDocument();
      expect(within(target).queryByTitle(ru.processMap.iframeTitle)).not.toBeInTheDocument();
      expect(vi.mocked(window.matchMedia)).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    },
  );

  it('U2: prefers-reduced-motion: reduce — прокрутка мгновенная (behavior: "auto")', () => {
    stubReducedMotion(true);
    renderMap(scenario, '1.10');
    stubRects(H + 200, H + 400);
    act(() => {
      screen.getByRole('button', { name: ru.processMap.show }).click();
    });

    const calls = mapScrollCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.arg).toEqual({ block: 'start', behavior: 'auto' });
  });

  it('U3: matchMedia отсутствует (jsdom 25) — исключения нет, прокрутка как без «уменьшения движения» (behavior: "smooth")', () => {
    vi.stubGlobal('matchMedia', undefined);
    renderMap(scenario, '1.10');
    stubRects(H + 200, H + 400);

    expect(() => {
      act(() => {
        screen.getByRole('button', { name: ru.processMap.show }).click();
      });
    }).not.toThrow();

    const calls = mapScrollCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.arg).toEqual({ block: 'start', behavior: 'smooth' });
  });

  it.each([
    ['целиком в окне', 100, 124],
    ['касается верхнего края', 0, 24],
    ['касается нижнего края', H - 24, H],
  ] as const)(
    'U4: заголовок карты %s — «Показать на карте» не прокручивает',
    (_label, top, bottom) => {
      renderMap(scenario, '1.10');
      stubRects(top, bottom);
      act(() => {
        screen.getByRole('button', { name: ru.processMap.show }).click();
      });
      expect(vi.mocked(Element.prototype.scrollIntoView)).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['nextStep (1.10 → 1.11)', '1.10', 'nextStep', URL_111],
    ['prevStep (1.11 → 1.10)', '1.11', 'prevStep', URL_110],
    ["selectStep '1.11' (1.10 → 1.11)", '1.10', 'selectStep', URL_111],
  ] as const)(
    'U5: карта раскрыта вне окна — смена шага (%s) её не прокручивает, src меняется',
    (_label, startStep, action, expectedUrl) => {
      let dispatch: Dispatch<AppAction> | null = null;
      renderMap(scenario, startStep, {}, (d) => {
        dispatch = d;
      });
      stubRects(H + 200, H + 400);
      act(() => {
        screen.getByRole('button', { name: ru.processMap.show }).click();
      });
      expect(mapScrollCalls()).toHaveLength(1);
      vi.mocked(Element.prototype.scrollIntoView).mockClear();

      act(() => {
        if (action === 'selectStep') {
          dispatch?.({ type: 'selectStep', stepId: '1.11' });
        } else {
          dispatch?.({ type: action });
        }
      });

      expect(screen.getByTitle(ru.processMap.iframeTitle)).toHaveAttribute('src', expectedUrl);
      expect(mapScrollCalls()).toHaveLength(0);
    },
  );

  it('U6a: карта раскрыта — шаг без узла (3.7) и обратно на 1.11 не прокручивают карту при повторном монтировании секции', () => {
    let dispatch: Dispatch<AppAction> | null = null;
    renderMap(scenario, '1.10', {}, (d) => {
      dispatch = d;
    });
    stubRects(H + 200, H + 400);
    act(() => {
      screen.getByRole('button', { name: ru.processMap.show }).click();
    });
    expect(mapScrollCalls()).toHaveLength(1);
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    act(() => {
      dispatch?.({ type: 'selectStep', stepId: '3.7' });
    });
    expect(screen.queryByText(ru.processMap.embedTitle)).not.toBeInTheDocument();

    act(() => {
      dispatch?.({ type: 'selectStep', stepId: '1.11' });
    });
    expect(screen.getByTitle(ru.processMap.iframeTitle)).toHaveAttribute('src', URL_111);
    expect(mapScrollCalls()).toHaveLength(0);
  });

  it('U6b: mapOpen=true изначально на шаге без узла (3.7) — переход на 1.10 не прокручивает карту', () => {
    let dispatch: Dispatch<AppAction> | null = null;
    stubRects(H + 200, H + 400);
    renderMap(scenario, '3.7', { mapOpen: true }, (d) => {
      dispatch = d;
    });

    act(() => {
      dispatch?.({ type: 'selectStep', stepId: '1.10' });
    });
    expect(screen.getByRole('region', { name: ru.processMap.embedTitle })).toBeInTheDocument();
    expect(mapScrollCalls()).toHaveLength(0);
  });

  it('U6c: mapOpen=true и узел есть уже при первом рендере (открытие из каталога) — секция сразу на месте, без прокрутки', () => {
    stubRects(H + 200, H + 400);
    renderMap(scenario, '1.10', { mapOpen: true });
    expect(screen.getByRole('region', { name: ru.processMap.embedTitle })).toBeInTheDocument();
    expect(mapScrollCalls()).toHaveLength(0);
  });

  it('U7: «Скрыть карту» не прокручивает', () => {
    renderMap(scenario, '1.10');
    stubRects(H + 200, H + 400);
    act(() => {
      screen.getByRole('button', { name: ru.processMap.show }).click();
    });
    expect(mapScrollCalls()).toHaveLength(1);
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    act(() => {
      screen.getByRole('button', { name: ru.processMap.hide }).click();
    });
    expect(vi.mocked(Element.prototype.scrollIntoView)).not.toHaveBeenCalled();
  });

  it('U8: повторное раскрытие после «Скрыть карту» снова прокручивает ровно один раз', () => {
    renderMap(scenario, '1.10');
    stubRects(H + 200, H + 400);
    act(() => {
      screen.getByRole('button', { name: ru.processMap.show }).click();
    });
    expect(mapScrollCalls()).toHaveLength(1);

    act(() => {
      screen.getByRole('button', { name: ru.processMap.hide }).click();
    });
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    act(() => {
      screen.getByRole('button', { name: ru.processMap.show }).click();
    });
    expect(mapScrollCalls()).toHaveLength(1);
  });

  describe('StrictMode: двойной запуск эффектов на монтировании (React 18, DN-us0)', () => {
    it('U9a: mapOpen=true с первого рендера, вне окна — 0 вызовов, несмотря на двойное монтирование', () => {
      stubRects(H + 200, H + 400);
      renderMap(scenario, '1.10', { mapOpen: true }, undefined, true);
      expect(mapScrollCalls()).toHaveLength(0);
    });

    it('U9b: из закрытого состояния клик «Показать на карте» в StrictMode — ровно 1 вызов', () => {
      renderMap(scenario, '1.10', {}, undefined, true);
      stubRects(H + 200, H + 400);
      act(() => {
        screen.getByRole('button', { name: ru.processMap.show }).click();
      });
      expect(mapScrollCalls()).toHaveLength(1);
    });
  });

  it('U10: закрытие сценария и повторное открытие того же (DN-26) сбрасывает прокрутку окна, но не крутит карту', () => {
    let dispatch: Dispatch<AppAction> | null = null;
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '1.10',
    });
    const initialState: AppState = { ...opened, mapOpen: true };
    stubRects(H + 200, H + 400);
    render(
      <StoreProvider initialState={initialState}>
        <AppShell />
        <Probe
          capture={(d) => {
            dispatch = d;
          }}
        />
      </StoreProvider>,
    );
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    vi.mocked(window.scrollTo).mockClear();

    act(() => {
      dispatch?.({ type: 'closeScenario' });
    });
    act(() => {
      dispatch?.({ type: 'openScenario', scenario, stepId: '1.10' });
    });

    expect(vi.mocked(window.scrollTo)).toHaveBeenCalledWith(0, 0);
    expect(mapScrollCalls()).toHaveLength(0);
  });
});
