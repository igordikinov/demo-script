// Контекст стора и хук доступа (SPEC §1:15: useReducer + React Context). Лежат в
// .ts, а не в store.tsx: правило react-refresh/only-export-components ругается на
// не-компоненты, экспортируемые из .tsx. Провайдер — store.tsx.
//
// Кроме состояния и dispatch стор отдаёт команды с побочными эффектами: запись «Моих»
// в localStorage (§3.6:205–206) и загрузку «Общих» (§3.7:230). Сами действия редьюсера
// остаются чистыми.
import { createContext, useContext } from 'react';
import type { Context, Dispatch } from 'react';
import type { Scenario } from '../model/schema.ts';
import type { AppAction, AppState } from './reducer.ts';

/**
 * Команды стора. Команды «Моих» считают новый список от `state.library.items` того
 * рендера, в котором получены: одна такая команда на событие — вторая подряд, до
 * перерисовки, затёрла бы первую. Тосты успеха («добавлен», «обновлён», «удалён»)
 * команды не показывают — это решает вызывающий (§4.8:350, §4.2:255).
 */
export interface StoreCommands {
  /**
   * Сохранить в «Мои» (§3.6:203): новый id `my-…`, source 'local', loadedAt — сейчас.
   * Возвращает сохранённый сценарий; `null` — места нет: список не изменён, тост
   * (§3.6:205). Недоступное хранилище — сценарий только в памяти (§3.6:206).
   */
  addMine(scenario: Scenario): Scenario | null;
  /**
   * Заменить «мой» `id` (§4.8:343): id прежний, loadedAt новый, сценарий наверху.
   * `null` — id неизвестен или места нет (тогда тост, §3.6:205).
   */
  replaceMine(id: string, scenario: Scenario): Scenario | null;
  /** Удалить «мой» `id`. `false` — id неизвестен или места нет (тогда тост, §3.6:205). */
  removeMine(id: string): boolean;
  /** «Повторить» в разделе «Общие» (§3.7:230): статус loading и новый запрос индекса. */
  retryShared(): void;
  /**
   * Открыть общий сценарий (§3.7:230, §4.7:320): файл грузится через кэш, затем
   * `openScenario` с шагом `stepId`. `false` — загрузка не удалась; состояние не
   * меняется, тоста нет — реакцию выбирает вызывающий.
   */
  openShared(id: string, stepId?: string): Promise<boolean>;
}

export interface AppStore {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  commands: StoreCommands;
}

export const StoreContext: Context<AppStore | null> = createContext<AppStore | null>(null);

/** Состояние, `dispatch` и команды. Вызов вне `StoreProvider` — ошибка разработчика. */
export function useAppStore(): AppStore {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error('useAppStore must be used within StoreProvider');
  }
  return store;
}
