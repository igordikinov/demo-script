import '@testing-library/jest-dom/vitest';

// StoreProvider грузит общие сценарии при старте, fetch('./scenarios/index.json')
// (SPEC §3.7:230). Без глобальной заглушки тесты, которые не передают свой fetchFn
// пропом (например tests/App.test.tsx), падали бы в jsdom с TypeError при разборе
// относительного URL. Промис специально никогда не разрешается — тестам, которым
// нужен результат, ожидание нужно передавать через проп StoreProvider.fetchFn.
//
// Файлы с `@vitest-environment node` (например tests/reducer.test.ts) этот setup
// тоже выполняют, а в Node нет ни window, ни localStorage — весь блок под guard.
if (typeof window !== 'undefined') {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
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
