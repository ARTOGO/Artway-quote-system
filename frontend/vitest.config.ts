// Vitest config — kept separate from vite.config.ts (added in M6) so unit
// tests don't accidentally depend on Vite dev-server plugin behaviour.
//
// happy-dom (not jsdom) — measurably faster startup, sufficient for React
// Testing Library. Switch to jsdom only if a test needs full browser API.

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: false, // explicit import { describe, it, expect } from 'vitest'
    setupFiles: ['./src/test/setup.ts'],
    css: false, // unit tests don't need SCSS transform (CSS Module just returns class names)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.config.*', '**/test/**', '**/*.d.ts', 'dist/**'],
    },
  },
});
