// ТК 13 (SPEC §8:409, дословно): «› на 1.11 → 2.1; ‹ на 1.1 `disabled`; › на
// 3.7 `disabled`; ← при фокусе в `input` не листает». Кнопки ‹ › — SPEC
// §4.4:275, §4.5:289. Клавиши ← → — §4.5:290. Прокрутка карточки — §4.5:291.
// Хук слушает клавиши через AppShell (SPEC §2:52: hooks/useArrowKeys.ts), а не
// сам StepCard — поэтому там, где важны клавиши, рендерится AppShell целиком.
//
// Эталон содержания — tests/fixtures/deployment-demo.json (CLAUDE.md: не
// придумывать содержание сценария). Копии buildScenario/findStep/mustPosition —
// как в tests/App.test.tsx и tests/StepCard.test.tsx (общий хелпер не заводим,
// риск конфликта при мёрже с параллельными задачами).
import type { Dispatch } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ScenarioSchema, type Scenario, type Step } from '../src/model/schema';
import {
  appReducer,
  createInitialState,
  flatSteps,
  stepPosition,
  type AppAction,
  type AppState,
} from '../src/state/reducer';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { AppShell } from '../src/App';
import { ru } from '../src/i18n/ru';

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

function findStep(source: Scenario, stepId: string): Step {
  const step = flatSteps(source).find((candidate) => candidate.id === stepId);
  if (step === undefined) {
    throw new Error(`фикстура не знает шаг ${stepId}`);
  }
  return step;
}

function mustPosition(source: Scenario, stepId: string) {
  const position = stepPosition(source, stepId);
  if (position === null) {
    throw new Error(`фикстура не знает шаг ${stepId}`);
  }
  return position;
}

const scenario = buildScenario('deployment-demo', 'repo');

/** Открывает `scenario` на нужном шаге; `extra` примешивается поверх готового состояния. */
function openAt(stepId: string, extra?: Partial<AppState>): AppState {
  const opened = appReducer(createInitialState(), { type: 'openScenario', scenario, stepId });
  // openScenario молча откатывает неизвестный номер на первый шаг (§4.7:322) —
  // проверка ловит опечатку в номере шага теста, а не путает её с поведением карточки.
  expect(opened.stepId).toBe(stepId);
  return { ...opened, ...extra };
}

interface ProbeSnapshot {
  scenario: string | null;
  stepId: string | null;
}

/** Отдаёт наружу и снимок состояния (для проверок), и dispatch (для тестов 20–21). */
function StateProbe({ capture }: { capture?: (dispatch: Dispatch<AppAction>) => void }) {
  const { state, dispatch } = useAppStore();
  capture?.(dispatch);
  const snapshot: ProbeSnapshot = { scenario: state.scenario?.id ?? null, stepId: state.stepId };
  return <pre data-testid="state-probe">{JSON.stringify(snapshot)}</pre>;
}

function probeState(): ProbeSnapshot {
  return JSON.parse(screen.getByTestId('state-probe').textContent ?? '{}') as ProbeSnapshot;
}

/** Поля вокруг AppShell — исключения §4.5:290: input, textarea, select, [contenteditable]. */
function Fields() {
  return (
    <>
      <input data-testid="f-input" />
      <textarea data-testid="f-textarea" />
      <select data-testid="f-select">
        <option value="" />
      </select>
      {/* tabIndex обязателен — иначе jsdom не даст сфокусировать программно. */}
      <div data-testid="f-editable" contentEditable tabIndex={-1} />
    </>
  );
}

function renderApp(initialState: AppState, capture?: (dispatch: Dispatch<AppAction>) => void) {
  return render(
    <StoreProvider initialState={initialState}>
      <AppShell />
      <StateProbe capture={capture} />
      <Fields />
    </StoreProvider>,
  );
}

