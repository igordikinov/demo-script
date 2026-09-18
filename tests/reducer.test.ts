// @vitest-environment node
// SPEC §1:15 (useReducer + Context), §2:49–51 (state/store.tsx — сценарий, шаг,
// окна, признак карты; state/library.ts «мои»; state/shared.ts общие), §4.3:265,
// §4.4:273, §4.5:285 (ТК13), §4.6:309–311, §4.7:318. library/shared в AppState —
// только данные (SPEC §3.6:199, §3.7:209): чтения localStorage и fetch здесь нет,
// это state/library.ts и state/shared.ts (DN-23).
// Стор — чистые данные, поэтому гоняем в Node, без DOM.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import { toIndexItem } from '../src/model/scenarioIndex';
import {
  appReducer,
  createInitialState,
  flatSteps,
  stepPosition,
  activeStep,
  canPrev,
  canNext,
  type AppState,
  type AppAction,
} from '../src/state/reducer';

// Эталон содержания — tests/fixtures/deployment-demo.json (CLAUDE.md: не
// придумывать содержание сценария). Способ дополнить поля, которых в
// фикстуре нет (schema/id/source/…), — копия validScenario() из
// tests/schema.test.ts (план DN-09, раздел 0).
const fixturePath = fileURLToPath(new URL('./fixtures/deployment-demo.json', import.meta.url));
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
const myScenario = buildScenario('my-deployment-demo', 'local');

describe('flatSteps: факты фикстуры (SPEC §8 ТК1: 3 блока, 29 шагов)', () => {
  it('29 шагов, первый 1.1, последний 3.7', () => {
    const steps = flatSteps(scenario);
    expect(steps).toHaveLength(29);
    expect(steps[0]?.id).toBe('1.1');
    expect(steps[28]?.id).toBe('3.7');
  });

  it('номера шагов без повторов', () => {
    const ids = flatSteps(scenario).map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('число шагов по блокам — [11, 11, 7]', () => {
    expect(scenario.blocks.map((block) => block.steps.length)).toEqual([11, 11, 7]);
  });
});

describe('createInitialState', () => {
  it('каталог: сценарий, шаг, окно и тост пустые, карта закрыта, «Мои» пусты и доступны, «Общие» грузятся (SPEC §2:49–51)', () => {
    expect(createInitialState()).toEqual({
      scenario: null,
      stepId: null,
      modal: null,
      mapOpen: false,
      toast: null,
      library: { items: [], available: true },
      shared: { status: 'loading', items: [] },
    });
  });

  it('два вызова дают разные объекты (не общий синглтон)', () => {
    expect(createInitialState()).not.toBe(createInitialState());
  });

  it('library.items — новый массив на каждый вызов', () => {
    expect(createInitialState().library.items).not.toBe(createInitialState().library.items);
  });
});

describe('appReducer: openScenario (SPEC §4.7:318 — неизвестный/пустой шаг даёт первый)', () => {
  it('без stepId открывает на первом шаге, scenario — переданный объект', () => {
    const state = appReducer(createInitialState(), { type: 'openScenario', scenario });
    expect(state.stepId).toBe('1.1');
    expect(state.scenario).toBe(scenario);
  });

  it('с известным stepId 2.5 открывает на нём', () => {
    const state = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '2.5',
    });
    expect(state.stepId).toBe('2.5');
  });

  it.each(['9.9', ''])('с неизвестным stepId %s открывает на первом шаге', (stepId) => {
    const state = appReducer(createInitialState(), { type: 'openScenario', scenario, stepId });
    expect(state.stepId).toBe('1.1');
  });

  it('открытие другого сценария без stepId сбрасывает на первый шаг нового сценария', () => {
    const active = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '2.5',
    });
    const next = appReducer(active, { type: 'openScenario', scenario: myScenario });
    expect(next.scenario).toBe(myScenario);
    expect(next.stepId).toBe('1.1');
  });

  it('тот же сценарий по ссылке и тот же итоговый шаг — тот же объект', () => {
    const state = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '2.5',
    });
    const again = appReducer(state, { type: 'openScenario', scenario, stepId: '2.5' });
    expect(again).toBe(state);
  });

  it('окно загрузки, mapOpen и тост сохраняются', () => {
    const withExtras: AppState = {
      ...createInitialState(),
      modal: { kind: 'import' },
      mapOpen: true,
      toast: { message: 'x', seq: 1 },
    };
    const state = appReducer(withExtras, { type: 'openScenario', scenario });
    expect(state.modal).toEqual({ kind: 'import' });
    expect(state.mapOpen).toBe(true);
    expect(state.toast).toEqual({ message: 'x', seq: 1 });
  });
});

