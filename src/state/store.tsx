// Стор приложения (SPEC §2:49–51: открытый сценарий, шаг, окна, признак карты, «Мои» и
// «Общие»; §1:15: useReducer + React Context, без стор-библиотеки). Общий контракт
// (SPEC §10.1:438) вместе с reducer.ts и context.ts. Логика и селекторы — reducer.ts,
// хук useAppStore — context.ts: из .tsx экспортируются только компонент и типы
// (react-refresh/only-export-components).
//
// Побочные эффекты — здесь, чистые функции — library.ts и shared.ts:
// - «Мои» читаются синхронно при создании состояния (§3.6:202). Переданный
//   initialState хранилище не читает — `library` берётся из него.
// - Индекс «Общих» грузится при монтировании (§3.7:230), «Повторить» — новый запрос.
//   Флаг отмены — в каждом запуске эффекта: StrictMode запускает эффект дважды, и
//   ответ первого, уже отменённого запуска не должен менять состояние.
// - Команды «Моих» сначала пишут, потом меняют стор: при нехватке места список не
//   меняется и показывается тост (§3.6:205); при недоступном хранилище список
//   меняется в памяти (§3.6:206).
// - Пропы storage, fetchFn и now читаются один раз при монтировании: инлайновая
//   стрелка в пропе не перезапускает загрузку и не меняет команды.
import { useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { ru } from '../i18n/ru.ts';
import type { Scenario } from '../model/schema.ts';
import { StoreContext } from './context.ts';
import type { AppStore, StoreCommands } from './context.ts';
import {
  addToLibrary,
  findInLibrary,
  getBrowserStorage,
  readLibrary,
  removeFromLibrary,
  replaceInLibrary,
  writeLibrary,
} from './library.ts';
import type { LibraryStorage } from './library.ts';
import { appReducer, createInitialState } from './reducer.ts';
import type { AppState } from './reducer.ts';
import { loadSharedIndex, loadSharedScenario } from './shared.ts';
import type { FetchFn, SharedCache } from './shared.ts';

export interface StoreProviderProps {
  children: ReactNode;
  /** Начальное состояние; по умолчанию каталог с «Моими» из хранилища. */
  initialState?: AppState;
  /** Хранилище «Моих»: не передано — window.localStorage, `null` — недоступно (§3.6:206). */
  storage?: LibraryStorage | null;
  /** Запрос общих (§3.7:230); по умолчанию глобальный fetch. */
  fetchFn?: FetchFn;
  /** Часы для loadedAt «моих» (§3.1:100). */
  now?: () => Date;
}

/** Глобальный fetch берётся в момент вызова, а не при загрузке модуля; без привязки к window. */
const defaultFetch: FetchFn = (url) => fetch(url);

const defaultNow = (): Date => new Date();

/** Зависимости провайдера, зафиксированные при монтировании. */
interface StoreDeps {
  storage: LibraryStorage | null;
  fetchFn: FetchFn;
  now: () => Date;
}

export function StoreProvider({
  children,
  initialState,
  storage,
  fetchFn = defaultFetch,
  now = defaultNow,
}: StoreProviderProps) {
  const [deps] = useState<StoreDeps>(() => ({
    storage: storage === undefined ? getBrowserStorage() : storage,
    fetchFn,
    now,
  }));
  const [state, dispatch] = useReducer(
    appReducer,
    initialState,
    (initial: AppState | undefined) =>
      initial ?? { ...createInitialState(), library: readLibrary(deps.storage) },
  );

  // Номер попытки: «Повторить» увеличивает его и перезапускает эффект.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadSharedIndex(deps.fetchFn).then(
      (index) => {
        if (!cancelled) {
          dispatch({ type: 'sharedLoaded', items: index.items });
        }
      },
      () => {
        if (!cancelled) {
          dispatch({ type: 'sharedFailed' });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [deps, attempt]);

  // Загруженные общие сценарии — до перезагрузки (§3.7:230).
  const [cache] = useState<SharedCache>(() => new Map());

  const libraryItems = state.library.items;
  const commands = useMemo<StoreCommands>(() => {
    /** Запись нового списка; `false` — места нет, список не применён (§3.6:205). */
    const commit = (items: Scenario[]): boolean => {
      const result = writeLibrary(deps.storage, items);
      if (result === 'quota') {
        dispatch({ type: 'showToast', message: ru.library.quotaExceeded });
        return false;
      }
      if (result === 'unavailable') {
        dispatch({ type: 'libraryUnavailable' });
      }
      dispatch({ type: 'librarySet', items });
      return true;
    };
    const stamp = (): string => deps.now().toISOString();

    return {
      addMine(scenario) {
        const change = addToLibrary(libraryItems, scenario, stamp());
        return commit(change.items) ? change.saved : null;
      },
      replaceMine(id, scenario) {
        const change = replaceInLibrary(libraryItems, id, scenario, stamp());
        if (change === null) {
          return null;
        }
        return commit(change.items) ? change.saved : null;
      },
      removeMine(id) {
        if (findInLibrary(libraryItems, id) === undefined) {
          return false;
        }
        return commit(removeFromLibrary(libraryItems, id));
      },
      retryShared() {
        dispatch({ type: 'sharedLoading' });
        setAttempt((n) => n + 1);
      },
      async openShared(id, stepId) {
        let scenario: Scenario;
        try {
          scenario = await loadSharedScenario(deps.fetchFn, id, cache);
        } catch {
          return false;
        }
        dispatch({ type: 'openScenario', scenario, stepId });
        return true;
      },
    };
  }, [deps, libraryItems, cache]);

  const value = useMemo<AppStore>(
    () => ({ state, dispatch, commands }),
    [state, dispatch, commands],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export type {
  AppAction,
  AppState,
  LibraryState,
  ModalState,
  SharedState,
  SharedStatus,
  StepPosition,
  ToastState,
} from './reducer.ts';
export type { AppStore, StoreCommands } from './context.ts';
