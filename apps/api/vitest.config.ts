import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // CE compaction cases are CPU-heavy; single thread avoids fork RPC onTaskUpdate timeouts.
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    fileParallelism: false,
    // CE compaction cases can exceed 60s wall time; keep above Vitest worker RPC window.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    teardownTimeout: 30_000,
  },
});