describe('appReducer: closeScenario', () => {
  it('из 2.5 сбрасывает сценарий и шаг, окно/карта/тост не трогаются', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '2.5',
    });
    const withExtras: AppState = {
      ...opened,
      modal: { kind: 'import' },
      mapOpen: true,
      toast: { message: 'x', seq: 1 },
    };
    const state = appReducer(withExtras, { type: 'closeScenario' });
    expect(state.scenario).toBeNull();
    expect(state.stepId).toBeNull();
    expect(state.modal).toEqual({ kind: 'import' });
    expect(state.mapOpen).toBe(true);
    expect(state.toast).toEqual({ message: 'x', seq: 1 });
  });

  it('уже в каталоге — тот же объект', () => {
    const state = createInitialState();
    expect(appReducer(state, { type: 'closeScenario' })).toBe(state);
  });
});

describe('appReducer: selectStep (SPEC §4.3:265 — клик делает шаг активным)', () => {
  it('с 1.1 на 1.10 переключает активный шаг', () => {
    const opened = appReducer(createInitialState(), { type: 'openScenario', scenario });
    const state = appReducer(opened, { type: 'selectStep', stepId: '1.10' });
    expect(state.stepId).toBe('1.10');
  });

  it('неизвестный шаг 9.9 — тот же объект', () => {
    const opened = appReducer(createInitialState(), { type: 'openScenario', scenario });
    expect(appReducer(opened, { type: 'selectStep', stepId: '9.9' })).toBe(opened);
  });

  it('уже активный шаг — тот же объект', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '2.5',
    });
    expect(appReducer(opened, { type: 'selectStep', stepId: '2.5' })).toBe(opened);
  });

  it('в каталоге — тот же объект', () => {
    const state = createInitialState();
    expect(appReducer(state, { type: 'selectStep', stepId: '1.1' })).toBe(state);
  });
});

describe('appReducer: nextStep/prevStep — сквозная навигация (SPEC §4.5:285, ТК13)', () => {
  it('nextStep: 1.11 → 2.1 (переход между блоками)', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '1.11',
    });
    expect(appReducer(opened, { type: 'nextStep' }).stepId).toBe('2.1');
  });

  it('nextStep: 1.1 → 1.2', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '1.1',
    });
    expect(appReducer(opened, { type: 'nextStep' }).stepId).toBe('1.2');
  });

  it('nextStep: 3.6 → 3.7', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '3.6',
    });
    expect(appReducer(opened, { type: 'nextStep' }).stepId).toBe('3.7');
  });

  it('prevStep: 2.1 → 1.11 (переход между блоками)', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '2.1',
    });
    expect(appReducer(opened, { type: 'prevStep' }).stepId).toBe('1.11');
  });

  it('prevStep на первом шаге 1.1 — тот же объект (‹ disabled)', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '1.1',
    });
    expect(appReducer(opened, { type: 'prevStep' })).toBe(opened);
  });

  it('nextStep на последнем шаге 3.7 — тот же объект (› disabled)', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '3.7',
    });
    expect(appReducer(opened, { type: 'nextStep' })).toBe(opened);
  });

  it('в каталоге nextStep и prevStep — тот же объект', () => {
    const state = createInitialState();
    expect(appReducer(state, { type: 'nextStep' })).toBe(state);
    expect(appReducer(state, { type: 'prevStep' })).toBe(state);
  });

  it('28 раз nextStep от 1.1 проходит порядок flatSteps', () => {
    const steps = flatSteps(scenario);
    let state = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '1.1',
    });
    for (let i = 1; i < steps.length; i += 1) {
      state = appReducer(state, { type: 'nextStep' });
      expect(state.stepId).toBe(steps[i]?.id);
    }
  });
});

describe('canPrev / canNext', () => {
  it.each([
    ['1.1', false, true],
    ['2.1', true, true],
    ['3.7', true, false],
  ])('%s → canPrev=%s, canNext=%s', (stepId, prev, next) => {
    const state = appReducer(createInitialState(), { type: 'openScenario', scenario, stepId });
    expect(canPrev(state)).toBe(prev);
    expect(canNext(state)).toBe(next);
  });

  it('каталог → (false, false)', () => {
    const state = createInitialState();
    expect(canPrev(state)).toBe(false);
    expect(canNext(state)).toBe(false);
  });
});

