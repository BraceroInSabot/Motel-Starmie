/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In docker-compose the browser goes through nginx (one origin, Technical Specs 2.3).
// When `npm run dev` runs on the host instead, this proxy keeps the API same-origin.
const backendTarget = process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2023' },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: backendTarget, changeOrigin: false },
      '/ws': { target: backendTarget, ws: true, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/features/**', 'src/shared/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/.gitkeep'],
      // Technical Specs 5.3: front end features/ and shared/ at least 75% (line + branch).
      thresholds: { lines: 75, branches: 75 },
    },
  },
});
