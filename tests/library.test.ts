// «Мои» сценарии — SPEC §3.6:199-207 (state/library.ts). Чистые функции проверяются
// напрямую (storage — параметр, MemoryStorage ниже), интеграция с React — через
// StoreProvider/useAppStore (ТК15 SPEC §8:411, ТК32 SPEC §8:428). Разделы каталога,
// подсказки и корзина — DN-24/DN-25, здесь их нет.
import { createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import {
  LIBRARY_KEY,
  addToLibrary,
  isQuotaError,
  newLocalId,
  readLibrary,
  removeFromLibrary,
  replaceInLibrary,
  sortLibrary,
  writeLibrary,
  type LibraryStorage,
} from '../src/state/library';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { ru } from '../src/i18n/ru';

// Эталон содержания — tests/fixtures/deployment-demo.json (CLAUDE.md: не придумывать
// содержание сценария). Название 'Deployment — демо-сценарий' даёт слаг
// 'deployment-demo-scenariy' (SPEC §3.6:203) — используется в тестах newLocalId.
//
// import.meta.url сохраняется в переменную до new URL(): иначе Vite в jsdom-окружении
// статически распознаёт литерал `new URL('...', import.meta.url)` как импорт ассета и
// на рантайме подставляет вместо файлового URL адрес self.location, из-за чего
// fileURLToPath падает с «The URL must be of scheme file» (tests/StepCard.test.tsx:28–36).
const importMetaUrl = import.meta.url;
const fixturePath = fileURLToPath(new URL('./fixtures/deployment-demo.json', importMetaUrl));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: Record<string, unknown>[] }[];
};

function buildScenario(
  id: string,
  source: 'repo' | 'local',
  overrides: Partial<Scenario> = {},
): Scenario {
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
    ...overrides,
  });
}

/** Хранилище в памяти на Map — тот же контракт, что LibraryStorage. */
class MemoryStorage implements LibraryStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) ?? null) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** MemoryStorage с уже записанным `demo-navigator:library:v1` (сериализует items как есть). */
function storageWith(items: readonly unknown[]): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem(LIBRARY_KEY, JSON.stringify({ schema: 1, items }));
  return storage;
}

function makeWrapper(storage: LibraryStorage | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(StoreProvider, { storage, children });
  };
}

