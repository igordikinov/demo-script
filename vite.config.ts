import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base относительный (SPEC §1, §7; CLAUDE.md «не трогать»): бандл работает
// из подкаталога GitHub Pages и внутри iframe.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // dist/.vite/manifest.json — по нему scripts/size.ts находит стартовый
    // набор чанков (SPEC §8:427).
    manifest: true,
  },
});
