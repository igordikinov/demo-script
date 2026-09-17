import { expect, test } from '@playwright/test';

// Шрифт — self-hosted (SPEC §5:358: «без Google Fonts: приложение живёт в
// iframe и не ходит в сеть»). App.tsx рендерит пустой <main/>, поэтому
// smoke.spec.ts не поймает 404 у шрифта — он просто не используется для
// отрисовки текста. Этот тест проверяет сеть и document.fonts напрямую,
// независимо от того, есть ли уже видимый текст на странице (план DN-02,
// правка 10 — «итог e2e меняется с «1 passed» на «2 passed»»).
test('шрифт Open Sans грузится локально, без сетевых запросов на сторону', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('data:')) {
      externalRequests.push(url);
    }
  });

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto('/');

  for (const weight of [400, 600, 700]) {
    await page.evaluate(
      (w: number) => document.fonts.load(`${w} 14px "Open Sans"`, 'Жж Aa'),
      weight,
    );
  }

  const loadedWeights = await page.evaluate(() => {
    const weights = new Set<string>();
    for (const face of Array.from(document.fonts)) {
      if (face.family.replace(/['"]/g, '') === 'Open Sans' && face.status === 'loaded') {
        weights.add(face.weight);
      }
    }
    return Array.from(weights);
  });

  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  for (const weight of ['400', '600', '700']) {
    expect(loadedWeights).toContain(weight);
  }
});