// vi.spyOn(window, 'localStorage', 'get') и Storage.prototype используются ниже —
// снимаются здесь, а не в каждом it, на случай раннего return из теста.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('readLibrary (SPEC §3.6:202)', () => {
  it('ключа нет → {[], true}, setItem и removeItem не вызываются', () => {
    const storage = new MemoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const removeItem = vi.spyOn(storage, 'removeItem');
    expect(readLibrary(storage)).toEqual({ items: [], available: true });
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('порядок по loadedAt, новые сверху (SPEC §3.6:204), без перезаписи хранилища', () => {
    const a = buildScenario('my-a', 'local', { loadedAt: '2026-09-10T00:00:00Z' });
    const b = buildScenario('my-b', 'local', { loadedAt: '2026-09-12T00:00:00Z' });
    const storage = storageWith([a, b]);
    const setItem = vi.spyOn(storage, 'setItem');
    const result = readLibrary(storage);
    expect(result.items.map((item) => item.id)).toEqual(['my-b', 'my-a']);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("нечитаемый JSON '{' → {[], true}, ключ удалён", () => {
    const storage = new MemoryStorage();
    storage.setItem(LIBRARY_KEY, '{');
    expect(readLibrary(storage)).toEqual({ items: [], available: true });
    expect(storage.getItem(LIBRARY_KEY)).toBeNull();
  });

  it('один битый элемент из трёх выброшен, оставшиеся два перезаписаны в хранилище', () => {
    const a = buildScenario('my-a', 'local', { loadedAt: '2026-09-10T00:00:00Z' });
    const c = buildScenario('my-c', 'local', { loadedAt: '2026-09-01T00:00:00Z' });
    const broken = { ...buildScenario('my-b', 'local'), blocks: [] }; // BlockSchema.min(1) не пройдёт
    const storage = storageWith([a, broken, c]);
    const result = readLibrary(storage);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.id)).toEqual(['my-a', 'my-c']);
    const raw = JSON.parse(storage.getItem(LIBRARY_KEY) ?? 'null') as {
      schema: number;
      items: { id: string }[];
    };
    expect(raw.schema).toBe(1);
    expect(raw.items.map((item) => item.id)).toEqual(['my-a', 'my-c']);
  });

  it("source 'repo' и id без префикса my- в хранилище выбрасываются (SPEC §3.6:201 — «у всех source: local»)", () => {
    const repoItem = buildScenario('deployment-demo', 'repo');
    const badId = { ...buildScenario('my-x', 'local'), id: 'deployment-demo' };
    const storage = storageWith([repoItem, badId]);
    const result = readLibrary(storage);
    expect(result.items).toEqual([]);
    expect(storage.getItem(LIBRARY_KEY)).toBe(JSON.stringify({ schema: 1, items: [] }));
  });

  it.each([
    ['schema: 2', { schema: 2, items: [] }],
    ['null', null],
    ['[] верхнего уровня', []],
  ])('верхний уровень не {schema:1,items:[]} (%s) → {[], true}, ключ удалён', (_label, value) => {
    const storage = new MemoryStorage();
    storage.setItem(LIBRARY_KEY, JSON.stringify(value));
    expect(readLibrary(storage)).toEqual({ items: [], available: true });
    expect(storage.getItem(LIBRARY_KEY)).toBeNull();
  });

  it('getItem бросает DOMException(SecurityError) → {[], false}, без исключения наружу', () => {
    const storage: LibraryStorage = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(() => readLibrary(storage)).not.toThrow();
    expect(readLibrary(storage)).toEqual({ items: [], available: false });
  });

  it('storage === null → {[], false}', () => {
    expect(readLibrary(null)).toEqual({ items: [], available: false });
  });

  it('второй вызов на уже очищенных данных не пишет повторно (StrictMode дважды вызывает инициализатор useReducer)', () => {
    const a = buildScenario('my-a', 'local');
    const broken = { ...buildScenario('my-b', 'local'), blocks: [] };
    const storage = storageWith([a, broken]);
    readLibrary(storage); // первый вызов чистит и перезаписывает
    const setItem = vi.spyOn(storage, 'setItem');
    const second = readLibrary(storage);
    expect(second.items.map((item) => item.id)).toEqual(['my-a']);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('writeLibrary (SPEC §3.6:205)', () => {
  it("'ok': значение ключа — JSON.stringify({schema:1, items})", () => {
    const storage = new MemoryStorage();
    const items = [buildScenario('my-a', 'local')];
    expect(writeLibrary(storage, items)).toBe('ok');
    expect(storage.getItem(LIBRARY_KEY)).toBe(JSON.stringify({ schema: 1, items }));
  });

  it.each([
    ['DOMException QuotaExceededError', () => new DOMException('full', 'QuotaExceededError')],
    [
      'name NS_ERROR_DOM_QUOTA_REACHED',
      () => Object.assign(new Error('quota'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }),
    ],
    ['code 22', () => Object.assign(new Error('quota'), { code: 22 })],
  ])("%s → 'quota'", (_label, buildError) => {
    const storage: LibraryStorage = {
      getItem: () => null,
      setItem: () => {
        throw buildError();
      },
      removeItem: vi.fn(),
    };
    expect(writeLibrary(storage, [])).toBe('quota');
  });

  it("SecurityError → 'unavailable'", () => {
    const storage: LibraryStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      removeItem: vi.fn(),
    };
    expect(writeLibrary(storage, [])).toBe('unavailable');
  });

  it("storage === null → 'unavailable'", () => {
    expect(writeLibrary(null, [])).toBe('unavailable');
  });
});

describe('isQuotaError', () => {
  it.each([
    ['DOMException QuotaExceededError', new DOMException('full', 'QuotaExceededError')],
    [
      'name NS_ERROR_DOM_QUOTA_REACHED',
      Object.assign(new Error('quota'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }),
    ],
    ['code 22', Object.assign(new Error('quota'), { code: 22 })],
  ])('%s → true', (_label, error) => {
    expect(isQuotaError(error)).toBe(true);
  });

  it('SecurityError → false', () => {
    expect(isQuotaError(new DOMException('blocked', 'SecurityError'))).toBe(false);
  });
});

describe('newLocalId (SPEC §3.6:203)', () => {
  it("('Deployment — демо-сценарий', []) → 'my-deployment-demo-scenariy'", () => {
    expect(newLocalId('Deployment — демо-сценарий', [])).toBe('my-deployment-demo-scenariy');
  });

  it('базовый id занят → суффикс -2', () => {
    expect(newLocalId('Deployment — демо-сценарий', ['my-deployment-demo-scenariy'])).toBe(
      'my-deployment-demo-scenariy-2',
    );
  });

  it('заняты базовый и -2 → суффикс -3', () => {
    expect(
      newLocalId('Deployment — демо-сценарий', [
        'my-deployment-demo-scenariy',
        'my-deployment-demo-scenariy-2',
      ]),
    ).toBe('my-deployment-demo-scenariy-3');
  });

  it("'!!!' (без букв и цифр) → fallback 'scenario' → 'my-scenario'", () => {
    expect(newLocalId('!!!', [])).toBe('my-scenario');
  });

  it('длинное название режется по лимиту 48 символов (SPEC §3.6:203)', () => {
    expect(
      newLocalId('Планирование закупок и производства на горизонте двенадцати месяцев', []),
    ).toBe('my-planirovanie-zakupok-i-proizvodstva-na');
  });

  it('результат всегда проходит /^my-[a-z0-9-]+$/', () => {
    expect(newLocalId('!!!', [])).toMatch(/^my-[a-z0-9-]+$/);
    expect(newLocalId('Deployment — демо-сценарий', [])).toMatch(/^my-[a-z0-9-]+$/);
  });
});

describe('addToLibrary / replaceInLibrary / removeFromLibrary / sortLibrary', () => {
  it(
    'вход как из readWorkbook (id без my-, source local, loadedAt "") даёт saved с my-id и переданным ' +
      'loadedAt; items[0] === saved; вход не мутирован (SPEC §3.1:100)',
    () => {
      const draft = buildScenario('deployment-demo', 'local', { loadedAt: '' });
      const before = [buildScenario('my-other', 'local')];
      const snapshot = [...before];
      const { items, saved } = addToLibrary(before, draft, '2026-09-16T00:00:00Z');
      expect(saved.id).toBe('my-deployment-demo-scenariy');
      expect(saved.source).toBe('local');
      expect(saved.loadedAt).toBe('2026-09-16T00:00:00Z');
      expect(items[0]).toBe(saved);
      expect(before).toEqual(snapshot);
    },
  );

  it('равный loadedAt — новый элемент сверху', () => {
    const existing = buildScenario('my-x', 'local', { loadedAt: '2026-09-16T00:00:00Z' });
    const draft = buildScenario('deployment-demo', 'local', { loadedAt: '' });
    const { items, saved } = addToLibrary([existing], draft, '2026-09-16T00:00:00Z');
    expect(items[0]).toBe(saved);
    expect(items[1]).toBe(existing);
  });

  it('replaceInLibrary("my-x", t3): id прежний, loadedAt t3, поднят наверх (SPEC §4.8:343)', () => {
    const older = buildScenario('my-older', 'local', { loadedAt: '2026-09-01T00:00:00Z' });
    const target = buildScenario('my-x', 'local', { loadedAt: '2026-09-10T00:00:00Z' });
    const draft = buildScenario('deployment-demo', 'local', {
      title: 'Новое название',
      loadedAt: '',
    });
    const result = replaceInLibrary([older, target], 'my-x', draft, '2026-09-16T00:00:00Z');
    expect(result).not.toBeNull();
    expect(result?.saved.id).toBe('my-x');
    expect(result?.saved.loadedAt).toBe('2026-09-16T00:00:00Z');
    expect(result?.items[0]).toBe(result?.saved);
  });

  it('replaceInLibrary с неизвестным id → null', () => {
    const draft = buildScenario('deployment-demo', 'local');
    expect(replaceInLibrary([], 'my-unknown', draft, '2026-09-16T00:00:00Z')).toBeNull();
  });

  it('removeFromLibrary удаляет элемент по id', () => {
    const a = buildScenario('my-a', 'local');
    const b = buildScenario('my-b', 'local');
    expect(removeFromLibrary([a, b], 'my-a')).toEqual([b]);
  });

  it('sortLibrary([old,new,mid]) → [new,mid,old] по loadedAt, новые сверху (SPEC §3.6:204)', () => {
    const oldItem = buildScenario('my-old', 'local', { loadedAt: '2026-09-01T00:00:00Z' });
    const newItem = buildScenario('my-new', 'local', { loadedAt: '2026-09-16T00:00:00Z' });
    const midItem = buildScenario('my-mid', 'local', { loadedAt: '2026-09-10T00:00:00Z' });
    expect(sortLibrary([oldItem, newItem, midItem])).toEqual([newItem, midItem, oldItem]);
  });
});

describe('StoreProvider ↔ library: ТК15 (SPEC §8:411)', () => {
  it('перезагрузка после загрузки: addMine → unmount → новый провайдер на том же хранилище → тот же id сверху', () => {
    const storage = new MemoryStorage();
    const { result, unmount } = renderHook(() => useAppStore(), {
      wrapper: makeWrapper(storage),
    });
    const draft = buildScenario('deployment-demo', 'local', { loadedAt: '' });
    let saved = null as Scenario | null;
    act(() => {
      saved = result.current.commands.addMine(draft);
    });
    expect(saved).not.toBeNull();
    unmount();

    const second = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    expect(second.result.current.state.library.items[0]?.id).toBe(saved?.id);
  });

  it('то же самое на window.localStorage (без пропа storage)', () => {
    const { result, unmount } = renderHook(() => useAppStore(), { wrapper: StoreProvider });
    const draft = buildScenario('deployment-demo', 'local', { loadedAt: '' });
    let saved = null as Scenario | null;
    act(() => {
      saved = result.current.commands.addMine(draft);
    });
    unmount();

    const second = renderHook(() => useAppStore(), { wrapper: StoreProvider });
    expect(second.result.current.state.library.items[0]?.id).toBe(saved?.id);
  });

  it('нечитаемый JSON → «Мои» пусты, ключ удалён', () => {
    const storage = new MemoryStorage();
    storage.setItem(LIBRARY_KEY, '{');
    const { result } = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    expect(result.current.state.library.items).toEqual([]);
    expect(storage.getItem(LIBRARY_KEY)).toBeNull();
  });

  it('один битый элемент из трёх — в состоянии остаются два', () => {
    const a = buildScenario('my-a', 'local');
    const c = buildScenario('my-c', 'local', { loadedAt: '2026-09-01T00:00:00Z' });
    const broken = { ...buildScenario('my-b', 'local'), blocks: [] };
    const storage = storageWith([a, broken, c]);
    const { result } = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    expect(result.current.state.library.items).toHaveLength(2);
  });

  it('хранилище бросает на чтении и записи → монтирование без ошибки, available:false, addMine работает в памяти, после перемонтирования пусто', () => {
    const storage: LibraryStorage = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    const { result, unmount } = renderHook(() => useAppStore(), {
      wrapper: makeWrapper(storage),
    });
    expect(result.current.state.library.available).toBe(false);
    const draft = buildScenario('deployment-demo', 'local', { loadedAt: '' });
    let saved: Scenario | null = null;
    act(() => {
      saved = result.current.commands.addMine(draft);
    });
    expect(saved).not.toBeNull();
    expect(result.current.state.library.items).toHaveLength(1);
    unmount();

    const second = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    expect(second.result.current.state.library.items).toEqual([]);
  });

  it('vi.spyOn(window, "localStorage", "get") бросает → available:false', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { result } = renderHook(() => useAppStore(), { wrapper: StoreProvider });
    expect(result.current.state.library.available).toBe(false);
  });

  it('чтение прошло, но setItem на добавлении бросает SecurityError → элемент в памяти, available становится false', () => {
    const inner = new MemoryStorage();
    const storage: LibraryStorage = {
      getItem: (key) => inner.getItem(key),
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      removeItem: (key) => inner.removeItem(key),
    };
    const { result } = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    expect(result.current.state.library.available).toBe(true);
    const draft = buildScenario('deployment-demo', 'local', { loadedAt: '' });
    act(() => {
      result.current.commands.addMine(draft);
    });
    expect(result.current.state.library.items).toHaveLength(1);
    expect(result.current.state.library.available).toBe(false);
  });
});

describe('StoreProvider ↔ library: ТК32 — QuotaExceededError (SPEC §8:428, §3.6:205)', () => {
  it('addMine при QuotaExceededError → null, список не изменён, тост, хранилище не тронуто, available остаётся true', () => {
    const existing = buildScenario('my-a', 'local');
    const storage = storageWith([existing]);
    const rawBefore = storage.getItem(LIBRARY_KEY);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    const before = result.current.state.library.items;
    const draft = buildScenario('deployment-demo', 'local', { loadedAt: '' });
    let saved: Scenario | null = existing;
    act(() => {
      saved = result.current.commands.addMine(draft);
    });
    expect(saved).toBeNull();
    expect(result.current.state.library.items).toBe(before);
    expect(result.current.state.toast?.message).toBe(ru.library.quotaExceeded);
    expect(storage.getItem(LIBRARY_KEY)).toBe(rawBefore);
    expect(result.current.state.library.available).toBe(true);
  });

  it('replaceMine при QuotaExceededError → null, список не изменён, тост', () => {
    const existing = buildScenario('my-a', 'local');
    const storage = storageWith([existing]);
    const rawBefore = storage.getItem(LIBRARY_KEY);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    const before = result.current.state.library.items;
    const draft = buildScenario('deployment-demo', 'local', { title: 'Новое', loadedAt: '' });
    let replaced: Scenario | null = existing;
    act(() => {
      replaced = result.current.commands.replaceMine('my-a', draft);
    });
    expect(replaced).toBeNull();
    expect(result.current.state.library.items).toBe(before);
    expect(result.current.state.toast?.message).toBe(ru.library.quotaExceeded);
    expect(storage.getItem(LIBRARY_KEY)).toBe(rawBefore);
  });

  it('removeMine при QuotaExceededError → false, список не изменён, тост', () => {
    const existing = buildScenario('my-a', 'local');
    const storage = storageWith([existing]);
    const rawBefore = storage.getItem(LIBRARY_KEY);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    const before = result.current.state.library.items;
    let removed = true;
    act(() => {
      removed = result.current.commands.removeMine('my-a');
    });
    expect(removed).toBe(false);
    expect(result.current.state.library.items).toBe(before);
    expect(result.current.state.toast?.message).toBe(ru.library.quotaExceeded);
    expect(storage.getItem(LIBRARY_KEY)).toBe(rawBefore);
  });

  it('то же через vi.spyOn(Storage.prototype, "setItem") без пропа storage', () => {
    window.localStorage.setItem(
      LIBRARY_KEY,
      JSON.stringify({ schema: 1, items: [buildScenario('my-a', 'local')] }),
    );
    const rawBefore = window.localStorage.getItem(LIBRARY_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useAppStore(), { wrapper: StoreProvider });
    const before = result.current.state.library.items;
    const draft = buildScenario('deployment-demo', 'local', { loadedAt: '' });
    let saved: Scenario | null = null;
    act(() => {
      saved = result.current.commands.addMine(draft);
    });
    expect(saved).toBeNull();
    expect(result.current.state.library.items).toBe(before);
    expect(result.current.state.toast?.message).toBe(ru.library.quotaExceeded);
    expect(window.localStorage.getItem(LIBRARY_KEY)).toBe(rawBefore);
  });
});

describe('StoreCommands.removeMine — прочее', () => {
  it('удаляет элемент из стора и хранилища, возвращает true', () => {
    const a = buildScenario('my-a', 'local');
    const b = buildScenario('my-b', 'local');
    const storage = storageWith([a, b]);
    const { result } = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    let removed = false;
    act(() => {
      removed = result.current.commands.removeMine('my-a');
    });
    expect(removed).toBe(true);
    expect(result.current.state.library.items.map((item) => item.id)).toEqual(['my-b']);
    const raw = JSON.parse(storage.getItem(LIBRARY_KEY) ?? 'null') as {
      items: { id: string }[];
    };
    expect(raw.items.map((item) => item.id)).toEqual(['my-b']);
  });

  it('неизвестный id → false, setItem не вызывается', () => {
    const storage = new MemoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const { result } = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    let removed = true;
    act(() => {
      removed = result.current.commands.removeMine('my-unknown');
    });
    expect(removed).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('SPEC §3.6:207 — активный сценарий и шаг в хранилище не пишутся', () => {
  it('openScenario и selectStep не вызывают setItem библиотеки', () => {
    const storage = new MemoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const { result } = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    const scenario = buildScenario('deployment-demo', 'repo');
    act(() => {
      result.current.dispatch({ type: 'openScenario', scenario });
    });
    act(() => {
      result.current.dispatch({ type: 'selectStep', stepId: '2.1' });
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('addMine пишет ровно с LIBRARY_KEY', () => {
    const storage = new MemoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const { result } = renderHook(() => useAppStore(), { wrapper: makeWrapper(storage) });
    const draft = buildScenario('deployment-demo', 'local', { loadedAt: '' });
    act(() => {
      result.current.commands.addMine(draft);
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0]?.[0]).toBe(LIBRARY_KEY);
  });
});
