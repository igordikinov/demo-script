// SPEC §4.4:271–283 (карточка шага A3; §4.4:283 — переносы строк из ячейки
// сохраняются), §4.9:354 (открытие экрана), §11:616 (подпись «Бизнес
// ценность» без дефиса). ТК 16 (SPEC §8:412, дословно):
// «"Открыть экран" → window.open(url, '_blank'), opener = null; null → тост».
// ТК 8 (SPEC §8:404) — часть про карточку («Узел процесса не сопоставлен»,
// DN-15) тоже здесь; часть про отчёт окна загрузки — DN-06. ТК 21
// (скриншоты) сюда не входит — это visual-qa. Фикстура и способ её дополнить
// (schema/id/source/…) — как в tests/reducer.test.ts: другой buildScenario
// держать незачем.
import type { Dispatch } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, render, screen, within } from '@testing-library/react';
import { ScenarioSchema, type Scenario, type Step } from '../src/model/schema';
import {
  appReducer,
  createInitialState,
  flatSteps,
  stepPosition,
  type AppAction,
} from '../src/state/reducer';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { ru } from '../src/i18n/ru';
import { pmLink } from '../src/pm/pmLink';
import { pmSnapshots } from '../src/pm/snapshots';
import { StepCard } from '../src/components/StepCard/StepCard';
import { PROCESS_MAP_EMBED_ID } from '../src/components/ProcessMapSection/ProcessMapSection';

// Эталон содержания — tests/fixtures/deployment-demo.json (CLAUDE.md: не
// придумывать содержание сценария).
//
// import.meta.url сохраняется в переменную до new URL(): иначе Vite в jsdom-
// окружении статически распознаёт литерал `new URL('...', import.meta.url)`
// как импорт ассета и на рантайме подставляет вместо файлового URL адрес
// self.location ('http://localhost:3000/…') — fileURLToPath падает с «The
// URL must be of scheme file». reducer.test.ts этого не видит только потому,
// что у него окружение переключено на node директивным комментарием в первой
// строке файла (там нет DOM и рендера). Здесь дословно этот комментарий не
// пишем: Vitest ищет такую директиву по всему файлу, а не только в первой
// строке, и переключил бы node и для этого файла, где нужен jsdom.
const importMetaUrl = import.meta.url;
const fixturePath = fileURLToPath(new URL('./fixtures/deployment-demo.json', importMetaUrl));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

