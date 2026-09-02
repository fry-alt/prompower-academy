import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Один поток намеренно: каждая проверка поднимает контекст WebGL с моделью на
  // сотню тысяч треугольников, а в CI рендер программный. Два таких контекста
  // одновременно валят вкладку, и падения выглядят как флаки в коде.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Программный WebGL: сцена должна рендериться и без GPU в CI.
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/ru/sandbox/jaka-zu7',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
