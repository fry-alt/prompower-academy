import { expect, test } from '@playwright/test';

/**
 * Проход по DoD фазы 1: модель грузится, суставы двигаются, пределы соблюдаются.
 *
 * Порог в 60 fps здесь не проверяется — в CI рендер программный. Тест лишь
 * убеждается, что кадры идут; цифру на среднем ноутбуке смотрим на самой странице.
 */

const SANDBOX = '/ru/sandbox';
/** joint_2 в URDF модели JAKA ограничен ±2.094 рад — 119.977°, на экране 120.0°. */
const SHOULDER_UPPER_DEG = '120.0°';
/** Домашняя поза плеча из конфига плагина: -0.6 рад. */
const SHOULDER_HOME_DEG = '-34.4°';

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

  // Границы ползунка приходят из <limit> в URDF, а не из кода приложения:
  // joint_2 ограничен ±2.094 рад, это ±119.977°.
  const max = Number(await slider.getAttribute('max'));
  expect(max).toBeCloseTo(119.977, 2);

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