interface KeyPressInit {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

/** `true` — клавиша не перехвачена (dispatchEvent), `false` — вызван preventDefault (§4.5:290). */
function press(key: string, init: KeyPressInit = {}): boolean {
  return fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
}

/** Вызовы `scrollIntoView`, у которых `this` — именно `target` (а не активный шаг схемы). */
function scrollCallsOn(target: Element): { arg: unknown; order: number }[] {
  const mock = vi.mocked(Element.prototype.scrollIntoView).mock;
  const calls: { arg: unknown; order: number }[] = [];
  mock.contexts.forEach((context, index) => {
    if (context === target) {
      calls.push({ arg: mock.calls[index]?.[0], order: mock.invocationCallOrder[index] ?? 0 });
    }
  });
  return calls;
}

function stubHeaderRect(header: Element, top: number, bottom: number): void {
  const rect: DOMRect = {
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
  vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(rect);
}

function cardHeaderOf(article: HTMLElement): HTMLElement {
  const header = article.querySelector('header');
  if (header === null) {
    throw new Error('в карточке нет header');
  }
  return header;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ТК 13 (SPEC §8:409): «› на 1.11 → 2.1; ‹ на 1.1 `disabled`; › на 3.7 `disabled`; ← при фокусе в `input` не листает»', () => {
  it('1: клик «Следующий шаг» на 1.11 переводит на 2.1', () => {
    renderApp(openAt('1.11'));
    fireEvent.click(screen.getByRole('button', { name: ru.card.nextStep }));
    const step = findStep(scenario, '2.1');
    const position = mustPosition(scenario, '2.1');
    expect(screen.getByRole('heading', { level: 1, name: step.title })).toBeInTheDocument();
    expect(
      screen.getByText(ru.card.position(position.blockN, position.k, position.m)),
    ).toBeInTheDocument();
  });

  it('2: на 1.1 «Предыдущий шаг» disabled, «Следующий шаг» enabled; ← не перехватывается и не листает', () => {
    renderApp(openAt('1.1'));
    expect(screen.getByRole('button', { name: ru.card.prevStep })).toBeDisabled();
    expect(screen.getByRole('button', { name: ru.card.nextStep })).toBeEnabled();
    expect(press('ArrowLeft')).toBe(true);
    expect(probeState().stepId).toBe('1.1');
  });

  it('3: на 3.7 «Следующий шаг» disabled, «Предыдущий шаг» enabled; → не перехватывается и не листает', () => {
    renderApp(openAt('3.7'));
    expect(screen.getByRole('button', { name: ru.card.nextStep })).toBeDisabled();
    expect(screen.getByRole('button', { name: ru.card.prevStep })).toBeEnabled();
    expect(press('ArrowRight')).toBe(true);
    expect(probeState().stepId).toBe('3.7');
  });

  it('4: фокус в input — ← и → не перехватываются и не листают', () => {
    renderApp(openAt('2.1'));
    screen.getByTestId('f-input').focus();
    expect(press('ArrowLeft')).toBe(true);
    expect(probeState().stepId).toBe('2.1');
    expect(press('ArrowRight')).toBe(true);
    expect(probeState().stepId).toBe('2.1');
  });
});

describe('Кнопки ‹ › в шапке карточки (SPEC §4.4:275, §4.5:289)', () => {
  it('5: title и aria-label совпадают с подписью; порядок в DOM — h1 → ‹ → ›', () => {
    renderApp(openAt('1.11'));
    const header = cardHeaderOf(screen.getByRole('article'));
    const prevButton = within(header).getByRole('button', { name: ru.card.prevStep });
    const nextButton = within(header).getByRole('button', { name: ru.card.nextStep });
    // getByRole находит кнопку и по одному title — aria-label проверяется явно.
    expect(prevButton).toHaveAttribute('title', ru.card.prevStep);
    expect(prevButton).toHaveAttribute('aria-label', ru.card.prevStep);
    expect(nextButton).toHaveAttribute('title', ru.card.nextStep);
    expect(nextButton).toHaveAttribute('aria-label', ru.card.nextStep);
    const h1 = within(header).getByRole('heading', { level: 1 });
    expect(h1.compareDocumentPosition(prevButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      prevButton.compareDocumentPosition(nextButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('6: клик ‹ на 2.1 переводит на 1.11 (переход через границу блока назад)', () => {
    renderApp(openAt('2.1'));
    fireEvent.click(screen.getByRole('button', { name: ru.card.prevStep }));
    const step = findStep(scenario, '1.11');
    expect(screen.getByRole('heading', { level: 1, name: step.title })).toBeInTheDocument();
  });
});

describe('Клавиши ← → (SPEC §4.5:290)', () => {
  it('7: → переходит на 2.1 и перехватывается; ← возвращает на 1.11', () => {
    renderApp(openAt('1.11'));
    expect(press('ArrowRight')).toBe(false);
    expect(probeState().stepId).toBe('2.1');
    expect(press('ArrowLeft')).toBe(false);
    expect(probeState().stepId).toBe('1.11');
  });

  it('8: фокус на шаге схемы не блокирует → — это кнопка, не поле ввода', () => {
    renderApp(openAt('1.11'));
    const stepButton = document.querySelector('[data-step-id="1.11"]');
    if (stepButton === null) {
      throw new Error('в схеме нет шага 1.11');
    }
    (stepButton as HTMLElement).focus();
    press('ArrowRight');
    expect(probeState().stepId).toBe('2.1');
  });

  it.each(['f-textarea', 'f-select', 'f-editable'])(
    '9: фокус в %s — ← не перехватывается и не листает',
    (testId) => {
      renderApp(openAt('2.1'));
      screen.getByTestId(testId).focus();
      expect(press('ArrowLeft')).toBe(true);
      expect(probeState().stepId).toBe('2.1');
    },
  );

  const MODIFIERS = ['altKey', 'ctrlKey', 'metaKey'] as const;

  it.each(MODIFIERS)(
    '10: ← с %s не перехватывается (SPEC §4.5:290 о модификаторах молчит; решение DN-13)',
    (modifier) => {
      renderApp(openAt('2.1'));
      const init: KeyPressInit = {};
      init[modifier] = true;
      expect(press('ArrowLeft', init)).toBe(true);
      expect(probeState().stepId).toBe('2.1');
    },
  );

  // DN-ysk (§4.8:350): с открытым сценарием окно загрузки больше нельзя
  // открыть через UI (входа в загрузку на экране сценария нет) — e2e N2
  // (e2e/navigation.spec.ts) стало невоспроизводимым и удалено. Этот тест —
  // единственное оставшееся покрытие «окно блокирует ← →» (initialState с
  // modal напрямую, минуя UI).
  it('11: открытое окно загрузки блокирует ←; после Esc клавиши снова работают', () => {
    renderApp(openAt('2.1', { modal: { kind: 'import' } }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Фокус при открытии — на зоне выбора файла (SPEC §4.8:329): кнопка, не поле ввода.
    expect(document.activeElement?.tagName).toBe('BUTTON');
    expect(press('ArrowLeft')).toBe(true);
    expect(probeState().stepId).toBe('2.1');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(press('ArrowLeft')).toBe(false);
    expect(probeState().stepId).toBe('1.11');
  });

  it('12: открытое окно удаления «моего» тоже блокирует ← (§4.2:255)', () => {
    const mine = buildScenario('my-deployment-demo', 'local');
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario: mine,
      stepId: '2.1',
    });
    const initialState: AppState = {
      ...opened,
      library: { items: [mine], available: true },
      modal: { kind: 'delete', scenarioId: mine.id },
    };
    renderApp(initialState);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(press('ArrowLeft')).toBe(true);
    expect(probeState().stepId).toBe('2.1');
  });

  it('13: в каталоге (сценарий не открыт) → не перехватывается', () => {
    renderApp(createInitialState());
    expect(press('ArrowRight')).toBe(true);
    expect(probeState().scenario).toBeNull();
  });

  it.each(['ArrowUp', 'ArrowDown'])('14: %s не перехватывается и не листает', (key) => {
    renderApp(openAt('2.1'));
    expect(press(key)).toBe(true);
    expect(probeState().stepId).toBe('2.1');
  });

  it('15: после unmount слушатель клавиш снят', () => {
    const { unmount } = renderApp(openAt('2.1'));
    unmount();
    expect(fireEvent.keyDown(document.body, { key: 'ArrowRight' })).toBe(true);
  });
});

describe('Прокрутка к карточке при смене шага (SPEC §4.5:291)', () => {
  it('16: шапка видна — scrollIntoView карточки не вызывается; полоса схемы scrollIntoView у шага 2.1 тоже не вызывает (SPEC §4.3:267, DN-91e)', () => {
    renderApp(openAt('1.11'));
    const article = screen.getByRole('article');
    stubHeaderRect(cardHeaderOf(article), 100, 171);
    press('ArrowRight');
    expect(probeState().stepId).toBe('2.1');
    expect(scrollCallsOn(article)).toHaveLength(0);
    const activeStepButton = document.querySelector('[data-step-id="2.1"]');
    if (activeStepButton === null) {
      throw new Error('в схеме нет шага 2.1');
    }
    // DN-91e (§4.3:267): полоса схемы прокручивает только себя по горизонтали
    // (scrollLeft контейнера) — scrollIntoView у кнопки активного шага больше
    // не вызывается вовсе (ловит мутацию «полоса снова зовёт scrollIntoView»).
    expect(scrollCallsOn(activeStepButton)).toHaveLength(0);
  });

  it.each([
    ['выше края', -80, -9],
    ['ниже края', window.innerHeight - 30, window.innerHeight + 41],
  ] as const)(
    '17: шапка %s — карточка прокручивается ({block:"start"}); полоса схемы scrollIntoView не вызывает (SPEC §4.5:291, §4.3:267)',
    (_label, top, bottom) => {
      renderApp(openAt('1.11'));
      const article = screen.getByRole('article');
      stubHeaderRect(cardHeaderOf(article), top, bottom);
      press('ArrowRight');
      expect(probeState().stepId).toBe('2.1');

      const cardCalls = scrollCallsOn(article);
      expect(cardCalls).toHaveLength(1);
      expect(cardCalls[0]?.arg).toEqual({ block: 'start' });

      // DN-91e (§4.3:267): полоса схемы больше не вызывает scrollIntoView —
      // у активного шага таких вызовов нет вовсе (порядок «схема раньше
      // карточки» из SPEC 1.5 больше не проверяется — вызова схемы нет).
      const activeStepButton = document.querySelector('[data-step-id="2.1"]');
      if (activeStepButton === null) {
        throw new Error('в схеме нет шага 2.1');
      }
      expect(scrollCallsOn(activeStepButton)).toHaveLength(0);
    },
  );

  it('18: клик по шагу схемы при шапке вне окна тоже прокручивает карточку', () => {
    renderApp(openAt('1.11'));
    const article = screen.getByRole('article');
    stubHeaderRect(cardHeaderOf(article), -100, -29);
    const stepButton = document.querySelector('[data-step-id="2.5"]');
    if (stepButton === null) {
      throw new Error('в схеме нет шага 2.5');
    }
    fireEvent.click(stepButton);
    expect(probeState().stepId).toBe('2.5');
    expect(scrollCallsOn(article)).toHaveLength(1);
  });

  it('19: открытие сценария из каталога не прокручивает карточку, даже если шапка вне окна', () => {
    const mine = buildScenario('my-deployment-demo', 'local');
    const outOfView: DOMRect = {
      top: -200,
      bottom: -100,
      left: 0,
      right: 0,
      width: 0,
      height: 100,
      x: 0,
      y: -200,
      toJSON() {
        return {};
      },
    };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(outOfView);
    const initialState: AppState = {
      ...createInitialState(),
      library: { items: [mine], available: true },
    };
    renderApp(initialState);
    const localRegion = screen.getByRole('region', { name: ru.catalog.localTitle });
    fireEvent.click(within(localRegion).getByRole('button', { name: mine.title }));
    const article = screen.getByRole('article');
    expect(article).toBeInTheDocument();
    expect(scrollCallsOn(article)).toHaveLength(0);
  });

  it('20: замена сценария сбрасывает прокрутку окна (DN-26); карточка не прокручивается', () => {
    const mine = buildScenario('my-deployment-demo', 'local');
    let dispatch: Dispatch<AppAction> | null = null;
    renderApp(openAt('2.1'), (d) => {
      dispatch = d;
    });
    if (dispatch === null) {
      throw new Error('StateProbe не отдал dispatch');
    }
    const article = screen.getByRole('article');
    stubHeaderRect(cardHeaderOf(article), -100, -29);

    act(() => {
      dispatch?.({ type: 'openScenario', scenario: mine });
    });

    expect(probeState()).toEqual({ scenario: mine.id, stepId: '1.1' });
    expect(scrollCallsOn(article)).toHaveLength(0);
    expect(vi.mocked(window.scrollTo)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(window.scrollTo)).toHaveBeenLastCalledWith(0, 0);
  });

  it('21 (необязательно): повторная загрузка того же id не меняет scenario.id — DN-26 не сбрасывает прокрутку окна, карточка тоже не прокручивается', () => {
    const sameId = buildScenario('deployment-demo', 'repo');
    let dispatch: Dispatch<AppAction> | null = null;
    renderApp(openAt('2.1'), (d) => {
      dispatch = d;
    });
    if (dispatch === null) {
      throw new Error('StateProbe не отдал dispatch');
    }
    const article = screen.getByRole('article');
    stubHeaderRect(cardHeaderOf(article), -100, -29);

    act(() => {
      dispatch?.({ type: 'openScenario', scenario: sameId });
    });

    expect(probeState()).toEqual({ scenario: 'deployment-demo', stepId: '1.1' });
    expect(scrollCallsOn(article)).toHaveLength(0);
    expect(vi.mocked(window.scrollTo)).not.toHaveBeenCalled();
  });
});
