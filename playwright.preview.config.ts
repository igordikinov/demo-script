import { statSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Отдельный конфиг под замер первой отрисовки (SPEC §8:431, DN-18). Основной
// playwright.config.ts поднимает `npm run dev`: там неминифицированный React и
// модули по одному запросу — мерить по нему «< 1 с» бессмысленно. Здесь
// Playwright поднимает `vite preview` на собранном dist/.
//
// Изоляция от основного набора: testDir у конфигов — соседние папки (./e2e и
// ./e2e-preview, не вложенные), `npm run e2e` зовёт playwright test без
// --config и всегда берёт playwright.config.ts. Ни testIgnore, ни правок
// основного конфига не нужно.
const isCI = Boolean(process.env.CI);

// 5180 занят основным конфигом (playwright.config.ts:9). Оба сервера со
// --strictPort: совпадение портов было бы громким падением, а не молчаливым
// прогоном по чужому приложению.
const PORT = 5181;

// Браузер песочницы (CLAUDE.md). Берём его, только если файл существует;
// иначе — штатный браузер Playwright.
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';

function sandboxChromium(): string | undefined {
  try {
    return statSync(SANDBOX_CHROMIUM).isFile() ? SANDBOX_CHROMIUM : undefined;
  } catch {
    return undefined;
  }
}

const executablePath = sandboxChromium();

export default defineConfig({
  testDir: './e2e-preview',
  // Замер времени: параллельные воркеры на двухъядерном раннере соревнуются за
  // процессор и разгоняют FCP соседнего теста.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // trace и video выключены намеренно (в основном конфиге trace:
  // 'on-first-retry'): запись трассировки завышает время отрисовки, и «красный
  // только на второй попытке» выглядел бы необъяснимо.
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off', video: 'off' },
  // Не дефолтный test-results: Playwright чистит outputDir в начале прогона, а
  // e2e/visual.spec.ts:36 кладёт снимки visual-QA в test-results/visual.
  // Подкаталог внутри test-results уже покрыт .gitignore и .prettierignore.
  outputDir: 'test-results/preview',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    // vite preview раздаёт готовый dist/ — сборка должна быть сделана заранее
    // (в CI это шаг `npm run build` job'а firstpaint, SPEC §7:391).
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