function buildScenario(id: string, source: 'repo' | 'local'): Scenario {
  // Глубокая копия — сценарии не должны делить мутируемое состояние между тестами.
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

/** Шаг по номеру — тексты в тестах берутся из фикстуры, а не придумываются. */
function findStep(source: Scenario, stepId: string): Step {
  const step = flatSteps(source).find((candidate) => candidate.id === stepId);
  if (step === undefined) {
    throw new Error(`фикстура не знает шаг ${stepId}`);
  }
  return step;
}

/** Позиция шага — блок/k/m считаются из фикстуры (stepPosition), а не задаются числом в тесте. */
function mustPosition(source: Scenario, stepId: string) {
  const position = stepPosition(source, stepId);
  if (position === null) {
    throw new Error(`фикстура не знает шаг ${stepId}`);
  }
  return position;
}

/** Копия сценария с изменённым одним шагом; исходный `scenario` не мутируется. */
function withStep(source: Scenario, stepId: string, patch: Partial<Step>): Scenario {
  return {
    ...source,
    blocks: source.blocks.map((block) => ({
      ...block,
      steps: block.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    })),
  };
}

/** Потребитель стора рядом с карточкой — по образцу tests/store.test.tsx:84–101. */
function Probe({ capture }: { capture?: (dispatch: Dispatch<AppAction>) => void }) {
  const { state, dispatch } = useAppStore();
  capture?.(dispatch);
  return <output data-testid="toast-probe">{state.toast?.message ?? ''}</output>;
}

/** Открывает сценарий на нужном шаге и рендерит карточку вместе с Probe. */
function renderCard(
  source: Scenario,
  stepId: string,
  capture?: (dispatch: Dispatch<AppAction>) => void,
) {
  const initialState = appReducer(createInitialState(), {
    type: 'openScenario',
    scenario: source,
    stepId,
  });
  // openScenario молча откатывает неизвестный/пустой номер на первый шаг (§4.7:322) —
  // проверка здесь ловит опечатку в номере шага теста, а не путает её с поведением карточки.
  expect(initialState.stepId).toBe(stepId);
  return render(
    <StoreProvider initialState={initialState}>
      <StepCard />
      <Probe capture={capture} />
    </StoreProvider>,
  );
}

// jsdom не реализует window.open (notImplementedMethod) — без подмены клик по
// «Открыть экран» писал бы в консоль и ничего бы не проверял (план DN-12, D5).
afterEach(() => {
  vi.restoreAllMocks();
});

describe('StepCard: без открытого сценария', () => {
  it('ничего не рендерит', () => {
    const { container } = render(
      <StoreProvider>
        <StepCard />
      </StoreProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('StepCard: шапка (SPEC §4.4:275 — «Блок {n} · шаг {k} из {m}» и заголовок шага)', () => {
  it('1.10: позиция и заголовок', () => {
    const step = findStep(scenario, '1.10');
    const position = mustPosition(scenario, '1.10');
    renderCard(scenario, '1.10');
    expect(
      screen.getByText(ru.card.position(position.blockN, position.k, position.m)),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: step.title })).toBeInTheDocument();
  });

  // ‹ › — SPEC §4.4:275, §4.5:289 (DN-13). В jsdom getBoundingClientRect
  // возвращает нули, шапка считается видимой, поэтому scrollIntoView карточки
  // здесь не срабатывает (см. tests/navigation.test.tsx на прокрутку).
  it('1.10: в шапке после h1 — кнопки ‹ и › (variant="neutral", iconOnly, size="md"), обе enabled', () => {
    const { container } = renderCard(scenario, '1.10');
    const header = container.querySelector('header');
    if (header === null) {
      throw new Error('в карточке нет header');
    }
    const prevButton = within(header).getByRole('button', { name: ru.card.prevStep });
    const nextButton = within(header).getByRole('button', { name: ru.card.nextStep });
    for (const button of [prevButton, nextButton]) {
      expect(button).toHaveAttribute('data-variant', 'neutral');
      expect(button).toHaveAttribute('data-icon-only', 'true');
      expect(button).toHaveAttribute('data-size', 'md');
      expect(button).toBeEnabled();
    }
  });
});

describe("ТК 16 (SPEC §8:412): «Открыть экран» → window.open(url, '_blank'), opener = null; null → тост", () => {
  it('вкладка открылась (window.open вернул объект) — вызов без noopener, opener обнулён, тоста нет', () => {
    const step = findStep(scenario, '1.10');
    // opener стартует непустым: обнуление после open() должно быть видно явно,
    // а не совпасть случайно с исходным undefined заглушки (план DN-976, Д4).
    const tab = { opener: window } as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(tab);
    renderCard(scenario, '1.10');

    act(() => {
      screen.getByRole('button', { name: ru.card.openScreen }).click();
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(step.url, '_blank');
    expect(tab.opener).toBeNull();
    expect(screen.getByTestId('toast-probe').textContent).toBe('');
  });

  it('window.open вернул null (заблокировано) — тост «Браузер не дал открыть вкладку…»', () => {
    const step = findStep(scenario, '1.10');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderCard(scenario, '1.10');

    act(() => {
      screen.getByRole('button', { name: ru.card.openScreen }).click();
    });

    expect(openSpy).toHaveBeenCalledWith(step.url, '_blank');
    expect(screen.getByTestId('toast-probe')).toHaveTextContent(ru.openScreen.popupBlocked);
  });
});

/**
 * Секция «Экран», а не весь документ: в фикстуре у шага 2.3 название экрана
 * («Бизнес-правила приоритетов») совпадает с заголовком шага, поэтому
 * document-wide getByText(step.screen) находит и <h1>, и нужный элемент.
 */
function screenSectionOf(container: HTMLElement): HTMLElement {
  const heading = within(container).getByRole('heading', { level: 2, name: ru.card.screen });
  const section = heading.closest('section');
  if (section === null) {
    throw new Error('секция «Экран» не найдена');
  }
  return section;
}

describe('StepCard: секция «Экран»', () => {
  it('1.10 (url есть): название экрана и URL видны, «Экран не указан» отсутствует', () => {
    const step = findStep(scenario, '1.10');
    const { container } = renderCard(scenario, '1.10');
    const section = screenSectionOf(container);
    expect(within(section).getByText(step.screen)).toBeInTheDocument();
    expect(within(section).getByText(step.url)).toBeInTheDocument();
    expect(within(section).queryByText(ru.card.screenMissing)).not.toBeInTheDocument();
  });

  it('2.3 (url пуст): «Экран не указан», название экрана видно, кнопки «Открыть экран» нет', () => {
    const step = findStep(scenario, '2.3');
    const position = mustPosition(scenario, '2.3');
    expect(step.url).toBe('');
    const { container } = renderCard(scenario, '2.3');
    expect(
      screen.getByText(ru.card.position(position.blockN, position.k, position.m)),
    ).toBeInTheDocument();
    const section = screenSectionOf(container);
    expect(within(section).getByText(ru.card.screenMissing)).toBeInTheDocument();
    expect(within(section).getByText(step.screen)).toBeInTheDocument();
    expect(
      within(section).queryByRole('button', { name: ru.card.openScreen }),
    ).not.toBeInTheDocument();
  });

  it('1.10 с испорченным url (javascript:) — считается «нет url»: «Экран не указан», без кнопки и без URL, window.open не вызывается (решение владельца DN-dkb)', () => {
    const step = findStep(scenario, '1.10');
    expect(step.url.startsWith('https://')).toBe(true);
    const patched = withStep(scenario, '1.10', { url: 'javascript:alert(1)' });
    // Схема (SPEC §3.1) протокол url не проверяет — испорченный адрес проходит
    // zod, и именно эта угроза — предмет задачи DN-dkb.
    expect(ScenarioSchema.safeParse(patched).success).toBe(true);
    // Шпион ставится до рендера (план DN-dkb, D4): если бы кнопка «Открыть
    // экран» всё же отрисовалась, клика по ней в тесте нет, и проверка
    // openSpy имеет смысл только вместе с проверкой отсутствия кнопки ниже.
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    const { container } = renderCard(patched, '1.10');
    const section = screenSectionOf(container);

    expect(within(section).getByText(ru.card.screenMissing)).toBeInTheDocument();
    expect(within(section).getByText(step.screen)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ru.card.openScreen })).not.toBeInTheDocument();
    expect(within(section).queryByText('javascript:alert(1)')).not.toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('toast-probe').textContent).toBe('');
  });
});

describe('StepCard: секция «Бизнес ценность» и «Ожидаемый результат» — заполнены (SPEC §4.4:279–280)', () => {
  it('1.10: подписи и тексты видны, у ценности data-empty="false"', () => {
    const step = findStep(scenario, '1.10');
    expect(step.value).not.toBe('');
    expect(step.result).not.toBe('');
    renderCard(scenario, '1.10');

    const valueHeading = screen.getByRole('heading', { level: 2, name: ru.card.value });
    expect(valueHeading).toBeInTheDocument();
    expect(screen.getByText(step.value)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: ru.card.result })).toBeInTheDocument();
    expect(screen.getByText(step.result)).toBeInTheDocument();

    expect(valueHeading.closest('section')).toHaveAttribute('data-empty', 'false');
  });
});

describe('StepCard: секция «Бизнес ценность» и «Ожидаемый результат» — пусты (SPEC §4.4:279–280)', () => {
  it.each(['1.2', '2.3'])(
    '%s: подписи на месте, тексты — «поле не заполнено», data-empty="true"',
    (stepId) => {
      const step = findStep(scenario, stepId);
      const position = mustPosition(scenario, stepId);
      expect(step.value).toBe('');
      expect(step.result).toBe('');
      renderCard(scenario, stepId);

      expect(
        screen.getByText(ru.card.position(position.blockN, position.k, position.m)),
      ).toBeInTheDocument();
      const valueHeading = screen.getByRole('heading', { level: 2, name: ru.card.value });
      expect(valueHeading).toBeInTheDocument();
      expect(screen.getByText(ru.card.valueEmpty)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: ru.card.result })).toBeInTheDocument();
      expect(screen.getByText(ru.card.resultEmpty)).toBeInTheDocument();

      expect(valueHeading.closest('section')).toHaveAttribute('data-empty', 'true');
    },
  );
});

