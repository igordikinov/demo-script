import { statSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

// Не 5173: там обычно живёт dev-сервер process-map, и reuseExistingServer
// молча протестировал бы чужое приложение. --strictPort и проверка title
// в e2e дают явное падение вместо ложного зелёного.
const PORT = 5180;

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
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry' },
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
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