describe('activeStep', () => {
  it('каталог → null', () => {
    expect(activeStep(createInitialState())).toBeNull();
  });

  it('1.10 → шаг с тем же title, что blocks[0].steps[9]', () => {
    const state = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '1.10',
    });
    expect(activeStep(state)?.title).toBe(scenario.blocks[0]?.steps[9]?.title);
  });
});

describe('stepPosition (SPEC §3.1:82 — n листа-блока с 1)', () => {
  it('1.10 → {blockN:1, k:10, m:11, index:9, total:29}, block — scenario.blocks[0]', () => {
    const pos = stepPosition(scenario, '1.10');
    expect(pos).toMatchObject({ blockN: 1, k: 10, m: 11, index: 9, total: 29 });
    expect(pos?.block).toBe(scenario.blocks[0]);
  });

  it('2.1 → {blockN:2, k:1, m:11, index:11, total:29}', () => {
    expect(stepPosition(scenario, '2.1')).toMatchObject({
      blockN: 2,
      k: 1,
      m: 11,
      index: 11,
      total: 29,
    });
  });

  it('3.7 → {blockN:3, k:7, m:7, index:28, total:29}', () => {
    expect(stepPosition(scenario, '3.7')).toMatchObject({
      blockN: 3,
      k: 7,
      m: 7,
      index: 28,
      total: 29,
    });
  });

  it('неизвестный шаг 9.9 → null', () => {
    expect(stepPosition(scenario, '9.9')).toBeNull();
  });
});

describe('appReducer: модальные окна (A4 — загрузка, A5.2 — удаление)', () => {
  it('openImport из каталога открывает окно загрузки', () => {
    const state = appReducer(createInitialState(), { type: 'openImport' });
    expect(state.modal).toEqual({ kind: 'import' });
  });

  it('openImport из открытого сценария (2.5) не трогает сценарий и шаг', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '2.5',
    });
    const state = appReducer(opened, { type: 'openImport' });
    expect(state.scenario).toBe(scenario);
    expect(state.stepId).toBe('2.5');
    expect(state.modal).toEqual({ kind: 'import' });
  });

  it('повторный openImport — тот же объект', () => {
    const state = appReducer(createInitialState(), { type: 'openImport' });
    expect(appReducer(state, { type: 'openImport' })).toBe(state);
  });

  it('openDelete запоминает scenarioId', () => {
    const state = appReducer(createInitialState(), { type: 'openDelete', scenarioId: 'my-x' });
    expect(state.modal).toEqual({ kind: 'delete', scenarioId: 'my-x' });
  });

  it('openDelete с тем же id — тот же объект', () => {
    const state = appReducer(createInitialState(), { type: 'openDelete', scenarioId: 'my-x' });
    expect(appReducer(state, { type: 'openDelete', scenarioId: 'my-x' })).toBe(state);
  });

  it('openDelete с другим id заменяет окно', () => {
    const state = appReducer(createInitialState(), { type: 'openDelete', scenarioId: 'my-x' });
    const next = appReducer(state, { type: 'openDelete', scenarioId: 'my-y' });
    expect(next.modal).toEqual({ kind: 'delete', scenarioId: 'my-y' });
  });

  it('окно загрузки открыто → openDelete заменяет его окном удаления', () => {
    const state = appReducer(createInitialState(), { type: 'openImport' });
    const next = appReducer(state, { type: 'openDelete', scenarioId: 'my-x' });
    expect(next.modal).toEqual({ kind: 'delete', scenarioId: 'my-x' });
  });

  it('окно удаления открыто → openImport заменяет его окном загрузки', () => {
    const state = appReducer(createInitialState(), { type: 'openDelete', scenarioId: 'my-x' });
    const next = appReducer(state, { type: 'openImport' });
    expect(next.modal).toEqual({ kind: 'import' });
  });

  it('closeModal сбрасывает окно', () => {
    const state = appReducer(createInitialState(), { type: 'openImport' });
    expect(appReducer(state, { type: 'closeModal' }).modal).toBeNull();
  });

  it('повторный closeModal (окно уже null) — тот же объект', () => {
    const state = createInitialState();
    expect(appReducer(state, { type: 'closeModal' })).toBe(state);
  });
});

