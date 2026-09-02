import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // sim-core и адаптеры — чистая логика, браузер не нужен.
    environment: 'node',
    include: ['packages/**/*.test.ts', 'components/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@prompower/sim-core': new URL('./packages/sim-core/src/index.ts', import.meta.url).pathname,
    },
  },
});
