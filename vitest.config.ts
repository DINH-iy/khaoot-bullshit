import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/**/test/**/*.test.ts', 'packages/**/test/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
    restoreMocks: true,
    testTimeout: 10000,
  },
});
