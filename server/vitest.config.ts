import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    // One shared in-memory MongoDB per run; parallel files would fight over it.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    restoreMocks: true,
    include: ['tests/**/*.test.ts'],
  },
});
