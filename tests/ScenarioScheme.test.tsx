// SPEC §4.3:259–267 (A2 «Схема сценария»). Разметка и контракт — план DN-11,
// раздел 1: `section[aria-labelledby]` + `h2` (имя = ru.scheme.title), сводка
// ru.scheme.summary, блоки с шапкой (номер/название/«{k} шагов»), список шагов
// — кнопка на всю ширину колонки с точкой, номером, заголовком и иконкой
// ссылки. Клик — selectStep; полоса прокручивает саму себя по горизонтали до
// активного шага (`scrollLeft` контейнера `[data-scheme-row]`), страницу по
// вертикали не двигает — это делает только правило карточки §4.5:291 (решение
// владельца DN-91e, SPEC 1.6 §11 №20; было — `scrollIntoView` на кнопке шага).
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
// Контракт скрытой подсказки (SPEC §4.3:267, §11:623, план DN-36l) — класс
// visuallyHidden, тот же, что проверяет tests/VisuallyHidden.test.tsx.
import hiddenStyles from '../src/components/ui/VisuallyHidden.module.css';
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
    // «Испорченный» url — тоже «нет ссылки» для скрытой подсказки (§11:623):
    // у 1.10 её нет, а на всю схему остаётся 23 подсказки вместо 24.
    expect(button.textContent).not.toContain(ru.scheme.linkHint);
    expect(screen.getAllByText(ru.scheme.linkHint)).toHaveLength(23);
  });
});

describe('ScenarioScheme: скрытая подпись ссылки (SPEC §4.3:267, §11:623)', () => {
  it('доступное имя содержит ru.scheme.linkHint ровно у 24 кнопок — у шагов из stepsWithLink, и только у них', () => {
    renderScheme();
    const namesWithHint = new Map<string, string>();
    // Доступное имя берём через callback getByRole — он получает готовую
    // строку имени, что надёжнее ручного computeAccessibleName (план, дефект 4).
    for (const step of steps) {
      let capturedName: string | undefined;
      screen.getByRole('button', {
        name: (accessibleName, element) => {
          if (element.getAttribute('data-step-id') === step.id) {
            capturedName = accessibleName;
          }
          return element.getAttribute('data-step-id') === step.id;
        },
      });
      if (capturedName === undefined) {
        throw new Error(`кнопка шага ${step.id} не найдена`);
      }
      const hasHint = capturedName.includes(ru.scheme.linkHint);
      namesWithHint.set(step.id, capturedName);
      expect(hasHint).toBe(step.url !== '');
    }
    const idsWithHint = [...namesWithHint.entries()]
      .filter(([, name]) => name.includes(ru.scheme.linkHint))
      .map(([id]) => id);
    expect(idsWithHint.sort()).toEqual(stepsWithLink.map((step) => step.id).sort());
    expect(idsWithHint).toHaveLength(24);
    for (const id of stepsWithoutLink) {
      expect(namesWithHint.get(id)).not.toContain(ru.scheme.linkHint);
    }
  });

  it('доступное имя кнопки с подсказкой содержит и step.title (не заменяет его)', () => {
    renderScheme();
    for (const step of stepsWithLink) {
      let capturedName = '';
      screen.getByRole('button', {
        name: (accessibleName, element) => {
          const match = element.getAttribute('data-step-id') === step.id;
          if (match) capturedName = accessibleName;
          return match;
        },
      });
      expect(capturedName).toContain(step.title);
      expect(capturedName).toContain(ru.scheme.linkHint);
    }
  });

  it('текст подсказки — ровно одна на кнопку (24 штуки), класс visuallyHidden, не внутри aria-hidden', () => {
    renderScheme();
    // noUncheckedIndexedAccess: индексный доступ типизирован как string | undefined.
    const { visuallyHidden } = hiddenStyles;
    if (visuallyHidden === undefined) {
      throw new Error('в VisuallyHidden.module.css нет класса .visuallyHidden');
    }
    const hints = screen.getAllByText(ru.scheme.linkHint);
    expect(hints).toHaveLength(24);
    for (const hint of hints) {
      expect(hint).toHaveClass(visuallyHidden);
      expect(hint.closest('[aria-hidden="true"]')).toBeNull();
    }
  });
});