describe('StepCard: секция «Действие» — только если заполнено (SPEC §4.4:278)', () => {
  it('1.10: подпись и текст действия видны', () => {
    const step = findStep(scenario, '1.10');
    expect(step.action).not.toBe('');
    renderCard(scenario, '1.10');
    expect(screen.getByRole('heading', { level: 2, name: ru.card.action })).toBeInTheDocument();
    expect(screen.getByText(step.action)).toBeInTheDocument();
  });

  it('action очищен (изменённый 1.10) — подписи «Действие» нет', () => {
    const emptied = withStep(scenario, '1.10', { action: '' });
    renderCard(emptied, '1.10');
    expect(screen.queryByRole('heading', { name: ru.card.action })).not.toBeInTheDocument();
  });
});

describe('StepCard: секция «Комментарий» — только если заполнено (SPEC §4.4:281)', () => {
  it('1.10: комментарий в фикстуре пуст — подписи «Комментарий» нет', () => {
    const step = findStep(scenario, '1.10');
    expect(step.comment).toBe('');
    renderCard(scenario, '1.10');
    expect(screen.queryByRole('heading', { name: ru.card.comment })).not.toBeInTheDocument();
  });

  it('comment заполнен текстом действия шага 1.11 из фикстуры — подпись и текст видны', () => {
    const commentText = findStep(scenario, '1.11').action;
    const withComment = withStep(scenario, '1.10', { comment: commentText });
    renderCard(withComment, '1.10');
    expect(screen.getByRole('heading', { level: 2, name: ru.card.comment })).toBeInTheDocument();
    expect(screen.getByText(commentText)).toBeInTheDocument();
  });
});

