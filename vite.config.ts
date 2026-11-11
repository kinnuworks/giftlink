import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  optimizeDeps: { exclude: ['@nimiq/core'] },
  build: { target: 'esnext', sourcemap: true },
  worker: { format: 'es', plugins: () => [wasm()] },
  server: { host: true, port: 5173 },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
