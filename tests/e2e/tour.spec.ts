import { expect, test } from '@playwright/test';

/**
 * Обучение с подсветкой.
 *
 * Проверяется главное свойство: шаг закрывается настоящим действием, а не
 * кнопкой «Дальше». Поэтому тест нажимает ровно то, на что указывает подсветка,
 * и смотрит, что текст шага сменился.
 */

const LESSON = '/ru/lesson/pervoe-dvizhenie';

test('подсветка ведёт по шагам и закрывается насовсем', async ({ page }) => {
  await page.goto(LESSON);

  await expect(page.getByTestId('tour')).toBeVisible();
  await expect(page.getByTestId('tour-text')).toContainText('переходите к заданию');

  // Первый шаг закрывается нажатием подсвеченной кнопки.
  await page.getByTestId('theory-start').click();
  await expect(page.locator('[data-testid="block-editor"] svg.blocklySvg')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('tour-text')).toContainText('Откройте «Движение»');

  // Второй — нажатием категории палитры: клик по ней Blockly до нас не пускает,
  // поэтому подсветка слушает погружение.
  await page.locator('[data-category="Движение"]').click({ force: true });
  await expect(page.getByTestId('tour-text')).toContainText('Перетащите');

  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('tour')).toHaveCount(0);
  // Обучение не потеряно: его возвращает кнопка в шапке.
  await expect(page.getByTestId('tour-restart')).toBeVisible();
});

test('урок без сценария обучения ничего не подсвечивает', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');

  await expect(page.getByTestId('theory-start')).toBeVisible();
  await expect(page.getByTestId('tour')).toHaveCount(0);
  await expect(page.getByTestId('tour-restart')).toHaveCount(0);
});