/** Секция «Карта процесса», а не весь документ — тот же приём, что у screenSectionOf. */
function mapSectionOf(container: HTMLElement): HTMLElement {
  const heading = within(container).getByRole('heading', { level: 2, name: ru.card.processMap });
  const section = heading.closest('section');
  if (section === null) {
    throw new Error('секция «Карта процесса» не найдена');
  }
  return section;
}

// Заголовок этапа 4 карты snp — из настоящего снимка src/data/pm/snp.json, а не выдуман.
const stage4Title = pmSnapshots().snp.stages.find((s) => s.number === 4)?.title;
if (stage4Title === undefined) {
  throw new Error('в снимке snp нет этапа 4 (см. src/data/pm/snp.json)');
}

describe('StepCard: секция «Карта процесса» (SPEC §4.4:277, §4.6:306–309, v2:123–142)', () => {
  it('1.10: этап и узел из фикстуры, кнопки «Показать на карте» и «Открыть в новой вкладке»', () => {
    const step = findStep(scenario, '1.10');
    const { container } = renderCard(scenario, '1.10');
    const section = mapSectionOf(container);

    expect(within(section).getByText(ru.processMap.stage(4, stage4Title))).toBeInTheDocument();
    expect(within(section).getByText(ru.processMap.node(step.node))).toBeInTheDocument();

    const showButton = within(section).getByRole('button', { name: ru.processMap.show });
    expect(showButton).toHaveAttribute('data-variant', 'stroked');
    expect(showButton).toHaveAttribute('aria-expanded', 'false');
    expect(showButton).not.toHaveAttribute('aria-controls');

    const openButton = within(section).getByRole('button', { name: ru.processMap.openInNewTab });
    expect(openButton).toHaveAttribute('data-variant', 'neutral');
    const icon = openButton.querySelector('svg[data-icon="external-link"]');
    expect(icon).not.toBeNull();
    // iconPosition="end" (v2:123–142) — иконка после текста: последний потомок
    // кнопки (обёртка Button.tsx — span[aria-hidden]) содержит эту иконку.
    expect(openButton.lastElementChild?.contains(icon)).toBe(true);

    expect(within(section).queryByText(ru.processMap.notMapped)).not.toBeInTheDocument();
  });

  it('порядок секций (SPEC §4.4:277): «Экран» → «Карта процесса» → «Действие»', () => {
    const { container } = renderCard(scenario, '1.10');
    const screenSection = screenSectionOf(container);
    const mapSection = mapSectionOf(container);
    const actionHeading = screen.getByRole('heading', { level: 2, name: ru.card.action });
    const actionSection = actionHeading.closest('section');
    if (actionSection === null) {
      throw new Error('секция «Действие» не найдена');
    }

    expect(
      screenSection.compareDocumentPosition(mapSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      mapSection.compareDocumentPosition(actionSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('переключатель: клик «Показать на карте» → «Скрыть карту» (aria-expanded/aria-controls), повторный клик — обратно', () => {
    const { container } = renderCard(scenario, '1.10');
    const section = mapSectionOf(container);

    act(() => {
      within(section).getByRole('button', { name: ru.processMap.show }).click();
    });
    const hideButton = within(section).getByRole('button', { name: ru.processMap.hide });
    expect(hideButton).toHaveAttribute('aria-expanded', 'true');
    expect(hideButton).toHaveAttribute('aria-controls', PROCESS_MAP_EMBED_ID);

    act(() => {
      hideButton.click();
    });
    const showAgain = within(section).getByRole('button', { name: ru.processMap.show });
    expect(showAgain).toHaveAttribute('aria-expanded', 'false');
    expect(showAgain).not.toHaveAttribute('aria-controls');
  });

  // ТК 8 (SPEC §8:404, дословно): «Узел, которого нет в снимке → W04; в карточке
  // «Узел процесса не сопоставлен»» — часть про карточку (часть про отчёт W04 в
  // окне загрузки — DN-06). Случаи: пустой узел в фикстуре (3.7, 2.6), узел
  // «constructor» (Object.hasOwn, а не `in`) и узел, который есть на карте mrp,
  // но не на снимке выбранной карты snp (W04, SPEC §3.5:187).
  const notMappedCases: { label: string; stepId: string; scenario: () => Scenario }[] = [
    { label: '3.7: узел в фикстуре пуст', stepId: '3.7', scenario: () => scenario },
    { label: '2.6: узел в фикстуре пуст', stepId: '2.6', scenario: () => scenario },
    {
      label: "1.10 с узлом 'constructor' — не свойство прототипа, а отсутствующий узел",
      stepId: '1.10',
      scenario: () => withStep(scenario, '1.10', { node: 'constructor' }),
    },
    {
      label:
        "1.10 с узлом 'formirovanie-zayavok-na-zakupku' — есть на карте mrp, но не на выбранной snp (W04)",
      stepId: '1.10',
      scenario: () => withStep(scenario, '1.10', { node: 'formirovanie-zayavok-na-zakupku' }),
    },
  ];

  it.each(notMappedCases)(
    '$label → «Узел процесса не сопоставлен», кнопок и «Узел:» нет',
    ({ stepId, scenario: buildPatched }) => {
      const { container } = renderCard(buildPatched(), stepId);
      const section = mapSectionOf(container);

      expect(within(section).getByText(ru.processMap.notMapped)).toBeInTheDocument();
      expect(
        within(section).queryByRole('button', { name: ru.processMap.show }),
      ).not.toBeInTheDocument();
      expect(
        within(section).queryByRole('button', { name: ru.processMap.hide }),
      ).not.toBeInTheDocument();
      expect(
        within(section).queryByRole('button', { name: ru.processMap.openInNewTab }),
      ).not.toBeInTheDocument();
      expect(within(section).queryByText(/^Узел:/)).not.toBeInTheDocument();
    },
  );

  it('3.7 при initialState.mapOpen = true — карты и кнопки всё равно нет (SPEC §4.6:314)', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '3.7',
    });
    const { container } = render(
      <StoreProvider initialState={{ ...opened, mapOpen: true }}>
        <StepCard />
      </StoreProvider>,
    );
    const section = mapSectionOf(container);
    expect(within(section).getByText(ru.processMap.notMapped)).toBeInTheDocument();
    expect(
      within(section).queryByRole('button', { name: ru.processMap.show }),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByRole('button', { name: ru.processMap.hide }),
    ).not.toBeInTheDocument();
  });

  it("сценарий с map: 'mrp' — этап и название с карты mrp, а не snp", () => {
    const mrpScenario = withStep({ ...scenario, map: 'mrp' }, '1.10', {
      node: 'analiz-preduprezhdeniy',
    });
    const { container } = renderCard(mrpScenario, '1.10');
    const section = mapSectionOf(container);
    expect(
      within(section).getByText(ru.processMap.stage(2, 'Обработка ошибок и предупреждений')),
    ).toBeInTheDocument();
  });

  describe('«Открыть в новой вкладке» (SPEC §4.6:316, §4.9:354, DN-cx3)', () => {
    it("вкладка открылась — window.open вызван ровно с (pmLink('snp', node).url, '_blank'), opener обнулён, тоста нет", () => {
      const step = findStep(scenario, '1.10');
      const link = pmLink('snp', step.node);
      if (link === null) {
        throw new Error('фикстура: у шага 1.10 нет узла карты snp');
      }
      const tab = { opener: window } as Window;
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(tab);
      renderCard(scenario, '1.10');

      act(() => {
        screen.getByRole('button', { name: ru.processMap.openInNewTab }).click();
      });

      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith(link.url, '_blank');
      expect(tab.opener).toBeNull();
      expect(screen.getByTestId('toast-probe').textContent).toBe('');
    });

    it('window.open вернул null (заблокировано) — тост «Браузер не дал открыть вкладку…»', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      renderCard(scenario, '1.10');

      act(() => {
        screen.getByRole('button', { name: ru.processMap.openInNewTab }).click();
      });

      expect(openSpy).toHaveBeenCalled();
      expect(screen.getByTestId('toast-probe')).toHaveTextContent(ru.openScreen.popupBlocked);
    });
  });
});

describe('StepCard: смена активного шага через dispatch', () => {
  it('nextStep (1.10 → 1.11), затем selectStep на 2.3 обновляют карточку', () => {
    let dispatch: Dispatch<AppAction> | null = null;
    renderCard(scenario, '1.10', (d) => {
      dispatch = d;
    });
    if (dispatch === null) {
      throw new Error('Probe не отдал dispatch');
    }

    const step111 = findStep(scenario, '1.11');
    const position111 = mustPosition(scenario, '1.11');
    act(() => {
      dispatch?.({ type: 'nextStep' });
    });
    expect(
      screen.getByText(ru.card.position(position111.blockN, position111.k, position111.m)),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: step111.title })).toBeInTheDocument();

    act(() => {
      dispatch?.({ type: 'selectStep', stepId: '2.3' });
    });
    expect(screen.getByText(ru.card.screenMissing)).toBeInTheDocument();
  });
});

