import { expect, test } from '@playwright/test';

/**
 * Проход по DoD фазы 1: модель грузится, суставы двигаются, пределы соблюдаются.
 *
 * Порог в 60 fps здесь не проверяется — в CI рендер программный. Тест лишь
 * убеждается, что кадры идут; цифру на среднем ноутбуке смотрим на самой странице.
 */

const SANDBOX = '/ru/sandbox/jaka-zu7';
/** joint_2 у Zu 7 ограничен -1.48..4.62 рад, на экране это -84.8..264.7°. */
const SHOULDER_UPPER_DEG = '264.7°';
/** Домашняя поза плеча из конфига серии: 1.571 рад. */
const SHOULDER_HOME_DEG = '90.0°';

test.beforeEach(async ({ page }) => {
  await page.goto(SANDBOX);
});

test('сцена загружается и честно называет себя заглушкой', async ({ page }) => {
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('placeholder-notice')).toContainText('не кобот PROMPOWER');
  await expect(page.getByTestId('load-failure')).toHaveCount(0);
});

test('модель грузится быстрее двух секунд', async ({ page }) => {
  const loadMs = page.getByTestId('load-ms');
  await expect(loadMs).toBeVisible();
  expect(Number(await loadMs.innerText())).toBeLessThan(2000);
});

test('кадры идут', async ({ page }) => {
  await expect(page.getByTestId('scene-stats')).toContainText(/\d+ fps/, { timeout: 5000 });
});

test('ползунок двигает сустав', async ({ page }) => {
  const slider = page.locator('[data-joint="joint_1"]');
  const readout = page.locator('[data-joint-value="joint_1"]');

  await expect(readout).toHaveText('0.0°');
  await slider.fill('45');
  await expect(readout).toHaveText('45.0°');
});

test('сустав упирается в предел из URDF', async ({ page }) => {
  const slider = page.locator('[data-joint="joint_2"]');
  const readout = page.locator('[data-joint-value="joint_2"]');

  // Границы ползунка приходят из <limit> в URDF, а не из кода приложения.
  expect(Number(await slider.getAttribute('max'))).toBeCloseTo(264.706, 2);
  expect(Number(await slider.getAttribute('min'))).toBeCloseTo(-84.798, 2);

  await slider.press('End');
  await expect(readout).toHaveText(SHOULDER_UPPER_DEG);
  await expect(page.getByText('Верхний предел')).toBeVisible();

  // Дальше предела сустав не уходит, сколько ни жми.
  for (let i = 0; i < 5; i += 1) await slider.press('ArrowRight');
  await expect(readout).toHaveText(SHOULDER_UPPER_DEG);
});

test('кнопки позы возвращают робота в известное состояние', async ({ page }) => {
  const shoulder = page.locator('[data-joint-value="joint_2"]');

  await page.getByRole('button', { name: 'Все суставы в ноль' }).click();
  await expect(shoulder).toHaveText('0.0°');

  await page.getByRole('button', { name: 'Домашняя поза' }).click();
  await expect(shoulder).toHaveText(SHOULDER_HOME_DEG);
});

test('выбор модели меняет робота и адрес страницы', async ({ page }) => {
  const base = page.locator('[data-joint="joint_1"]');

  // У Zu 7 первый сустав revolute с пределом ±359.8° из URDF.
  expect(Number(await base.getAttribute('max'))).toBeCloseTo(359.817, 2);

  await page.getByTestId('robot-picker').selectOption('jaka-zu12');
  await page.waitForURL('**/ru/sandbox/jaka-zu12');

  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('robot-picker')).toHaveValue('jaka-zu12');
  await expect(page.getByTestId('load-failure')).toHaveCount(0);

  // А у Zu 12 те же суставы объявлены continuous, и ползунок даёт полный оборот.
  expect(Number(await base.getAttribute('max'))).toBe(180);
});

test('адрес без модели уводит на модель по умолчанию', async ({ page }) => {
  await page.goto('/ru/sandbox');
  await page.waitForURL('**/ru/sandbox/jaka-zu7');
  await expect(page.getByTestId('robot-picker')).toHaveValue('jaka-zu7');
});
