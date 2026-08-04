import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4317,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4318',
      '/healthz': 'http://127.0.0.1:4318',
      '/readyz': 'http://127.0.0.1:4318',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4317,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4318',
      '/healthz': 'http://127.0.0.1:4318',
      '/readyz': 'http://127.0.0.1:4318',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
