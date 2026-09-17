// Стор приложения (SPEC §2:49: открытый сценарий, шаг, окна, признак карты;
// §1:15: useReducer + React Context, без стор-библиотеки). Общий контракт
// (SPEC §10.1:438) вместе с reducer.ts и context.ts. Логика и селекторы —
// reducer.ts, хук useAppStore — context.ts: из .tsx экспортируются только
// компонент и типы (react-refresh/only-export-components, план DN-09, D2).
import { useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import { StoreContext } from './context.ts';
import type { AppStore } from './context.ts';
import { appReducer, createInitialState } from './reducer.ts';
import type { AppState } from './reducer.ts';

interface StoreProviderProps {
  children: ReactNode;
  /** Начальное состояние; по умолчанию `createInitialState()` — каталог. */
  initialState?: AppState;
}

export function StoreProvider({ children, initialState }: StoreProviderProps) {
  const [state, dispatch] = useReducer(
    appReducer,
    initialState,
    (initial: AppState | undefined) => initial ?? createInitialState(),
  );
  const value = useMemo<AppStore>(() => ({ state, dispatch }), [state, dispatch]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export type { AppAction, AppState, ModalState, StepPosition, ToastState } from './reducer.ts';
export type { AppStore } from './context.ts';