describe('appReducer: признак карты — один на приложение (SPEC §4.6:309, :311)', () => {
  it('toggleMap: false → true → false', () => {
    const opened = appReducer(createInitialState(), { type: 'toggleMap' });
    expect(opened.mapOpen).toBe(true);
    const closed = appReducer(opened, { type: 'toggleMap' });
    expect(closed.mapOpen).toBe(false);
  });

  it('setMapOpen(true), когда уже true — тот же объект', () => {
    const state = appReducer(createInitialState(), { type: 'setMapOpen', open: true });
    expect(appReducer(state, { type: 'setMapOpen', open: true })).toBe(state);
  });

  // Редьюсер обязан читать action.open, а не всегда закрывать/раскрывать карту —
  // иначе явное закрытие карты (например, кнопкой ✕) перестанет работать.
  it('setMapOpen(false) из mapOpen=true закрывает карту (новый объект)', () => {
    const opened = appReducer(createInitialState(), { type: 'setMapOpen', open: true });
    const closed = appReducer(opened, { type: 'setMapOpen', open: false });
    expect(closed.mapOpen).toBe(false);
    expect(closed).not.toBe(opened);
  });

  it('setMapOpen(true) из mapOpen=false открывает карту', () => {
    const state = createInitialState();
    expect(appReducer(state, { type: 'setMapOpen', open: true }).mapOpen).toBe(true);
  });

  // Симметрично true→true выше: короткое замыкание на «то же значение» не должно
  // зависеть от того, какое именно булево значение уже установлено.
  it('setMapOpen(false), когда уже false — тот же объект', () => {
    const state = createInitialState();
    expect(appReducer(state, { type: 'setMapOpen', open: false })).toBe(state);
  });

  const mapPreservedCases: { name: string; action: AppAction }[] = [
    { name: 'nextStep', action: { type: 'nextStep' } },
    { name: 'prevStep', action: { type: 'prevStep' } },
    { name: 'selectStep', action: { type: 'selectStep', stepId: '1.5' } },
    {
      name: 'openScenario другого сценария',
      action: { type: 'openScenario', scenario: myScenario },
    },
    { name: 'closeScenario', action: { type: 'closeScenario' } },
    { name: 'openImport', action: { type: 'openImport' } },
    { name: 'closeModal', action: { type: 'closeModal' } },
  ];

  it.each(mapPreservedCases)(
    'mapOpen=true сохраняется после $name (переход на 1.11 показывает узел 1.11)',
    ({ action }) => {
      const opened = appReducer(createInitialState(), {
        type: 'openScenario',
        scenario,
        stepId: '2.1',
      });
      const withMap: AppState = { ...opened, mapOpen: true };
      expect(appReducer(withMap, action).mapOpen).toBe(true);
    },
  );
});

describe('appReducer: тост (новый seq на каждый showToast, чтобы Toast перезапускал отсчёт)', () => {
  it('showToast(A) устанавливает message и не трогает остальные поля', () => {
    const opened = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '2.1',
    });
    const state = appReducer(opened, { type: 'showToast', message: 'A' });
    expect(state.toast?.message).toBe('A');
    expect(state.scenario).toBe(opened.scenario);
    expect(state.stepId).toBe(opened.stepId);
    expect(state.modal).toBe(opened.modal);
    expect(state.mapOpen).toBe(opened.mapOpen);
  });

  it('showToast(B) заменяет текст предыдущего тоста', () => {
    const first = appReducer(createInitialState(), { type: 'showToast', message: 'A' });
    const second = appReducer(first, { type: 'showToast', message: 'B' });
    expect(second.toast?.message).toBe('B');
  });

  it('повторный showToast(A) — новый объект с другим seq, чтобы Toast перезапустил отсчёт (D1)', () => {
    const first = appReducer(createInitialState(), { type: 'showToast', message: 'A' });
    const second = appReducer(first, { type: 'showToast', message: 'A' });
    expect(second).not.toBe(first);
    expect(second.toast?.message).toBe('A');
    expect(second.toast?.seq).not.toBe(first.toast?.seq);
  });

  it('dismissToast сбрасывает тост', () => {
    const state = appReducer(createInitialState(), { type: 'showToast', message: 'A' });
    expect(appReducer(state, { type: 'dismissToast' }).toast).toBeNull();
  });

  it('повторный dismissToast (тост уже null) — тот же объект', () => {
    const state = createInitialState();
    expect(appReducer(state, { type: 'dismissToast' })).toBe(state);
  });
});

