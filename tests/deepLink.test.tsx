// Адрес `?scenario=&step=` — SPEC §4.7 (:318-325), hooks/useStepDeepLink.ts
// (путь — §2:52; DN-16). Дословные ТК — SPEC §8:410 (ТК 14) и §8:426 (ТК 30);
// адресная часть ТК 27 (§8:423) — tests/import.test.tsx. Остальные случаи здесь
// (событие `storage`, StrictMode, гонки) заголовков ТК в SPEC не имеют —
// заголовки ссылаются на §4.7:3xx или на этот файл напрямую.
//
// Приём (buildScenario, jsonResponse) — копия tests/shared.test.tsx: общий
// модуль не заводим (риск мёржа с параллельными задачами). tests/setup.ts
// сбрасывает адрес перед каждым тестом (`history.replaceState(null, '', '/')`) —
// без этого адрес одного теста был бы виден следующему в этом файле.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppShell } from '../src/App';
import { StoreProvider } from '../src/state/store';
import { useAppStore } from '../src/state/context';
import { stepPosition } from '../src/state/reducer';
import { ScenarioSchema, type Scenario } from '../src/model/schema';
import { buildScenarioIndex, toIndexItem } from '../src/model/scenarioIndex';
import { LIBRARY_KEY } from '../src/state/library';
import type { FetchFn } from '../src/state/shared';
import { ru } from '../src/i18n/ru';
import { appBanner } from './helpers';

// Эталон содержания — tests/fixtures/deployment-demo.json (CLAUDE.md: не
// придумывать содержание сценария).
const importMetaUrl = import.meta.url;
const fixturePath = fileURLToPath(new URL('./fixtures/deployment-demo.json', importMetaUrl));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  title: string;
  module: string;
  map: string;
  blocks: { title: string; steps: { id: string; title: string }[] }[];
};
const allSteps = fixture.blocks.flatMap((block) => block.steps);

/** Заголовок шага по номеру — из фикстуры, а не придуман. */
function stepTitle(stepId: string): string {
  const step = allSteps.find((candidate) => candidate.id === stepId);
  if (step === undefined) {
    throw new Error(`фикстура не знает шаг ${stepId}`);
  }
  return step.title;
}

/** Копия приёма tests/shared.test.tsx:43-61 — общий хелпер не заводим (риск мёржа). */
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const SHARED = buildScenario('deployment-demo', 'repo');
const SHARED_INDEX = buildScenarioIndex([toIndexItem(SHARED)]);

/** index.json и deployment-demo.json как у настоящего репозитория; иначе 404. */
function defaultFetch() {
  return vi.fn<FetchFn>(async (url) => {
    if (url === './scenarios/index.json') return jsonResponse(SHARED_INDEX);
    if (url === './scenarios/deployment-demo.json') return jsonResponse(SHARED);
    return new Response('not found', { status: 404 });
  });
}

function seedLibrary(items: readonly Scenario[]): void {
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify({ schema: 1, items }));
}

interface ProbeSnapshot {
  scenarioId: string | null;
  stepId: string | null;
  toastMessage: string | null;
  toastSeq: number | null;
  libraryIds: string[];
}

/** Зонд состояния — сценарий, шаг, тост (текст и seq — от повтора того же текста) и «Мои». */
function Probe() {
  const { state } = useAppStore();
  const snapshot: ProbeSnapshot = {
    scenarioId: state.scenario?.id ?? null,
    stepId: state.stepId,
    toastMessage: state.toast?.message ?? null,
    toastSeq: state.toast?.seq ?? null,
    libraryIds: state.library.items.map((item) => item.id),
  };
  return <pre data-testid="probe">{JSON.stringify(snapshot)}</pre>;
}

function probe(): ProbeSnapshot {
  return JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as ProbeSnapshot;
}

