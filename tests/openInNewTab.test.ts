// src/components/ui/openInNewTab.ts — общий помощник «Открыть в новой вкладке»
// (SPEC §4.6:316, §4.9:354, DN-cx3): window.open(url, '_blank') без 'noopener'
// (с ним window.open всегда возвращает null, и блокировку было бы не отличить
// от обычного открытия), opener у открытой вкладки обнуляется вручную;
// null в ответ (заблокировано) → false, решение о тосте — у вызывающего.
// jsdom не реализует window.open — подменяется в каждом тесте (см. DN-12).
import { openInNewTab } from '../src/components/ui/openInNewTab';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openInNewTab', () => {
  it("вкладка открылась — window.open вызван ровно с (url, '_blank'), opener обнулён, возвращает true", () => {
    // opener стартует непустым: обнуление после open() должно быть видно явно
    // (тот же приём, что и в tests/StepCard.test.tsx, DN-976).
    const tab = { opener: window } as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(tab);

    expect(openInNewTab('https://example.com/a')).toBe(true);

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/a', '_blank');
    expect(tab.opener).toBeNull();
  });

  it('window.open вернул null (заблокировано) — возвращает false, без исключения', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    let result: boolean | undefined;
    expect(() => {
      result = openInNewTab('https://example.com/b');
    }).not.toThrow();

    expect(openSpy).toHaveBeenCalledWith('https://example.com/b', '_blank');
    expect(result).toBe(false);
  });
});
