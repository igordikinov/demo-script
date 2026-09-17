// SPEC §4.1:234–240 (шапка A0). Разметка и контракт — план DN-10, раздел 3.4:
// один <header>, левая часть — условная ветка (каталог/сценарий) в фиксированной
// позиции, затем .spacer и кнопка «Загрузить из Excel» всегда последними двумя
// узлами (дефект D1 плана — иначе Modal теряет фокус-опенер при переходе
// каталог↔сценарий, §4.8:325, §4.8:346). Tag «общий»/«мой» — не DN-10 (DN-26),
// поэтому здесь не проверяется.
//
// Эталон содержания — tests/fixtures/deployment-demo.json (CLAUDE.md: не
// придумывать содержание сценария). buildScenario — копия приёма из
// tests/ScenarioScheme.test.tsx / tests/StepCard.test.tsx: общий хелпер не
// заводим, чтобы не конфликтовать при мёрже с другими задачами.
import type { Dispatch } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StoreProvider } from '../src/state/store';
import { appReducer, createInitialState, type AppAction } from '../src/state/reducer';
import { useAppStore } from '../src/state/context';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import { ru } from '../src/i18n/ru';
import { Header } from '../src/components/Header/Header';
import fixtureJson from './fixtures/deployment-demo.json';

const fixture = fixtureJson as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

function buildScenario(id: string, source: 'repo' | 'local', module = fixture.module): Scenario {
  const clone = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  return ScenarioSchema.parse({
    schema: 1,
    id,
    source,
    title: clone.title,
    module,
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

/** Зонд состояния рядом с шапкой — по образцу tests/StepCard.test.tsx:98–102. */
function Probe({ capture }: { capture?: (dispatch: Dispatch<AppAction>) => void }) {
  const { state, dispatch } = useAppStore();
  capture?.(dispatch);
  return (
    <output data-testid="state-probe">
      {JSON.stringify({
        scenario: state.scenario?.id ?? null,
        stepId: state.stepId,
        modal: state.modal,
      })}
    </output>
  );
}

function renderHeader(source: Scenario | null, capture?: (dispatch: Dispatch<AppAction>) => void) {
  const initialState =
    source === null
      ? createInitialState()
      : appReducer(createInitialState(), { type: 'openScenario', scenario: source });
  return render(
    <StoreProvider initialState={initialState}>
      <Header />
      <Probe capture={capture} />
    </StoreProvider>,
  );
}

describe('Header: вариант каталога (SPEC §4.1:238)', () => {
  it('монограмма и название приложения есть, «‹ Сценарии» и Badge модуля отсутствуют', () => {
    renderHeader(null);
    const bannerEl = screen.getByRole('banner');
    const banner = within(bannerEl);
    expect(banner.getByText(ru.header.monogram)).toBeInTheDocument();
    expect(banner.getByText(ru.header.appTitle)).toBeInTheDocument();
    expect(banner.queryByRole('button', { name: ru.header.back })).not.toBeInTheDocument();
    expect(bannerEl.querySelector('[data-tone="module"]')).toBeNull();
  });

  it('кнопка «Загрузить из Excel» — stroked, с иконкой (svg)', () => {
    renderHeader(null);
    const banner = within(screen.getByRole('banner'));
    const upload = banner.getByRole('button', { name: ru.header.upload });
    expect(upload).toHaveAttribute('data-variant', 'stroked');
    expect(upload.querySelector('svg')).not.toBeNull();
  });
});

describe('Header: вариант открытого сценария (SPEC §4.1:239)', () => {
  it('«‹ Сценарии», разделитель, название и Badge модуля есть; монограммы и appTitle нет', () => {
    renderHeader(scenario);
    const banner = within(screen.getByRole('banner'));

    const back = banner.getByRole('button', { name: ru.header.back });
    expect(back).toHaveAttribute('type', 'button');
    expect(back.querySelector('svg')).not.toBeNull();

    expect(banner.getByText(ru.header.separator)).toBeInTheDocument();
    expect(banner.getByText(scenario.title)).toBeInTheDocument();

    const badge = banner.getByText(scenario.module);
    expect(badge).toHaveAttribute('data-tone', 'module');

    expect(banner.queryByText(ru.header.monogram)).not.toBeInTheDocument();
    expect(banner.queryByText(ru.header.appTitle)).not.toBeInTheDocument();
  });

  it('пустой модуль (module: "") — название видно, Badge модуля нет', () => {
    const withoutModule = buildScenario('deployment-demo-no-module', 'repo', '');
    renderHeader(withoutModule);
    const bannerEl = screen.getByRole('banner');
    const banner = within(bannerEl);
    expect(banner.getByText(withoutModule.title)).toBeInTheDocument();
    expect(bannerEl.querySelector('[data-tone="module"]')).toBeNull();
  });
});

describe('Header: клик «‹ Сценарии» (SPEC §4.7:319 — scenario и step убираются)', () => {
  it('после клика шапка переходит в вариант каталога, стор сброшен', () => {
    renderHeader(scenario);
    fireEvent.click(screen.getByRole('button', { name: ru.header.back }));

    const banner = within(screen.getByRole('banner'));
    expect(banner.getByText(ru.header.monogram)).toBeInTheDocument();
    expect(banner.queryByRole('button', { name: ru.header.back })).not.toBeInTheDocument();

    const probe = JSON.parse(screen.getByTestId('state-probe').textContent ?? '{}') as {
      scenario: string | null;
      stepId: string | null;
    };
    expect(probe.scenario).toBeNull();
    expect(probe.stepId).toBeNull();
  });
});

describe.each([
  ['каталог', null],
  ['сценарий', scenario],
] as const)(
  'Header: клик «Загрузить из Excel» в варианте «%s» (SPEC §4.1:236)',
  (_label, source) => {
    it('открывает модальное окно импорта', () => {
      renderHeader(source);
      fireEvent.click(screen.getByRole('button', { name: ru.header.upload }));

      const probe = JSON.parse(screen.getByTestId('state-probe').textContent ?? '{}') as {
        modal: { kind: string } | null;
      };
      expect(probe.modal).toEqual({ kind: 'import' });
    });
  },
);

describe('Header: узел кнопки «Загрузить из Excel» не пересоздаётся при смене варианта (D1)', () => {
  it('переход сценарий → каталог → сценарий сохраняет тот же DOM-узел кнопки', () => {
    let dispatch: Dispatch<AppAction> | null = null;
    renderHeader(scenario, (d) => {
      dispatch = d;
    });
    if (dispatch === null) {
      throw new Error('Probe не отдал dispatch');
    }

    const before = screen.getByRole('button', { name: ru.header.upload });

    fireEvent.click(screen.getByRole('button', { name: ru.header.back }));
    expect(screen.getByRole('button', { name: ru.header.upload })).toBe(before);

    act(() => {
      dispatch?.({ type: 'openScenario', scenario });
    });
    expect(screen.getByRole('button', { name: ru.header.upload })).toBe(before);
  });
});
