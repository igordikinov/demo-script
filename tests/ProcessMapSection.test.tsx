// ТК 17 (SPEC §8:413, дословно): «"Показать на карте" → iframe.src =
// pmLink(...).url; смена шага меняет src; у шага без узла iframe нет».
// Компонент — DN-15 (SPEC §4.6:311–315, design/Демо-навигатор v2.dc.html:171–181).
// Хелперы и фикстура — копии из tests/StepCard.test.tsx (CLAUDE.md: не
// придумывать содержание сценария). Сеть не нужна: jsdom не грузит src у iframe.
import type { Dispatch } from 'react';
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

/** Открывает сценарий на нужном шаге, дополняя начальное состояние (например, mapOpen). */
function renderMap(
  source: Scenario,
  stepId: string,
  patch: Partial<AppState> = {},
  capture?: (dispatch: Dispatch<AppAction>) => void,
) {
  const opened = appReducer(createInitialState(), {
    type: 'openScenario',
    scenario: source,
    stepId,
  });
  const initialState: AppState = { ...opened, ...patch };
  return render(
    <StoreProvider initialState={initialState}>
      <StepCard />
      <ProcessMapSection />
      <Probe capture={capture} />
    </StoreProvider>,
  );
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
