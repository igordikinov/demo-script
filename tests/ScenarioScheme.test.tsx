// SPEC §4.3:259–267 (A2 «Схема сценария»). Разметка и контракт — план DN-11,
// раздел 1: `section[aria-labelledby]` + `h2` (имя = ru.scheme.title), сводка
// ru.scheme.summary, блоки с шапкой (номер/название/«{k} шагов»), список шагов
// — кнопка на всю ширину колонки с точкой, номером, заголовком и иконкой
// ссылки. Клик — selectStep, активный шаг скроллится в видимую область.
//
// Эталон содержания — tests/fixtures/deployment-demo.json (CLAUDE.md: не
// придумывать содержание сценария): 3 блока по [11, 11, 7] шагов, всего 29;
// без `url` — 1.10 (для позиции активного шага) сюда не входит, а 2.3, 2.11,
// 3.3, 3.6, 3.7 (5 шагов) — без ссылки, остальные 24 — со ссылкой.
//
// buildScenario — копия из tests/reducer.test.ts:33–52 (план DN-11, Т1): общий
// хелпер не заводим, чтобы не конфликтовать с DN-12 при мёрже.
//
// Файл рендерит реальные компоненты (@testing-library/react) и поэтому идёт
// в среде jsdom по умолчанию из vitest.config.ts (в отличие от
// tests/reducer.test.ts и tests/schema.test.ts, у которых наверху стоит
// докблок-директива на среду node — писать её текстом здесь нельзя, её ищет
// парсер vitest в любом комментарии файла и переключает среду). Под jsdom
// Vite переписывает `new URL('./x', import.meta.url)` в http(s)-адрес
// dev-сервера, и `fileURLToPath` падает с «The URL must be of scheme file» —
// этот приём для чтения фикстуры годится только в среде node. Здесь читаем
// фикстуру прямым импортом JSON-модуля (tsconfig: resolveJsonModule), что
// работает в обеих средах одинаково.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { StoreProvider } from '../src/state/store';
import { appReducer, createInitialState, flatSteps } from '../src/state/reducer';
import { ScenarioSchema, type Scenario, type Step } from '../src/model/schema';
import { ru } from '../src/i18n/ru';
import { ScenarioScheme } from '../src/components/ScenarioScheme/ScenarioScheme';
import fixtureJson from './fixtures/deployment-demo.json';

const fixture = fixtureJson as {
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
const steps = flatSteps(scenario);
// Шаги без ссылки в фикстуре (SPEC §4.3:265 «точка неактивного шага со ссылкой
// темнее, чем без ссылки») — считаем и закрепляем числом, как того требует план.
const stepsWithoutLink = steps.filter((step) => step.url === '').map((step) => step.id);
const stepsWithLink = steps.filter((step) => step.url !== '');

// jsdom не реализует Element.prototype.scrollIntoView (план DN-11, дефект D1):
// без заглушки эффект автопрокрутки роняет любой рендер компонента.
let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollIntoView,
  });
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

/** Копия сценария с изменённым одним шагом; исходный `scenario` не мутируется.
 * Копия tests/StepCard.test.tsx:87–95 (план DN-dkb, D3) — общий хелпер не
 * заводим, чтобы не конфликтовать с параллельными задачами при мёрже. */
function withStep(source: Scenario, stepId: string, patch: Partial<Step>): Scenario {
  return {
    ...source,
    blocks: source.blocks.map((block) => ({
      ...block,
      steps: block.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    })),
  };
}

function renderScheme(stepId = '1.10', source: Scenario = scenario) {
  const initialState = appReducer(createInitialState(), {
    type: 'openScenario',
    scenario: source,
    stepId,
  });
  return render(
    <StoreProvider initialState={initialState}>
      <ScenarioScheme />
    </StoreProvider>,
  );
}

describe('ScenarioScheme: заголовок и сводка (SPEC §4.3:261)', () => {
  it('регион с именем ru.scheme.title содержит заголовок и сводку «29 шагов · 24 со ссылкой»', () => {
    renderScheme();
    const region = screen.getByRole('region', { name: ru.scheme.title });
    expect(within(region).getByText(ru.scheme.title)).toBeInTheDocument();
    // Числа фиксированы фикстурой (29 шагов, 24 со ссылкой) и должны совпасть
    // с buildScenario/flatSteps, а не с произвольным подсчётом в тесте.
    expect(stepsWithLink).toHaveLength(24);
    expect(within(region).getByText(ru.scheme.summary(29, 24))).toBeInTheDocument();
    expect(ru.scheme.summary(29, 24)).toBe('29 шагов · 24 со ссылкой');
  });
});