/** Стартовый адрес до монтирования — разбирается один раз при старте (§4.7:325). */
function setAddress(path: string, state: unknown = null): void {
  window.history.replaceState(state, '', path);
}

function mount(opts: { fetchFn: FetchFn; strict?: boolean }): ReturnType<typeof render> {
  const children = (
    <StoreProvider fetchFn={opts.fetchFn}>
      <AppShell />
      <Probe />
    </StoreProvider>
  );
  return render(opts.strict === true ? <StrictMode>{children}</StrictMode> : children);
}

function schemeStepButton(stepId: string): HTMLElement {
  const scheme = screen.getByRole('region', { name: ru.scheme.title });
  const button = scheme.querySelector(`[data-step-id="${stepId}"]`);
  if (button === null) {
    throw new Error(`в схеме нет шага ${stepId}`);
  }
  return button as HTMLElement;
}

function storageEvent(key: string | null, newValue: string | null): StorageEvent {
  return new StorageEvent('storage', { key, newValue, storageArea: window.localStorage });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ТК 14 — SPEC §8:410', () => {
  it('?scenario=deployment-demo&step=2.5 → карточка 2.5, запрошен файл сценария', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=deployment-demo&step=2.5');
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: stepTitle('2.5') });
    const position = stepPosition(SHARED, '2.5');
    if (position === null) throw new Error('нет позиции шага 2.5');
    expect(
      screen.getByText(ru.card.position(position.blockN, position.k, position.m)),
    ).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith('./scenarios/deployment-demo.json');
  });

  it.each([
    ['несуществующий step', '&step=9.9'],
    ['пустой step', '&step='],
    ['step отсутствует', ''],
  ])('%s → первый шаг, в адресе step=1.1 (SPEC §4.7:322-323)', async (_label, stepParam) => {
    const fetchFn = defaultFetch();
    setAddress(`/?scenario=deployment-demo${stepParam}`);
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: stepTitle('1.1') });
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('step')).toBe('1.1'));
  });

  it('› , ArrowRight и клик по схеме меняют step через replaceState; pushState не вызывается, history.length не растёт (§4.7:323-324)', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=deployment-demo&step=2.5');
    mount({ fetchFn });
    await screen.findByRole('heading', { level: 1, name: stepTitle('2.5') });

    const len = window.history.length;
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    fireEvent.click(screen.getByRole('button', { name: ru.card.nextStep }));
    await screen.findByRole('heading', { level: 1, name: stepTitle('2.6') });
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('step')).toBe('2.6'));

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await screen.findByRole('heading', { level: 1, name: stepTitle('2.7') });
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('step')).toBe('2.7'));

    fireEvent.click(schemeStepButton('3.1'));
    await screen.findByRole('heading', { level: 1, name: stepTitle('3.1') });
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('step')).toBe('3.1'));

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();
    const lastCall = replaceSpy.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe(window.history.state);
    expect(lastCall?.[1]).toBe('');
    expect(String(lastCall?.[2])).toContain('step=3.1');
    expect(window.history.length).toBe(len);
  });
});

describe('ТК 30 — SPEC §8:426', () => {
  it('?scenario=unknown → каталог, тост «не найден», scenario убран из адреса', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=unknown');
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(ru.deepLink.notFoundShared('unknown')),
    );
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('?scenario=my-x&step=1.1, «Мои» пусты → тост про другой браузер, а не про общий; файла my-x не запрашивали', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=my-x&step=1.1');
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(ru.deepLink.notFoundLocal('my-x')),
    );
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(fetchFn).not.toHaveBeenCalledWith('./scenarios/my-x.json');
  });

  it('«‹ Сценарии» → каталог, scenario и step убраны, pushState не вызывается, history.length не растёт', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=deployment-demo&step=2.5');
    mount({ fetchFn });
    await screen.findByRole('heading', { level: 1, name: stepTitle('2.5') });

    const len = window.history.length;
    const pushSpy = vi.spyOn(window.history, 'pushState');

    fireEvent.click(screen.getByRole('button', { name: ru.header.back }));
    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.history.length).toBe(len);
  });
});

