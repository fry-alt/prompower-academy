import { expect, test } from '@playwright/test';

test('первая страница показывает карту курса', async ({ page }) => {
  await page.goto('/ru');

  await expect(page.getByRole('heading', { name: 'Основы работы с коботом' })).toBeVisible();
  // Заголовок урока приходит из фронтматтера, а не из файла переводов.
  await expect(page.getByText('Инструмент и захват')).toBeVisible();
});

test('курс начинается с урока о коботе', async ({ page }) => {
  await page.goto('/ru');

  // Порядок уроков живёт в числовом префиксе папки и больше нигде: проверяем,
  // что карта показывает именно его, а не порядок чтения каталога.
  const titles = await page.getByTestId('lesson-title').allInnerTexts();
  expect(titles[0]).toBe('Знакомство с коботом');
  expect(titles).toHaveLength(4);
});

test('из карты курса открывается урок', async ({ page }) => {
  await page.goto('/ru');
  await page.getByRole('link', { name: /Инструмент и захват/ }).click();

  await expect(page).toHaveURL(/\/lesson\/instrument-i-zahvat/);
  // Урок открывается теорией, задание — следующим этапом.
  await expect(page.getByTestId('theory-start')).toBeVisible();
});

test('на экране урока видна теория', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');

  await expect(page.getByRole('heading', { name: 'Инструмент и захват' })).toBeVisible();
  // Текст из MDX, а не из интерфейса: проверяем, что содержание доехало.
  await expect(page.getByText(/центром инструмента/)).toBeVisible();
});

test('последний урок честно говорит, что он последний', async ({ page }) => {
  await page.goto('/ru/lesson/vhody-i-vyhody');

  await expect(page.getByTestId('lesson-nav')).toBeVisible();
  await expect(page.getByText('Это последний урок курса')).toBeVisible();
});

test('из урока про инструмент ведёт переход к следующему', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');

  await page.getByTestId('lesson-next').click();

  await expect(page).toHaveURL(/\/lesson\/vhody-i-vyhody/);
  await expect(page.getByRole('heading', { name: 'Входы и выходы' })).toBeVisible();
});

/**
 * Экран урока: теория — этап, а не колонка. Три зоны по 320 пикселей не давали
 * места ни тексту, ни редактору, ни сцене.
 */

test('урок открывается теорией, а не заданием', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');

  await expect(page.getByTestId('theory-start')).toBeVisible();
  await expect(page.getByTestId('block-editor')).toHaveCount(0);
});

test('к теории можно вернуться, не потеряв программу', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');
  await page.getByTestId('theory-start').click();
  await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('back-to-theory').click();
  await expect(page.getByTestId('theory-start')).toBeVisible();

  await page.getByTestId('theory-start').click();
  await expect(page.getByTestId('block-editor')).toBeVisible();
});

test('разделитель меняет ширину зон', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');
  await page.getByTestId('theory-start').click();
  await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 30_000 });

  const handle = page.getByTestId('split-handle');
  const before = Number(await handle.getAttribute('aria-valuenow'));

  // Клавиатурой, а не мышью: §9 требует, чтобы всё работало с клавиатуры.
  await handle.focus();
  await handle.press('ArrowRight');
  await handle.press('ArrowRight');

  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThan(before);
});

test.describe('телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('теория читается, а задание отсылает к компьютеру', async ({ page }) => {
    await page.goto('/ru/lesson/instrument-i-zahvat');
    await expect(page.getByRole('heading', { name: 'Инструмент и захват' })).toBeVisible();

    await page.getByTestId('theory-start').click();
    await expect(page.getByTestId('desktop-only')).toBeVisible();

    // Ни сцены, ни редактора: на телефоне они бесполезны, и грузить их незачем.
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.getByTestId('block-editor')).toHaveCount(0);

    await page.getByTestId('desktop-only-back').click();
    await expect(page.getByTestId('theory-start')).toBeVisible();
  });
});

test('на экране урока нет незакрытых ключей перевода', async ({ page }) => {
  // Ключ `lesson.title` однажды остался в шапке после переноса заголовков в
  // содержание, и ни один тест этого не заметил.
  await page.goto('/ru/lesson/instrument-i-zahvat');
  await page.getByTestId('theory-start').click();
  await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 30_000 });

  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\b(lesson|course|sandbox|app)\.[a-zA-Z]+\b/);
});
