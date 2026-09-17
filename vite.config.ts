import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base относительный (SPEC §1, §7; CLAUDE.md «не трогать»): бандл работает
// из подкаталога GitHub Pages и внутри iframe.
export default defineConfig({
  base: './',
  plugins: [react()],
});