describe('Прочие параметры адреса (SPEC §4.7:324)', () => {
  it('путь, hash и посторонний параметр сохраняются; history.state цел', async () => {
    const fetchFn = defaultFetch();
    setAddress('/sub/dir/?foo=1&scenario=deployment-demo&step=2.5#top', { keep: 1 });
    mount({ fetchFn });
    await screen.findByRole('heading', { level: 1, name: stepTitle('2.5') });

    fireEvent.click(screen.getByRole('button', { name: ru.card.nextStep }));
    await screen.findByRole('heading', { level: 1, name: stepTitle('2.6') });
    await waitFor(() =>
      expect(window.location.href).toBe(
        'http://localhost:3000/sub/dir/?foo=1&scenario=deployment-demo&step=2.6#top',
      ),
    );
    expect(window.history.state).toEqual({ keep: 1 });

    fireEvent.click(screen.getByRole('button', { name: ru.header.back }));
    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await waitFor(() =>
      expect(window.location.href).toBe('http://localhost:3000/sub/dir/?foo=1#top'),
    );
  });

  it('в каталоге посторонние параметры не трогаются, replaceState не вызывается (URLSearchParams перекодирует "a b"→"a+b"; SPEC §4.7:324)', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?embed&foo=a%20b');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith('./scenarios/index.json'));
    expect(window.location.search).toBe('?embed&foo=a%20b');
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('?scenario=&step=2.5 — пустой scenario считается отсутствующим: каталог, тоста нет, адрес очищен', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=&step=2.5');
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    expect(probe().toastMessage).toBeNull();
    await waitFor(() => expect(window.location.search).toBe(''));
  });
});

describe('«Мой» сценарий по адресу (SPEC §4.7:320)', () => {
  it('открывается из библиотеки на заданном шаге, без запроса файла, с Tag «мой»', async () => {
    const local = buildScenario('my-deployment-demo', 'local');
    seedLibrary([local]);
    const fetchFn = defaultFetch();
    setAddress('/?scenario=my-deployment-demo&step=3.7');
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: stepTitle('3.7') });
    // getByRole('banner') находит два <header> (шапка и заголовок StepCard
    // внутри <article>) — tests/helpers.ts:5-13, tests/App.test.tsx и др.
    expect(within(appBanner()).getByText(ru.header.tagLocal)).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalledWith('./scenarios/my-deployment-demo.json');
  });
});

describe('Открытие из каталога обновляет адрес (SPEC §4.7:323)', () => {
  it('клик по общему → ?scenario=deployment-demo&step=1.1, затем «‹ Сценарии», затем клик по «моему» → ?scenario=my-…&step=1.1', async () => {
    const local = buildScenario('my-deployment-demo', 'local');
    seedLibrary([local]);
    const fetchFn = defaultFetch();
    setAddress('/');
    mount({ fetchFn });

    const shared = screen.getByRole('region', { name: ru.catalog.sharedTitle });
    fireEvent.click(await within(shared).findByRole('button', { name: SHARED.title }));
    await screen.findByRole('heading', { level: 1, name: stepTitle('1.1') });
    await waitFor(() => expect(window.location.search).toBe('?scenario=deployment-demo&step=1.1'));

    fireEvent.click(screen.getByRole('button', { name: ru.header.back }));
    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });

    const local1 = screen.getByRole('region', { name: ru.catalog.localTitle });
    fireEvent.click(within(local1).getByRole('button', { name: local.title }));
    await screen.findByRole('heading', { level: 1, name: stepTitle('1.1') });
    await waitFor(() =>
      expect(window.location.search).toBe('?scenario=my-deployment-demo&step=1.1'),
    );
  });
});

