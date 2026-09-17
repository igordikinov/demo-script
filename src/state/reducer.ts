// Состояние приложения — чистая логика без React и DOM (SPEC §1:15: useReducer +
// React Context; §2:49: открытый сценарий, шаг, окна, признак карты). Провайдер —
// src/state/store.tsx, хук — src/state/context.ts. Контракт — план DN-09, раздел 2.
//
// - Сценарий не открыт → каталог (§4.2:243, §4.7:316).
// - Шаг при открытии: найденный или первый (§4.7:318).
// - Клик по шагу делает его активным (§4.3:265).
// - ‹ › — сквозной порядок, блок за блоком; на краю ничего не меняется (§4.5:285).
// - «Блок {n} · шаг {k} из {m}» — k и m внутри блока (§4.4:273), см. stepPosition.
// - Признак «карта раскрыта» — один на приложение, при смене шага не сбрасывается
//   и между перезагрузками не сохраняется (§4.6:309–311).
//
// Адреса страницы (DN-16) и хранилища браузера (DN-23, §3.6:205) здесь нет. Если действие
// ничего не меняет, редьюсер возвращает тот же объект состояния.
import type { Block, Scenario, Step } from '../model/schema.ts';

/** Открытое модальное окно: загрузка A4 (§4.8) или удаление «моего» сценария A5.2 (§4.2:253). */
export type ModalState = { kind: 'import' } | { kind: 'delete'; scenarioId: string };

/**
 * Тост. `seq` растёт на каждый `showToast`, даже с тем же текстом: потребитель
 * передаёт его в `key` компонента Toast, чтобы отсчёт начался заново.
 */
export interface ToastState {
  message: string;
  seq: number;
}

export interface AppState {
  /** `null` — каталог. */
  scenario: Scenario | null;
  /** Номер активного шага; `null` — каталог. */
  stepId: string | null;
  /** Одновременно открыто не больше одного окна. */
  modal: ModalState | null;
  /** Признак «карта раскрыта» (§4.6:309–311). */
  mapOpen: boolean;
  toast: ToastState | null;
}

export type AppAction =
  | { type: 'openScenario'; scenario: Scenario; stepId?: string }
  | { type: 'closeScenario' }
  | { type: 'selectStep'; stepId: string }
  | { type: 'nextStep' }
  | { type: 'prevStep' }
  | { type: 'openImport' }
  | { type: 'openDelete'; scenarioId: string }
  | { type: 'closeModal' }
  | { type: 'toggleMap' }
  | { type: 'setMapOpen'; open: boolean }
  | { type: 'showToast'; message: string }
  | { type: 'dismissToast' };

/** Позиция шага в сценарии. */
export interface StepPosition {
  block: Block;
  /** `block.n` — номер листа-блока, с 1 (§3.1:82). */
  blockN: number;
  /** Номер шага внутри блока, с 1. */
  k: number;
  /** Число шагов в блоке. */
  m: number;
  /** Номер шага в сквозном порядке, с 0. */
  index: number;
  /** Всего шагов в сценарии. */
  total: number;
}

/** Каталог: сценарий не открыт, окон нет, карта скрыта, тоста нет. */
export function createInitialState(): AppState {
  return { scenario: null, stepId: null, modal: null, mapOpen: false, toast: null };
}

/** Шаги сценария в сквозном порядке, блок за блоком (§4.5:285). */
export function flatSteps(scenario: Scenario): Step[] {
  return scenario.blocks.flatMap((block) => block.steps);
}

/** Позиция шага; `null`, если шага с таким номером в сценарии нет. */
export function stepPosition(scenario: Scenario, stepId: string): StepPosition | null {
  const total = scenario.blocks.reduce((sum, block) => sum + block.steps.length, 0);
  let offset = 0;
  for (const block of scenario.blocks) {
    const inBlock = block.steps.findIndex((step) => step.id === stepId);
    if (inBlock >= 0) {
      return {
        block,
        blockN: block.n,
        k: inBlock + 1,
        m: block.steps.length,
        index: offset + inBlock,
        total,
      };
    }
    offset += block.steps.length;
  }
  return null;
}

/** Активный шаг; `null` в каталоге. */
export function activeStep(state: AppState): Step | null {
  const { scenario, stepId } = state;
  if (scenario === null || stepId === null) {
    return null;
  }
  return flatSteps(scenario).find((step) => step.id === stepId) ?? null;
}

/** Позиция активного шага; `null` в каталоге или если шаг не найден. */
function activePosition(state: AppState): StepPosition | null {
  const { scenario, stepId } = state;
  if (scenario === null || stepId === null) {
    return null;
  }
  return stepPosition(scenario, stepId);
}

/** ‹ доступна: сценарий открыт и активный шаг не первый (§4.5:285). */
export function canPrev(state: AppState): boolean {
  const position = activePosition(state);
  return position !== null && position.index > 0;
}

/** › доступна: сценарий открыт и активный шаг не последний (§4.5:285). */
export function canNext(state: AppState): boolean {
  const position = activePosition(state);
  return position !== null && position.index < position.total - 1;
}

/** Соседний шаг в сквозном порядке: `delta` −1 или +1. На краю и в каталоге — тот же объект. */
function moveStep(state: AppState, delta: -1 | 1): AppState {
  const position = activePosition(state);
  if (state.scenario === null || position === null) {
    return state;
  }
  const next = flatSteps(state.scenario)[position.index + delta];
  if (next === undefined) {
    return state;
  }
  return { ...state, stepId: next.id };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'openScenario': {
      // Нет stepId, пустой или неизвестный — первый шаг (§4.7:318).
      const { scenario, stepId: requested } = action;
      const steps = flatSteps(scenario);
      const found = steps.find((step) => step.id === requested);
      const stepId = (found ?? steps[0])?.id ?? null;
      if (state.scenario === scenario && state.stepId === stepId) {
        return state;
      }
      return { ...state, scenario, stepId };
    }
    case 'closeScenario':
      if (state.scenario === null && state.stepId === null) {
        return state;
      }
      return { ...state, scenario: null, stepId: null };
    case 'selectStep': {
      if (state.scenario === null || state.stepId === action.stepId) {
        return state;
      }
      if (stepPosition(state.scenario, action.stepId) === null) {
        return state;
      }
      return { ...state, stepId: action.stepId };
    }
    case 'nextStep':
      return moveStep(state, 1);
    case 'prevStep':
      return moveStep(state, -1);
    case 'openImport':
      if (state.modal?.kind === 'import') {
        return state;
      }
      return { ...state, modal: { kind: 'import' } };
    case 'openDelete':
      if (state.modal?.kind === 'delete' && state.modal.scenarioId === action.scenarioId) {
        return state;
      }
      return { ...state, modal: { kind: 'delete', scenarioId: action.scenarioId } };
    case 'closeModal':
      if (state.modal === null) {
        return state;
      }
      return { ...state, modal: null };
    case 'toggleMap':
      return { ...state, mapOpen: !state.mapOpen };
    case 'setMapOpen':
      if (state.mapOpen === action.open) {
        return state;
      }
      return { ...state, mapOpen: action.open };
    case 'showToast':
      // Номер — только из состояния: StrictMode вызывает редьюсер дважды.
      return {
        ...state,
        toast: { message: action.message, seq: (state.toast?.seq ?? 0) + 1 },
      };
    case 'dismissToast':
      if (state.toast === null) {
        return state;
      }
      return { ...state, toast: null };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}
