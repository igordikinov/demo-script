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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
}
