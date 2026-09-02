import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Пути к пакетам воркспейса разворачиваются через `fileURLToPath`, а не через
 * `URL.pathname`: на Windows последний даёт `/C:/Users/Zhuk%20Andrey/...` — с
 * ведущим слэшем и экранированным пробелом, и такой путь не резолвится.
 */
const resolvePackage = (relative: string): string =>
  fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  test: {
    // sim-core и адаптеры — чистая логика, браузер не нужен.
    environment: 'node',
    include: ['packages/**/*.test.ts', 'components/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@prompower/sim-core': resolvePackage('./packages/sim-core/src/index.ts'),
      '@prompower/robot-plugins': resolvePackage('./packages/robot-plugins/index.ts'),
    },
  },
});