describe('appReducer: library (SPEC §2:49–51 — state/library.ts «мои» в localStorage, DN-23)', () => {
  it('librarySet заменяет items, available не трогает', () => {
    const state: AppState = { ...createInitialState(), library: { items: [], available: false } };
    const next = appReducer(state, { type: 'librarySet', items: [myScenario] });
    expect(next.library).toEqual({ items: [myScenario], available: false });
  });

  it('librarySet с той же ссылкой на items — тот же объект', () => {
    const items = [myScenario];
    const state: AppState = { ...createInitialState(), library: { items, available: true } };
    const next = appReducer(state, { type: 'librarySet', items });
    expect(next).toBe(state);
  });

  it('libraryUnavailable выставляет available=false, items не трогает', () => {
    const state: AppState = {
      ...createInitialState(),
      library: { items: [myScenario], available: true },
    };
    const next = appReducer(state, { type: 'libraryUnavailable' });
    expect(next.library).toEqual({ items: [myScenario], available: false });
  });

  it('libraryUnavailable, когда available уже false — тот же объект', () => {
    const state: AppState = { ...createInitialState(), library: { items: [], available: false } };
    expect(appReducer(state, { type: 'libraryUnavailable' })).toBe(state);
  });
});

describe('appReducer: shared (SPEC §3.7:230 — статус загрузки index.json, DN-23)', () => {
  const item = toIndexItem(scenario);

  it('sharedLoading из готового статуса переводит в loading, items не трогает', () => {
    const state: AppState = { ...createInitialState(), shared: { status: 'ready', items: [item] } };
    const next = appReducer(state, { type: 'sharedLoading' });
    expect(next.shared).toEqual({ status: 'loading', items: [item] });
  });

  it('sharedLoading, когда уже loading — тот же объект', () => {
    const state = createInitialState();
    expect(appReducer(state, { type: 'sharedLoading' })).toBe(state);
  });

  it('sharedLoaded ставит status ready и items = action.items', () => {
    const state = createInitialState();
    const next = appReducer(state, { type: 'sharedLoaded', items: [item] });
    expect(next.shared).toEqual({ status: 'ready', items: [item] });
  });

  it('sharedFailed ставит status error и items []', () => {
    const state: AppState = { ...createInitialState(), shared: { status: 'loading', items: [] } };
    const next = appReducer(state, { type: 'sharedFailed' });
    expect(next.shared).toEqual({ status: 'error', items: [] });
  });

  it('sharedFailed, когда уже error с [] — тот же объект', () => {
    const state: AppState = { ...createInitialState(), shared: { status: 'error', items: [] } };
    expect(appReducer(state, { type: 'sharedFailed' })).toBe(state);
  });
});

describe('appReducer: library и shared не трогаются действиями каталога/сценария (SPEC §2:49–51)', () => {
  const withLibraryAndShared: AppState = {
    ...createInitialState(),
    library: { items: [myScenario], available: false },
    shared: { status: 'ready', items: [toIndexItem(scenario)] },
  };

  it('openScenario сохраняет library и shared (та же ссылка)', () => {
    const next = appReducer(withLibraryAndShared, { type: 'openScenario', scenario });
    expect(next.library).toBe(withLibraryAndShared.library);
    expect(next.shared).toBe(withLibraryAndShared.shared);
  });

  it('showToast сохраняет library и shared (та же ссылка)', () => {
    const next = appReducer(withLibraryAndShared, { type: 'showToast', message: 'A' });
    expect(next.library).toBe(withLibraryAndShared.library);
    expect(next.shared).toBe(withLibraryAndShared.shared);
  });
});

describe('appReducer: чистота (без мутаций и без глобального счётчика)', () => {
  it('входное состояние не мутируется', () => {
    const state = appReducer(createInitialState(), {
      type: 'openScenario',
      scenario,
      stepId: '2.1',
    });
    const before = structuredClone(state);
    appReducer(state, { type: 'nextStep' });
    expect(state).toEqual(before);
  });

  it('двойной вызов appReducer(s, showToast) даёт равные результаты (seq не из глобального счётчика)', () => {
    const state = appReducer(createInitialState(), { type: 'showToast', message: 'A' });
    const a = appReducer(state, { type: 'showToast', message: 'B' });
    const b = appReducer(state, { type: 'showToast', message: 'B' });
    expect(a).toEqual(b);
  });
});