type PreLineField = 'action' | 'value' | 'result' | 'comment';

/** Поле карточки и его подпись — SPEC §4.4:283 называет ровно эти четыре. */
const PRE_LINE_FIELDS: [field: PreLineField, caption: string][] = [
  ['action', ru.card.action],
  ['value', ru.card.value],
  ['result', ru.card.result],
  ['comment', ru.card.comment],
];

describe('StepCard: переносы строк из ячейки сохраняются (SPEC §4.4:283)', () => {
  it.each(PRE_LINE_FIELDS)(
    '%s: две строки через \\n не схлопываются в разметке',
    (field, caption) => {
      // Текст не выдуман (CLAUDE.md): две непустые строки из фикстуры — действия
      // шагов 1.10 и 1.11, склеенные переносом.
      const text = `${findStep(scenario, '1.10').action}\n${findStep(scenario, '1.11').action}`;
      const patch = { [field]: text } as Partial<Record<PreLineField, string>>;
      renderCard(withStep(scenario, '1.10', patch), '1.10');

      const heading = screen.getByRole('heading', { level: 2, name: caption });
      const paragraph = heading.closest('section')?.querySelector('p');
      // getByText/toHaveTextContent нормализуют пробелы только в найденном узле,
      // а искомую строку не трогают: 'a b' не равно 'a\nb' (план DN-976, Д1) —
      // сравниваем textContent напрямую.
      expect(paragraph?.textContent).toBe(text);
    },
  );
});

// Образец — проверка тонов Badge в tests/tokens.test.ts. cssColors.test.ts и
// tokens.test.ts сканируют src/**/*.css сами (новых файлов там трогать не
// нужно, план DN-12 D4); здесь — точечная проверка требований SPEC §4.4:279
// (пунктирная граница пустой ценности) и §4.4:273 (ширина карточки).
describe('StepCard.module.css — цвета и ширина только через токены (SPEC §4.4:273, :279, §5:360)', () => {
  it('содержит var(--brand-50/700/200), dashed и var(--dn-card-max-width)', () => {
    // Тот же приём с переменной, что и у fixturePath выше (Vite + jsdom).
    const cssPath = fileURLToPath(
      new URL('../src/components/StepCard/StepCard.module.css', importMetaUrl),
    );
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain('var(--brand-50)');
    expect(css).toContain('var(--brand-700)');
    expect(css).toContain('var(--brand-200)');
    expect(css).toContain('dashed');
    expect(css).toContain('var(--dn-card-max-width)');
  });
});
