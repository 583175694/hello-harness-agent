import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { apiProxyGuardPlugin } from './vite-api-proxy-guard';

const apiTarget = `http://127.0.0.1:${process.env.API_PORT ?? '4318'}`;

export default defineConfig({
  define: {
    'import.meta.env.DEV': JSON.stringify(process.env.NODE_ENV !== 'production'),
    'import.meta.env.VITEST': 'true',
  },
  plugins: [apiProxyGuardPlugin(), react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 4317,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
      '/healthz': apiTarget,
      '/readyz': apiTarget,
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4317,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
      '/healthz': apiTarget,
      '/readyz': apiTarget,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: [...configDefaults.exclude],
    // R1 shell cases in app.test.tsx often exceed 5s under full pnpm check load
    testTimeout: 10_000,
  },
});
