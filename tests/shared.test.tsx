// «Общие» сценарии — SPEC §3.7:209-230 (state/shared.ts). fetch передаётся параметром
// (FetchFn), реальных запросов тесты не делают. ТК31 (SPEC §8:427) проверяется на
// уровне состояния через StoreProvider — разделы каталога, текст ошибки и кнопка
// «Повторить» рисует DN-24, здесь они не появляются.
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import {
  buildScenarioIndex,
  toIndexItem,
  type ScenarioIndexItem,
} from '../src/model/scenarioIndex';
import {
  SHARED_INDEX_URL,
  loadSharedIndex,
  loadSharedScenario,
  sharedScenarioUrl,
  type FetchFn,
  type SharedCache,
} from '../src/state/shared';
import { LIBRARY_KEY } from '../src/state/library';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';

// Эталон содержания — tests/fixtures/deployment-demo.json (CLAUDE.md: не придумывать
// содержание сценария).
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

function buildScenario(id: string, source: 'repo' | 'local'): Scenario {
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

/** Элемент индекса (§3.7:222–225) с корректными полями по умолчанию — для it.each поломок. */
function baseItem(overrides: Partial<ScenarioIndexItem> = {}): ScenarioIndexItem {
  return {
    id: 'deployment-demo',
    title: 'Deployment — демо-сценарий',
    module: 'SNP',
    map: 'snp',
    fileName: 'deployment-demo.xlsx',
    loadedAt: '2026-09-16T00:00:00Z',
    blocks: 3,
    steps: 29,
    withLink: 24,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('loadSharedIndex (SPEC §3.7:230, ТК31 — SPEC §8:427)', () => {
  it('404 → отклонение, запрошен относительный путь index.json', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response('not found', { status: 404 }));
    await expect(loadSharedIndex(fetchFn)).rejects.toThrow();
    // Литерал, а не SHARED_INDEX_URL — иначе тест сверяет константу саму с собой
    // и не заметит, если она перестанет совпадать со SPEC §3.7:230.
    expect(fetchFn).toHaveBeenCalledWith('./scenarios/index.json');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fetch отклоняется (ошибка сети) → отклонение', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => {
      throw new TypeError('network');
    });
    await expect(loadSharedIndex(fetchFn)).rejects.toThrow();
  });

  it.each([
    ['schema: 2', { schema: 2, builtAt: '', items: [] }],
    ['элемент с id my-x', { schema: 1, builtAt: '', items: [baseItem({ id: 'my-x' })] }],
    ['элемент со steps: 0', { schema: 1, builtAt: '', items: [baseItem({ steps: 0 })] }],
    ['тело oops', 'oops'],
  ])('ответ 200, но не проходит схему (%s) → отклонение', async (_label, body) => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      typeof body === 'string' ? new Response(body, { status: 200 }) : jsonResponse(body),
    );
    await expect(loadSharedIndex(fetchFn)).rejects.toThrow();
  });

  it('«Мои» работают, пока «Общие» в статусе error (SPEC §3.7:230 — «Мои» работают)', async () => {
    const mine = buildScenario('my-a', 'local');
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify({ schema: 1, items: [mine] }));
    const fetchFn = vi.fn<FetchFn>(async () => new Response('not found', { status: 404 }));
    const { result } = renderHook(() => useAppStore(), {
      wrapper: ({ children }) => <StoreProvider fetchFn={fetchFn}>{children}</StoreProvider>,
    });
    await waitFor(() => expect(result.current.state.shared.status).toBe('error'));
    expect(result.current.state.library.items).toHaveLength(1);
    act(() => {
      result.current.commands.addMine(buildScenario('deployment-demo', 'local'));
    });
    expect(result.current.state.library.items).toHaveLength(2);
  });

  it('«Повторить»: 404 → error, затем loading → ready с валидным индексом (SPEC §3.7:230)', async () => {
    const goodIndex = buildScenarioIndex([toIndexItem(buildScenario('deployment-demo', 'repo'))]);
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(goodIndex));
    const { result } = renderHook(() => useAppStore(), {
      wrapper: ({ children }) => <StoreProvider fetchFn={fetchFn}>{children}</StoreProvider>,
    });
    await waitFor(() => expect(result.current.state.shared.status).toBe('error'));

    act(() => {
      result.current.commands.retryShared();
    });
    expect(result.current.state.shared.status).toBe('loading');

    await waitFor(() => expect(result.current.state.shared.status).toBe('ready'));
    expect(result.current.state.shared.items).toEqual(goodIndex.items);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('пустой items → ready с [] (SPEC §3.7:228)', async () => {
    const emptyIndex = buildScenarioIndex([]);
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(emptyIndex));
    const { result } = renderHook(() => useAppStore(), {
      wrapper: ({ children }) => <StoreProvider fetchFn={fetchFn}>{children}</StoreProvider>,
    });
    await waitFor(() => expect(result.current.state.shared.status).toBe('ready'));
    expect(result.current.state.shared.items).toEqual([]);
  });

  it('отложенный промис — статус остаётся loading, пока fetch не разрешился', async () => {
    let resolveFetch: ((value: Response) => void) | null = null;
    const fetchFn = vi.fn<FetchFn>(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { result } = renderHook(() => useAppStore(), {
      wrapper: ({ children }) => <StoreProvider fetchFn={fetchFn}>{children}</StoreProvider>,
    });
    expect(result.current.state.shared.status).toBe('loading');
    const index = buildScenarioIndex([]);
    await act(async () => {
      resolveFetch?.(jsonResponse(index));
    });
    expect(result.current.state.shared.status).toBe('ready');
  });

  it('обёртка StrictMode → в итоге ready (эффект вызывается дважды)', async () => {
    const index = buildScenarioIndex([toIndexItem(buildScenario('deployment-demo', 'repo'))]);
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(index));

    function Probe() {
      const { state } = useAppStore();
      return <span data-testid="status">{state.shared.status}</span>;
    }

    render(
      <StrictMode>
        <StoreProvider fetchFn={fetchFn}>
          <Probe />
        </StoreProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
  });
});

