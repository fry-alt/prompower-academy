import { expect, test } from '@playwright/test';

/**
 * Урок с заданием: кнопки, подсветка текущей инструкции и вердикт автопроверки.
 *
 * Логика прогона проверена unit-тестами в sim-core, здесь проверяется другое —
 * что интерфейс действительно на ней ездит: подсветка идёт от интерпретатора,
 * а вердикт приходит от настоящего валидатора, а не нарисован.
 */

const LESSON = '/ru/lesson/instrument-i-zahvat';

test.beforeEach(async ({ page }) => {
  await page.goto(LESSON);
  await expect(page.locator('canvas')).toBeVisible();
});

test('задание открывается со сценой и программой', async ({ page }) => {
  await expect(page.getByText('Переставить «деталь» в «зона B»')).toBeVisible();
  await expect(page.getByTestId('program-line')).toHaveCount(10);
  await expect(page.getByTestId('load-failure')).toHaveCount(0);
});

test('до запуска вердикта нет', async ({ page }) => {
  await expect(page.getByTestId('verdict')).toHaveCount(0);
});

test('шаг подсвечивает следующую инструкцию', async ({ page }) => {
  const current = page.locator('[data-current="true"]');
  await expect(current).toContainText('Подойти к детали сверху');

  await page.getByTestId('step').click();
  await expect(current).toContainText('По осям');
});

test('прогон доводит задание до зачёта', async ({ page }) => {
  await page.getByTestId('play').click();

  await expect(page.getByTestId('verdict')).toContainText('Задание выполнено', {
    timeout: 60_000,
  });
});

test('сброс возвращает программу в начало', async ({ page }) => {
  await page.getByTestId('step').click();
  await page.getByTestId('step').click();

  await page.getByTestId('reset').click();

  await expect(page.locator('[data-current="true"]')).toContainText('Подойти к детали сверху');
  await expect(page.getByTestId('verdict')).toHaveCount(0);
});

test('скорость переключается и прогон всё равно доходит до конца', async ({ page }) => {
  await page.getByTestId('speed').selectOption('4');
  await page.getByTestId('play').click();

  await expect(page.getByTestId('verdict')).toContainText('Задание выполнено', {
    timeout: 60_000,
  });
});
