import { expect, test, type Page } from '@playwright/test';

/**
 * Урок 1 проходится ползунками.
 *
 * Углы проверены unit-тестом на настоящем задании, здесь проверяется другое:
 * что интерфейс действительно ездит на автопроверке — отметки целей приходят от
 * валидатора, а не нарисованы, и вторая цель не берётся раньше первой.
 */

const LESSON = '/ru/lesson/znakomstvo-s-kobotom';

/** Эталонные углы в градусах: как их показывает ползунок. */
const POSE = { joint_1: '20', joint_2: '30', joint_3: '80', joint_5: '70' };
const POINT = { joint_1: '0', joint_2: '10', joint_3: '90', joint_5: '80' };

async function setJoints(page: Page, values: Record<string, string>): Promise<void> {
  for (const [joint, value] of Object.entries(values)) {
    await page.locator(`[data-joint="${joint}"]`).fill(value);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(LESSON);
  await page.getByTestId('theory-start').click();
  // Подсветка обучения перекрывает экран: она проверена своим тестом.
  await page.getByTestId('tour-skip').click();
  await expect(page.locator('main canvas')).toBeVisible();
});

test('задание открывается ползунками, а не блоками', async ({ page }) => {
  await expect(page.getByTestId('joint-panel')).toBeVisible();
  await expect(page.getByTestId('block-editor')).toHaveCount(0);
  await expect(page.getByTestId('play')).toHaveCount(0);
  await expect(page.getByTestId('load-failure')).toHaveCount(0);
});

test('до начала работы ни одна цель не взята', async ({ page }) => {
  await expect(page.locator('[data-goal-status="taken"]')).toHaveCount(0);
  await expect(page.getByTestId('verdict')).toHaveCount(0);
});

test('вторая цель не берётся раньше первой', async ({ page }) => {
  await setJoints(page, POINT);

  // Фланец в точке второй цели, но первая ещё не пройдена — зачёта нет.
  await expect(page.locator('[data-goal-status="taken"]')).toHaveCount(0);
});

test('две цели подряд доводят задание до зачёта', async ({ page }) => {
  await setJoints(page, POSE);
  await expect(page.locator('[data-goal="0"]')).toHaveAttribute('data-goal-status', 'taken');

  await setJoints(page, POINT);
  await expect(page.locator('[data-goal="1"]')).toHaveAttribute('data-goal-status', 'taken');
  await expect(page.getByTestId('verdict')).toContainText('Задание выполнено');
});

test('сброс возвращает позу, но не отбирает взятую цель', async ({ page }) => {
  await setJoints(page, POSE);
  await expect(page.locator('[data-goal="0"]')).toHaveAttribute('data-goal-status', 'taken');

  await page.getByTestId('reset').click();

  await expect(page.locator('[data-joint-value="joint_2"]')).toHaveText('90.0°');
  await expect(page.locator('[data-goal="0"]')).toHaveAttribute('data-goal-status', 'taken');
});
