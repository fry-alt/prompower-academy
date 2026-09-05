import { expect, test } from '@playwright/test';

test('первая страница показывает карту курса', async ({ page }) => {
  await page.goto('/ru');

  await expect(page.getByRole('heading', { name: 'Основы работы с коботом' })).toBeVisible();
  // Заголовок урока приходит из фронтматтера, а не из файла переводов.
  await expect(page.getByText('Инструмент и захват')).toBeVisible();
});

test('из карты курса открывается урок', async ({ page }) => {
  await page.goto('/ru');
  await page.getByRole('link', { name: /Инструмент и захват/ }).click();

  await expect(page).toHaveURL(/\/lesson\/instrument-i-zahvat/);
  await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 30_000 });
});

test('на экране урока видна теория', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');

  await expect(page.getByRole('heading', { name: 'Инструмент и захват' })).toBeVisible();
  // Текст из MDX, а не из интерфейса: проверяем, что содержание доехало.
  await expect(page.getByText(/центром инструмента/)).toBeVisible();
});

test('последний урок честно говорит, что он последний', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');

  // Урок пока единственный: и «назад», и «дальше» вести некуда.
  await expect(page.getByTestId('lesson-nav')).toBeVisible();
  await expect(page.getByText('Это последний урок курса')).toBeVisible();
});
