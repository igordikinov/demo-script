// SPEC §1:15 (useReducer + Context), §2:49. Контракт — план DN-09, раздел 2:
// StoreProvider/useAppStore живут в src/state/store.tsx и src/state/context.ts,
// react-refresh/only-export-components (план DN-09, дефект D2) — их разнесение
// проверяется прогоном eslint в шаге разработчика, здесь — только поведение.
// jsdom: рендерим реальные компоненты через @testing-library/react.
import type { ReactNode } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { createInitialState, type AppState } from '../src/state/reducer';

describe('useAppStore: вызван вне StoreProvider', () => {
  it('бросает ошибку с упоминанием StoreProvider', () => {
    // renderHook пишет упавшую ошибку в console.error — заглушаем на время теста.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAppStore())).toThrow(/StoreProvider/);
    consoleError.mockRestore();
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