describe('ScenarioScheme: блоки (SPEC §4.3:263 — шапка блока: номер, название, «{k} шагов»)', () => {
  it('три блока: названия из фикстуры, номера 1/2/3, «11 шагов» дважды и «7 шагов» один раз', () => {
    renderScheme();
    for (const block of scenario.blocks) {
      expect(screen.getByText(block.title)).toBeInTheDocument();
      expect(screen.getByText(String(block.n))).toBeInTheDocument();
    }
    expect(scenario.blocks.map((block) => block.steps.length)).toEqual([11, 11, 7]);
    expect(screen.getAllByText(ru.scheme.blockSteps(11))).toHaveLength(2);
    expect(screen.getAllByText(ru.scheme.blockSteps(7))).toHaveLength(1);
  });

  it('между блоками — ровно 2 стрелки-соединителя (3 блока, перед первым стрелки нет)', () => {
    const { container } = renderScheme();
    expect(container.querySelectorAll('svg[data-icon="arrow-right"]')).toHaveLength(2);
  });
});

describe('ScenarioScheme: список шагов (SPEC §4.3:265)', () => {
  it('29 кнопок [data-step-id] в порядке flatSteps, aria-current="step" ровно у активного шага 1.10', () => {
    renderScheme('1.10');
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(29);
    expect(buttons.map((button) => button.getAttribute('data-step-id'))).toEqual(
      steps.map((step) => step.id),
    );
    const current = buttons.filter((button) => button.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('data-step-id', '1.10');
  });

  it('клик по шагу 2.5 делает его активным, снимая aria-current с прежнего шага', () => {
    renderScheme('1.10');
    const target = screen.getByRole('button', {
      name: (_accessibleName, element) => element.getAttribute('data-step-id') === '2.5',
    });
    fireEvent.click(target);

    expect(target).toHaveAttribute('aria-current', 'step');
    const previous = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('data-step-id') === '1.10');
    expect(previous).not.toHaveAttribute('aria-current');
  });

  it('иконка внешней ссылки и data-link="true" — ровно у 24 кнопок, и только у шагов с url', () => {
    renderScheme();
    const buttons = screen.getAllByRole('button');
    const withIcon = buttons.filter(
      (button) => button.querySelector('svg[data-icon="external-link"]') !== null,
    );
    const withLinkAttr = buttons.filter((button) => button.getAttribute('data-link') === 'true');
    expect(withIcon).toHaveLength(24);
    expect(withLinkAttr).toHaveLength(24);

    for (const button of buttons) {
      const stepId = button.getAttribute('data-step-id');
      const step = steps.find((candidate) => candidate.id === stepId);
      expect(step).toBeDefined();
      const hasIcon = button.querySelector('svg[data-icon="external-link"]') !== null;
      const hasLinkAttr = button.getAttribute('data-link') === 'true';
      expect(hasIcon).toBe(step?.url !== '');
      expect(hasLinkAttr).toBe(step?.url !== '');
    }
    // Число шагов без ссылки в фикстуре — 5 (2.3, 2.11, 3.3, 3.6, 3.7), 29 − 5 = 24.
    expect(stepsWithoutLink).toEqual(['2.3', '2.11', '3.3', '3.6', '3.7']);
  });

  it('title кнопки равен полному тексту step.title (SPEC §4.3:265 — «title — полный текст»)', () => {
    renderScheme();
    for (const step of steps) {
      const button = screen
        .getAllByRole('button')
        .find((candidate) => candidate.getAttribute('data-step-id') === step.id);
      expect(button).toHaveAttribute('title', step.title);
    }
  });

  it('url «испорчен» (javascript:) у активного шага 1.10 — считается «нет ссылки»: сводка «23 со ссылкой», без иконки и data-link (решение владельца DN-dkb)', () => {
    const step = steps.find((candidate) => candidate.id === '1.10');
    if (step === undefined) {
      throw new Error('фикстура не знает шаг 1.10');
    }
    expect(step.url.startsWith('https://')).toBe(true);
    const patched = withStep(scenario, '1.10', { url: 'javascript:alert(1)' });

    const { container } = renderScheme('1.10', patched);
    const region = screen.getByRole('region', { name: ru.scheme.title });
    expect(within(region).getByText(ru.scheme.summary(29, 23))).toBeInTheDocument();
    expect(within(region).queryByText(ru.scheme.summary(29, 24))).not.toBeInTheDocument();

    const button = container.querySelector('[data-step-id="1.10"]');
    if (button === null) {
      throw new Error('кнопка шага 1.10 не найдена');
    }
    expect(button.querySelector('svg[data-icon="external-link"]')).toBeNull();
    expect(button).not.toHaveAttribute('data-link');
    expect(container.querySelectorAll('svg[data-icon="external-link"]')).toHaveLength(23);
  });
});

describe('ScenarioScheme: прокрутка активного шага (SPEC §4.3:265 — scrollIntoView)', () => {
  it('клик по шагу вызывает scrollIntoView({block:"nearest", inline:"nearest"}) ровно один раз на кнопке шага', () => {
    renderScheme('1.10');
    scrollIntoView.mockClear();

    const target = screen.getByRole('button', {
      name: (_accessibleName, element) => element.getAttribute('data-step-id') === '2.5',
    });
    fireEvent.click(target);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(target);
  });
});

describe('ScenarioScheme: без сценария', () => {
  it('в каталоге (initialState по умолчанию) компонент ничего не рендерит и не трогает scrollIntoView', () => {
    const { container } = render(
      <StoreProvider>
        <ScenarioScheme />
      </StoreProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
