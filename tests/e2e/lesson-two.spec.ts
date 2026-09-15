import { expect, test, type Page } from '@playwright/test';

/**
 * Урок 2: запрет проверяется во время работы, а не в конце.
 *
 * Углы проверены unit-тестом на настоящем задании, здесь — что интерфейс
 * действительно ездит на проверке: нарушение приходит от валидатора, держится
 * до сброса и не даёт зачесть задание.
 */

const LESSON = '/ru/lesson/bezopasnost';

/**
 * Эталонный обход и поза, въезжающая в зону, в градусах ползунка.
 *
 * Порядок в обходе значим: база поворачивается последней. Повернуть её первой
 * значит пронести сложенную руку прямо над зоной — что урок и должен ловить.
 */
const DETOUR = { joint_2: '0', joint_3: '50', joint_5: '80', joint_1: '-60' };
const INSIDE = { joint_1: '-40', joint_2: '0', joint_3: '60', joint_5: '80' };

async function setJoints(page: Page, values: Record<string, string>): Promise<void> {
  for (const [joint, value] of Object.entries(values)) {
    await page.locator(`[data-joint="${joint}"]`).fill(value);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(LESSON);
  await page.getByTestId('theory-start').click();
  await page.getByTestId('tour-skip').click();
  await expect(page.locator('main canvas')).toBeVisible();
});

test('задание начинается без нарушений', async ({ page }) => {
  await expect(page.getByTestId('violation')).toHaveCount(0);
  await expect(page.getByTestId('verdict')).toHaveCount(0);
});

test('въезд в зону оператора становится нарушением', async ({ page }) => {
  await setJoints(page, INSIDE);

  await expect(page.getByTestId('violation')).toContainText('зона оператора');
});

test('нарушение не забывается само', async ({ page }) => {
  await setJoints(page, INSIDE);
  await expect(page.getByTestId('violation')).toBeVisible();

  // Робот выведен из зоны — но случившееся из урока не исчезает.
  await setJoints(page, { joint_1: '-60' });
  await expect(page.getByTestId('violation')).toBeVisible();
});

test('с нарушением задание не зачтено, даже когда цель взята', async ({ page }) => {
  await setJoints(page, INSIDE);
  await setJoints(page, DETOUR);

  await expect(page.getByTestId('violation')).toBeVisible();
  await expect(page.getByTestId('verdict')).toHaveCount(0);
});

test('сброс снимает нарушение, и обход доводит задание до зачёта', async ({ page }) => {
  await setJoints(page, INSIDE);
  await expect(page.getByTestId('violation')).toBeVisible();

  await page.getByTestId('reset').click();
  await expect(page.getByTestId('violation')).toHaveCount(0);

  await setJoints(page, DETOUR);
  await expect(page.getByTestId('verdict')).toContainText('Задание выполнено');
  await expect(page.getByTestId('violation')).toHaveCount(0);
});
