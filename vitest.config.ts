import { configDefaults, defineConfig } from 'vitest/config';

// Самостоятельный конфиг: без mergeConfig с vite.config.ts и без plugin-react.
// vitest 4 работает на vite 6 проекта (своей копии vite у него нет).
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // e2e/ гоняет Playwright отдельной командой (npm run e2e).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