describe('Неудача openShared по адресу (SPEC §4.7:321)', () => {
  it.each<[string, () => Promise<Response> | Response]>([
    ['404', () => new Response('not found', { status: 404 })],
    ['200 с чужим id', () => jsonResponse(buildScenario('other', 'repo'))],
    ['200 не по схеме', () => jsonResponse({ oops: true })],
    [
      'fetch отклонён',
      () => {
        throw new TypeError('network');
      },
    ],
  ])('%s → тост «не найден», каталог, адрес очищен', async (_label, scenarioResponse) => {
    const fetchFn = vi.fn<FetchFn>(async (url) => {
      if (url === './scenarios/index.json') return jsonResponse(SHARED_INDEX);
      if (url === './scenarios/deployment-demo.json') return scenarioResponse();
      return new Response('not found', { status: 404 });
    });
    setAddress('/?scenario=deployment-demo');
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        ru.deepLink.notFoundShared('deployment-demo'),
      ),
    );
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('недопустимый id "Bad_Id" (не проходит SHARED_ID_RE, не начинается с my-) → тост без запроса файла', async () => {
    const fetchFn = vi.fn<FetchFn>(async (url) => {
      if (url === './scenarios/index.json') return jsonResponse(SHARED_INDEX);
      return new Response('not found', { status: 404 });
    });
    setAddress('/?scenario=Bad_Id');
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(ru.deepLink.notFoundShared('Bad_Id')),
    );
    expect(fetchFn).not.toHaveBeenCalledWith('./scenarios/Bad_Id.json');
  });
});

describe('Адрес цел, пока грузится файл общего по адресу (SPEC §3.7:230, §4.7:320)', () => {
  it('до ответа — каталог виден, адрес прежний, replaceState не вызывался; после ответа — карточка', async () => {
    let resolveScenario: ((value: Response) => void) | null = null;
    const fetchFn = vi.fn<FetchFn>(async (url) => {
      if (url === './scenarios/index.json') return jsonResponse(SHARED_INDEX);
      if (url === './scenarios/deployment-demo.json') {
        return new Promise<Response>((resolve) => {
          resolveScenario = resolve;
        });
      }
      return new Response('not found', { status: 404 });
    });
    setAddress('/?scenario=deployment-demo&step=2.5');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    expect(window.location.search).toBe('?scenario=deployment-demo&step=2.5');
    expect(replaceSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveScenario?.(jsonResponse(SHARED));
    });
    await screen.findByRole('heading', { level: 1, name: stepTitle('2.5') });
    expect(window.location.search).toBe('?scenario=deployment-demo&step=2.5');
  });
});

describe('Разбор адреса ровно один раз', () => {
  it('после «‹ Сценарии» файл сценария не запрашивается повторно', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=deployment-demo&step=1.1');
    mount({ fetchFn });
    await screen.findByRole('heading', { level: 1, name: stepTitle('1.1') });

    fireEvent.click(screen.getByRole('button', { name: ru.header.back }));
    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const calls = fetchFn.mock.calls.filter(([url]) => url === './scenarios/deployment-demo.json');
    expect(calls).toHaveLength(1);
  });

  it('событие storage после «не найден» по my-x не открывает сценарий повторно (toast.seq не растёт)', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=my-x');
    mount({ fetchFn });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await waitFor(() => expect(probe().toastSeq).toBe(1));

    const myX = buildScenario('my-x', 'local');
    seedLibrary([myX]);
    act(() => {
      window.dispatchEvent(storageEvent(LIBRARY_KEY, window.localStorage.getItem(LIBRARY_KEY)));
    });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    expect(probe().toastSeq).toBe(1);
  });
});

