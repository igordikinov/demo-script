// SPEC §1:15 (useReducer + Context), §2:49–51: StoreProvider/useAppStore живут в
// src/state/store.tsx и src/state/context.ts (react-refresh/only-export-components
// проверяется прогоном eslint в шаге разработчика, здесь — только поведение).
// jsdom: рендерим реальные компоненты через @testing-library/react.
//
// storage/fetchFn пропы StoreProvider читаются один раз при монтировании: тесты
// ниже проверяют это отдельно от базового поведения (DN-23).
import type { ReactNode } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { createInitialState, type AppState } from '../src/state/reducer';
import type { LibraryStorage } from '../src/state/library';
import type { FetchFn } from '../src/state/shared';

describe('useAppStore: вызван вне StoreProvider', () => {
  it('бросает ошибку с упоминанием StoreProvider', () => {
    // renderHook пишет упавшую ошибку в console.error («The above error occurred…») —
    // заглушаем на время теста. React 18 в dev-режиме дополнительно перебрасывает
    // ошибку рендера через синтетическое событие window 'error'; jsdom (VirtualConsole)
    // в vitest 4 сам печатает её в stderr как «Uncaught», это событие не перехватывается
    // существующим console.error-шпионом. preventDefault() помечает событие обработанным
    // для jsdom (reportException не эмитит jsdomError), а throw из useAppStore при этом
    // не подавляется.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn((event: ErrorEvent) => {
      event.preventDefault();
    });
    window.addEventListener('error', onError);
    try {
      expect(() => renderHook(() => useAppStore())).toThrow(/StoreProvider/);
      expect(onError).toHaveBeenCalled();
    } finally {
      window.removeEventListener('error', onError);
      consoleError.mockRestore();
    }
  });
});

describe('StoreProvider: состояние по умолчанию', () => {
  it('state равен createInitialState()', () => {
    const { result } = renderHook(() => useAppStore(), { wrapper: StoreProvider });
    expect(result.current.state).toEqual(createInitialState());
  });

  it('dispatch toggleMap переключает mapOpen', () => {
    const { result } = renderHook(() => useAppStore(), { wrapper: StoreProvider });
    act(() => {
      result.current.dispatch({ type: 'toggleMap' });
    });
    expect(result.current.state.mapOpen).toBe(true);
  });
});

describe('StoreProvider: initialState', () => {
  it('переданный объект становится state (тот же объект)', () => {
    const initialState: AppState = { ...createInitialState(), mapOpen: true };
    function Wrapper({ children }: { children: ReactNode }) {
      return <StoreProvider initialState={initialState}>{children}</StoreProvider>;
    }
    const { result } = renderHook(() => useAppStore(), { wrapper: Wrapper });
    expect(result.current.state).toBe(initialState);
  });
});

describe('StoreProvider: мемоизация value (useMemo по [state, dispatch])', () => {
  it('rerender без изменений — тот же result.current', () => {
    const { result, rerender } = renderHook(() => useAppStore(), { wrapper: StoreProvider });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('dispatch closeModal без открытого окна (действие ничего не меняет) — тот же result.current', () => {
    const { result } = renderHook(() => useAppStore(), { wrapper: StoreProvider });
    const first = result.current;
    act(() => {
      result.current.dispatch({ type: 'closeModal' });
    });
    expect(result.current).toBe(first);
  });

  it('dispatch, реально меняющий состояние, даёт новый result.current', () => {
    const { result } = renderHook(() => useAppStore(), { wrapper: StoreProvider });
    const first = result.current;
    act(() => {
      result.current.dispatch({ type: 'toggleMap' });
    });
    expect(result.current).not.toBe(first);
  });

  it('dispatch не меняется после реального изменения состояния', () => {
    const { result } = renderHook(() => useAppStore(), { wrapper: StoreProvider });
    const firstDispatch = result.current.dispatch;
    act(() => {
      result.current.dispatch({ type: 'toggleMap' });
    });
    expect(result.current.dispatch).toBe(firstDispatch);
  });
});

describe('StoreProvider: пропы storage/fetchFn читаются один раз при монтировании', () => {
  it('rerender с новым инлайновым fetchFn не перезапускает загрузку index.json', () => {
    const fetchFn = vi.fn<FetchFn>(() => new Promise<Response>(() => {}));
    const { rerender } = renderHook(() => useAppStore(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StoreProvider storage={null} fetchFn={(url) => fetchFn(url)}>
          {children}
        </StoreProvider>
      ),
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    rerender();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('initialState передан — storage.getItem не вызывается (SPEC §3.6:202 — «Мои» читаются при старте)', () => {
    const getItem = vi.fn(() => null);
    const storage: LibraryStorage = { getItem, setItem: vi.fn(), removeItem: vi.fn() };
    const initialState = createInitialState();
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <StoreProvider initialState={initialState} storage={storage}>
          {children}
        </StoreProvider>
      );
    }
    renderHook(() => useAppStore(), { wrapper: Wrapper });
    expect(getItem).not.toHaveBeenCalled();
  });

  it('commands не меняется при rerender без изменений', () => {
    const { result, rerender } = renderHook(() => useAppStore(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StoreProvider storage={null}>{children}</StoreProvider>
      ),
    });
    const firstCommands = result.current.commands;
    rerender();
    expect(result.current.commands).toBe(firstCommands);
  });
});

describe('StoreProvider: компонент-потребитель', () => {
  it('кнопка вызывает dispatch toggleMap и показывает state.mapOpen', () => {
    function Consumer() {
      const { state, dispatch } = useAppStore();
      return (
        <button onClick={() => dispatch({ type: 'toggleMap' })}>{String(state.mapOpen)}</button>
      );
    }
    render(
      <StoreProvider>
        <Consumer />
      </StoreProvider>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('false');
    fireEvent.click(button);
    expect(button).toHaveTextContent('true');
  });
});
