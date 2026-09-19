import '@testing-library/jest-dom/vitest';

// StoreProvider грузит общие сценарии при старте, fetch('./scenarios/index.json')
// (SPEC §3.7:230). Без глобальной заглушки тесты, которые не передают свой fetchFn
// пропом (например tests/App.test.tsx), падали бы в jsdom с TypeError при разборе
// относительного URL. Промис специально никогда не разрешается — тестам, которым
// нужен результат, ожидание нужно передавать через проп StoreProvider.fetchFn.
//
// Файлы с `@vitest-environment node` (например tests/reducer.test.ts) этот setup
// тоже выполняют, а в Node нет ни window, ни localStorage — весь блок под guard.
// Полная заглушка MediaQueryList для window.matchMedia (см. ниже, DN-us0):
// добавлять по одному свойству на месте вызова было бы неполно — интерфейс
// требует onchange и все четыре метода подписки/отписки плюс dispatchEvent
// (EventTarget). match — единственное, что меняется между вызовами.
function mql(media: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
}

if (typeof window !== 'undefined') {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    // ProcessMapSection спрашивает matchMedia('(prefers-reduced-motion: reduce)')
    // при раскрытии встроенной карты (SPEC §4.6:311, DN-us0) — jsdom 25 это
    // свойство не определяет вовсе (не «не поддерживает», а отсутствует на
    // window), поэтому без заглушки любой такой рендер падает необработанным
    // исключением. По умолчанию — «уменьшение движения» выключено; отдельные
    // тесты подменяют матчер через vi.stubGlobal('matchMedia', ...) сами.
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => mql(query, false)),
    );
    // localStorage не очищается между тестами одного файла сам по себе (jsdom) —
    // без этого «Мои» из одного теста были бы видны в следующем (SPEC §3.6:201).
    window.localStorage.clear();
    // ScenarioScheme прокручивает активный шаг в видимую область (SPEC §4.3:267)
    // через ref.scrollIntoView в эффекте — jsdom этот метод не реализует вовсе
    // (не «не поддерживает», а не определяет на прототипе), поэтому без заглушки
    // любой рендер экрана сценария падает необработанным исключением (DN-26).
    Element.prototype.scrollIntoView = vi.fn();
    // AppShell сбрасывает прокрутку окна при смене сценария (SPEC §4.1:241,
    // §4.10:358) через window.scrollTo(0, 0) (DN-26) — jsdom scrollTo
    // реализует, но не совершает прокрутку и пишет «Not implemented» в
    // консоль на каждый вызов; заглушка на каждый тест, как и scrollIntoView
    // выше. tests/App.test.tsx проверяет вызовы через vi.mocked(window.scrollTo).
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    Reflect.deleteProperty(window, 'scrollTo');
  });
}
