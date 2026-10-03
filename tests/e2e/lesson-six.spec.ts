import { expect, test } from '@playwright/test';

/**
 * Урок 6: итоговое задание.
 *
 * Сборка цикла руками здесь не воспроизводится — она проверена прогоном
 * эталонной программы без браузера. Проверяется проводка: в палитре есть
 * переменные, стартовая программа запускается, а вердикт честно называет
 * детали, которые остались на месте.
 */

const LESSON = '/ru/lesson/polnyj-cikl';

test.beforeEach(async ({ page }) => {
  await page.goto(LESSON);
  await page.getByTestId('theory-start').click();
  await page.getByTestId('tour-skip').click();
  await expect(page.locator('[data-testid="block-editor"] svg.blocklySvg')).toBeVisible({
    timeout: 30_000,
  });
});

test('в палитре есть переменные и вычисляемое движение', async ({ page }) => {
  await page.locator('[data-category="Переменные"]').click({ force: true });
  await expect(page.locator('.blocklyFlyout .pp_set_var')).toBeVisible();

  await page.locator('[data-category="Движение"]').click({ force: true });
  await expect(page.locator('.blocklyFlyout .pp_move_computed')).toBeVisible();
});

test('задание объявляет три цели', async ({ page }) => {
  await expect(page.getByText('Переставить «деталь 1» в «ячейка 1»')).toBeVisible();
  await expect(page.getByText('Переставить «деталь 3» в «ячейка 3»')).toBeVisible();
});

test('стартовая программа кладёт одну деталь и честно говорит про остальные', async ({ page }) => {
  await page.getByTestId('speed').selectOption('4');
  await page.getByTestId('play').click();

  await expect(page.getByTestId('verdict')).toContainText('Задание не выполнено', {
    timeout: 120_000,
  });
  await expect(page.getByTestId('verdict')).toContainText('деталь 2');
  await expect(page.getByTestId('verdict')).not.toContainText('деталь 1');
});
