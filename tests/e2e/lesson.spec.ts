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
  // Именно сцена: Blockly держит свой скрытый canvas для замера текста, и
  // селектор без уточнения находит оба.
  await expect(page.locator('main canvas')).toBeVisible();
  // Программа собирается редактором, поэтому ждём, пока холст поднимется.
  await expect(page.locator('[data-testid="block-editor"] svg.blocklySvg')).toBeVisible();
});

test('задание открывается со сценой и программой', async ({ page }) => {
  await expect(page.getByText('Переставить «деталь» в «зона B»')).toBeVisible();
  await expect(page.getByTestId('load-failure')).toHaveCount(0);

  await page.getByTestId('tab-list').click();
  await expect(page.getByTestId('program-line')).toHaveCount(10);
});

test('до запуска вердикта нет', async ({ page }) => {
  await expect(page.getByTestId('verdict')).toHaveCount(0);
});

test('шаг подсвечивает следующую инструкцию', async ({ page }) => {
  await page.getByTestId('tab-list').click();
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
  await page.getByTestId('tab-list').click();
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

test('редактор блоков открывается с программой урока', async ({ page }) => {
  await expect(page.locator('[data-testid="block-editor"] svg.blocklySvg')).toBeVisible();
  // Категории тулбокса, а не любое совпадение текста: слово «захват» есть и в
  // условии задания, и на самом блоке.
  const categories = page.locator('.blocklyToolboxCategory');
  await expect(categories.filter({ hasText: 'Движение' })).toHaveCount(1);
  await expect(categories.filter({ hasText: 'Захват' })).toHaveCount(1);
  await expect(page.getByTestId('program-error')).toHaveCount(0);
});

test('вкладка «Код» показывает готовый скрипт для робота', async ({ page }) => {
  await page.getByTestId('tab-code').click();

  const code = page.getByTestId('python-code');
  await expect(code).toContainText('import jkrc');
  await expect(code).toContainText('robot.joint_move');
  // Захват на роботе — это выход инструмента, а не отдельная команда.
  await expect(code).toContainText('robot.set_digital_output(IO_TOOL');
});

test('список показывает ту же программу, что собрана из блоков', async ({ page }) => {
  await page.getByTestId('tab-list').click();
  await expect(page.getByTestId('program-line').first()).toContainText('Подойти к детали сверху');
});
