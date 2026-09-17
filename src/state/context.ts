// Контекст стора и хук доступа (SPEC §1:15: useReducer + React Context). Лежат в
// .ts, а не в store.tsx: правило react-refresh/only-export-components ругается на
// не-компоненты, экспортируемые из .tsx (план DN-09, D2). Провайдер — store.tsx.
import { createContext, useContext } from 'react';
import type { Context, Dispatch } from 'react';
import type { AppAction, AppState } from './reducer.ts';

export interface AppStore {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

export const StoreContext: Context<AppStore | null> = createContext<AppStore | null>(null);

/** Состояние и `dispatch`. Вызов вне `StoreProvider` — ошибка разработчика. */
export function useAppStore(): AppStore {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error('useAppStore must be used within StoreProvider');
  }
  return store;
}
