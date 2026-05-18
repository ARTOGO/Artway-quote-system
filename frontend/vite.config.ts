// Vite 8 config — production build + dev server.
//
// Vitest config lives separately in vitest.config.ts so unit tests don't
// accidentally inherit dev-server plugin behaviour.
//
// Build output: dist/ — the Go backend will embed this via embed.FS in
// Phase A. Public assets (public/logo/) are auto-copied to dist/.

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],

  // /public/* (logo/) → root / in build output
  publicDir: 'public',

  server: {
    port: 5173,
    strictPort: true, // fail loud if port busy (CI / dev consistency)
    host: '127.0.0.1',
    open: false,
  },

  // pnpm preview — serves built dist/ at port 4173
  preview: {
    port: 4173,
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022', // 對齊 tsconfig.app.json target
    chunkSizeWarningLimit: 600, // SPEC §6 quotes 可達 500KB body
  },
});