describe('StrictMode — двойной эффект (SPEC §4.7:325)', () => {
  it('?scenario=unknown → тост показан один раз, адрес очищен', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=unknown');
    mount({ fetchFn, strict: true });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await waitFor(() => expect(probe().toastSeq).toBe(1));
    expect(window.location.search).toBe('');
  });

  it('?scenario=deployment-demo&step=2.5, затем › → step=2.6 в адресе', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=deployment-demo&step=2.5');
    mount({ fetchFn, strict: true });
    await screen.findByRole('heading', { level: 1, name: stepTitle('2.5') });

    fireEvent.click(screen.getByRole('button', { name: ru.card.nextStep }));
    await screen.findByRole('heading', { level: 1, name: stepTitle('2.6') });
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('step')).toBe('2.6'));
  });
});

describe('Событие storage — «Мои» изменены в другой вкладке (SPEC §4.7:323)', () => {
  it('открытый «мой» удалён → каталог, адрес очищен, «Мои» в сторе пусты', async () => {
    const local = buildScenario('my-deployment-demo', 'local');
    seedLibrary([local]);
    const fetchFn = defaultFetch();
    setAddress('/?scenario=my-deployment-demo&step=1.1');
    mount({ fetchFn });
    await screen.findByRole('heading', { level: 1, name: stepTitle('1.1') });

    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify({ schema: 1, items: [] }));
    act(() => {
      window.dispatchEvent(storageEvent(LIBRARY_KEY, JSON.stringify({ schema: 1, items: [] })));
    });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(probe().libraryIds).toEqual([]);
  });

  it('открыт общий сценарий: «Мои» обновляются, сценарий остаётся открытым', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=deployment-demo&step=1.1');
    mount({ fetchFn });
    await screen.findByRole('heading', { level: 1, name: stepTitle('1.1') });

    const myX = buildScenario('my-x', 'local');
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify({ schema: 1, items: [myX] }));
    act(() => {
      window.dispatchEvent(storageEvent(LIBRARY_KEY, window.localStorage.getItem(LIBRARY_KEY)));
    });

    await waitFor(() => expect(probe().libraryIds).toEqual(['my-x']));
    expect(screen.getByRole('heading', { level: 1, name: stepTitle('1.1') })).toBeInTheDocument();
  });

  it('другой ключ localStorage — событие ничего не меняет', async () => {
    const fetchFn = defaultFetch();
    setAddress('/?scenario=deployment-demo&step=1.1');
    mount({ fetchFn });
    await screen.findByRole('heading', { level: 1, name: stepTitle('1.1') });

    window.localStorage.setItem(
      LIBRARY_KEY,
      JSON.stringify({ schema: 1, items: [buildScenario('my-x', 'local')] }),
    );
    act(() => {
      window.dispatchEvent(storageEvent('other', 'x'));
    });

    expect(probe().libraryIds).toEqual([]);
    expect(screen.getByRole('heading', { level: 1, name: stepTitle('1.1') })).toBeInTheDocument();
  });

  it('key: null (localStorage.clear() в другой вкладке) → открытый «мой» закрывается, каталог', async () => {
    const local = buildScenario('my-deployment-demo', 'local');
    seedLibrary([local]);
    const fetchFn = defaultFetch();
    setAddress('/?scenario=my-deployment-demo&step=1.1');
    mount({ fetchFn });
    await screen.findByRole('heading', { level: 1, name: stepTitle('1.1') });

    window.localStorage.clear();
    act(() => {
      window.dispatchEvent(storageEvent(null, null));
    });

    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });
  });

  it('слушатель снимается при размонтировании: removeEventListener получает тот же обработчик, что и addEventListener', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const fetchFn = defaultFetch();
    setAddress('/');
    const { unmount } = mount({ fetchFn });
    await screen.findByRole('heading', { level: 1, name: ru.catalog.title });

    const addCall = addSpy.mock.calls.find(([type]) => type === 'storage');
    if (addCall === undefined) throw new Error('addEventListener("storage", …) не вызван');
    unmount();
    const removeCall = removeSpy.mock.calls.find(([type]) => type === 'storage');
    expect(removeCall?.[1]).toBe(addCall[1]);
  });
});