describe('ScenarioScheme: полоса прокручивает себя по горизонтали (SPEC §4.3:267, DN-91e)', () => {
  // Решение владельца 20.09.2026 (bd DN-91e): полоса двигает только
  // `scrollLeft` своего контейнера ([data-scheme-row], хук для теста — класс
  // CSS-модуля захэширован); scrollIntoView она не вызывает вовсе — вертикальную
  // прокрутку страницы делает только правило карточки §4.5:291.
  //
  // getBoundingClientRect подменяется через vi.spyOn — без restoreAllMocks
  // подмена утекла бы в describe «без сценария» ниже.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function rect(left: number, right: number): DOMRect {
    return {
      top: 0,
      bottom: 0,
      left,
      right,
      width: right - left,
      height: 0,
      x: left,
      y: 0,
      toJSON() {
        return {};
      },
    };
  }

  /**
   * Контейнеру полосы ([data-scheme-row]) — прямоугольник `view`, кнопке
   * активного шага (по `this.closest('[data-step-id]')`) — прямоугольник из
   * `steps` по её id, остальным — нулевой (как сейчас в jsdom).
   */
  function stubStripRects(
    view: readonly [number, number],
    steps: Readonly<Record<string, readonly [number, number]>>,
  ): void {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ): DOMRect {
      if (this.matches('[data-scheme-row]')) {
        return rect(...view);
      }
      const stepId = this.closest('[data-step-id]')?.getAttribute('data-step-id');
      const found = stepId !== undefined && stepId !== null ? steps[stepId] : undefined;
      return found ? rect(...found) : rect(0, 0);
    });
  }

  function stripRowOf(container: HTMLElement): HTMLElement {
    const row = container.querySelector('[data-scheme-row]');
    if (row === null) {
      throw new Error('в схеме нет контейнера полосы [data-scheme-row]');
    }
    return row as HTMLElement;
  }

  function clickStep25(): void {
    const target = screen.getByRole('button', {
      name: (_accessibleName, element) => element.getAttribute('data-step-id') === '2.5',
    });
    fireEvent.click(target);
  }

  it('шаг выступает за правый край полосы — scrollLeft увеличивается ровно на величину выступа', () => {
    const { container } = renderScheme('1.10');
    const row = stripRowOf(container);
    row.scrollLeft = 50;
    // Полоса 0..300, кнопка 2.5 — 280..340: выступ справа 40.
    stubStripRects([0, 300], { '2.5': [280, 340] });

    clickStep25();

    expect(row.scrollLeft).toBe(50 + 40);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('шаг выступает за левый край полосы — scrollLeft уменьшается ровно на величину выступа', () => {
    const { container } = renderScheme('1.10');
    const row = stripRowOf(container);
    row.scrollLeft = 50;
    // Полоса 0..300, кнопка 2.5 — −40..20: выступ слева −40.
    stubStripRects([0, 300], { '2.5': [-40, 20] });

    clickStep25();

    expect(row.scrollLeft).toBe(50 - 40);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('шаг виден целиком — scrollLeft не меняется (иначе мутация «всегда доводить до края» не поймана)', () => {
    const { container } = renderScheme('1.10');
    const row = stripRowOf(container);
    row.scrollLeft = 50;
    // Полоса 0..300, кнопка 2.5 — 20..280: целиком внутри, оба зазора не сработали.
    stubStripRects([0, 300], { '2.5': [20, 280] });

    clickStep25();

    expect(row.scrollLeft).toBe(50);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('повторный клик по уже активному шагу не меняет scrollLeft — deps эффекта не изменились', () => {
    const { container } = renderScheme('2.5');
    const row = stripRowOf(container);
    row.scrollLeft = 50;
    stubStripRects([0, 300], { '2.5': [280, 340] });

    clickStep25();

    expect(row.scrollLeft).toBe(50);
    expect(scrollIntoView).not.toHaveBeenCalled();
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