describe('sharedScenarioUrl', () => {
  it("(id) → './scenarios/<id>.json' (SPEC §3.7:230)", () => {
    expect(sharedScenarioUrl('deployment-demo')).toBe('./scenarios/deployment-demo.json');
  });
});

describe('loadSharedScenario (SPEC §3.7:230)', () => {
  it('первый вызов идёт в ./scenarios/deployment-demo.json, второй берётся из кэша', async () => {
    const scenario = buildScenario('deployment-demo', 'repo');
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(scenario));
    const cache: SharedCache = new Map();
    const first = await loadSharedScenario(fetchFn, 'deployment-demo', cache);
    const second = await loadSharedScenario(fetchFn, 'deployment-demo', cache);
    expect(first).toEqual(scenario);
    expect(second).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // Литерал по SPEC §3.7:230 («fetch('./scenarios/<id>.json') при открытии»),
    // не sharedScenarioUrl(...) — та же причина, что и для index.json выше.
    expect(fetchFn).toHaveBeenCalledWith('./scenarios/deployment-demo.json');
  });

  it('404, затем повтор → неудача не кэшируется, идёт новый запрос', async () => {
    const scenario = buildScenario('deployment-demo', 'repo');
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(scenario));
    const cache: SharedCache = new Map();
    await expect(loadSharedScenario(fetchFn, 'deployment-demo', cache)).rejects.toThrow();
    const second = await loadSharedScenario(fetchFn, 'deployment-demo', cache);
    expect(second).toEqual(scenario);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each(['../index', 'my-x'])(
    'id "%s" не проходит SHARED_ID_RE → отклонение без fetch',
    async (id) => {
      const fetchFn = vi.fn<FetchFn>();
      const cache: SharedCache = new Map();
      await expect(loadSharedScenario(fetchFn, id, cache)).rejects.toThrow();
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it("тело с source: 'local' → отклонение", async () => {
    const bad = { ...buildScenario('deployment-demo', 'repo'), source: 'local' };
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(bad));
    const cache: SharedCache = new Map();
    await expect(loadSharedScenario(fetchFn, 'deployment-demo', cache)).rejects.toThrow();
  });

  it('тело с другим id → отклонение (id ответа должен совпадать с запрошенным)', async () => {
    const other = buildScenario('other-id', 'repo');
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse(other));
    const cache: SharedCache = new Map();
    await expect(loadSharedScenario(fetchFn, 'deployment-demo', cache)).rejects.toThrow();
  });
});

describe('StoreCommands.openShared (SPEC §4.7:320)', () => {
  it("('deployment-demo', '2.5') → true, сценарий и шаг 2.5 в состоянии", async () => {
    const scenario = buildScenario('deployment-demo', 'repo');
    const fetchFn = vi.fn<FetchFn>(async (url) =>
      url === SHARED_INDEX_URL
        ? jsonResponse(buildScenarioIndex([toIndexItem(scenario)]))
        : jsonResponse(scenario),
    );
    const { result } = renderHook(() => useAppStore(), {
      wrapper: ({ children }) => <StoreProvider fetchFn={fetchFn}>{children}</StoreProvider>,
    });
    let opened = false;
    await act(async () => {
      opened = await result.current.commands.openShared('deployment-demo', '2.5');
    });
    expect(opened).toBe(true);
    expect(result.current.state.scenario?.id).toBe('deployment-demo');
    expect(result.current.state.stepId).toBe('2.5');
  });

  it('404 → false, scenario остаётся null, тоста нет', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response('not found', { status: 404 }));
    const { result } = renderHook(() => useAppStore(), {
      wrapper: ({ children }) => <StoreProvider fetchFn={fetchFn}>{children}</StoreProvider>,
    });
    let opened = true;
    await act(async () => {
      opened = await result.current.commands.openShared('deployment-demo');
    });
    expect(opened).toBe(false);
    expect(result.current.state.scenario).toBeNull();
    expect(result.current.state.toast).toBeNull();
  });
});
