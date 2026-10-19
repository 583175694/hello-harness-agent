import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // CE compaction integration cases are CPU-heavy; avoid parallel files tripping worker RPC timeouts.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
