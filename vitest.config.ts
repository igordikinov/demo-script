import { configDefaults, defineConfig } from 'vitest/config';

// Самостоятельный конфиг: vitest 2 работает на своём vite 5, поэтому без
// mergeConfig с vite.config.ts и без plugin-react.
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
