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

/**
 * Показ точки роботу. Проверяется вся цепочка: кнопка в блоке → панель и серая
 * копия → ползунок → запись в блок → новая программа в списке.
 */
const FIRST_MOVE_LINE = 1;

/**
 * Кнопка первого движения программы.
 *
 * Вложенный блок у Blockly оказывается в разметке раньше объемлющего, поэтому
 * первому движению отвечает последняя кнопка, а не первая. Что нажали именно
 * его, проверяет сама подсветка строки «По осям» ниже.
 */
const FIRST_MOVE_TEACH = '.pp_move_joint > .ppTeachField';

test('кнопка в блоке движения открывает показ точки', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();

  await expect(page.getByTestId('teach-panel')).toBeVisible();
  await expect(page.getByTestId('teach-flange')).toContainText('Фланец');
  await expect(page.locator('[data-testid="teach-panel"] input[type="range"]')).toHaveCount(6);
});

test('сохранение пишет показанную позу в блок', async ({ page }) => {
  await page.getByTestId('tab-list').click();
  await expect(page.getByTestId('program-line').nth(FIRST_MOVE_LINE)).toContainText('По осям 13°');

  await page.getByTestId('tab-blocks').click();
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.locator('[data-testid="teach-panel"] input[type="range"]').first().fill('45');
  await page.getByTestId('teach-save').click();

  await expect(page.getByTestId('teach-panel')).toHaveCount(0);
  await page.getByTestId('tab-list').click();
  await expect(page.getByTestId('program-line').nth(FIRST_MOVE_LINE)).toContainText('По осям 45°');
});

test('отмена не меняет программу', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.locator('[data-testid="teach-panel"] input[type="range"]').first().fill('45');
  await page.getByTestId('teach-cancel').click();

  await expect(page.getByTestId('teach-panel')).toHaveCount(0);
  await page.getByTestId('tab-list').click();
  await expect(page.getByTestId('program-line').nth(FIRST_MOVE_LINE)).toContainText('По осям 13°');
});

test('показ точки останавливает прогон и не даёт его возобновить', async ({ page }) => {
  await page.getByTestId('play').click();
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await expect(page.getByTestId('teach-panel')).toBeVisible();

  // Пульт заперт: иначе прогон поедет за спиной у панели и настоящий робот
  // разойдётся с копией, которая стоит на месте.
  await expect(page.getByTestId('play')).toBeDisabled();
  await expect(page.getByTestId('step')).toBeDisabled();
  await expect(page.getByTestId('reset')).toBeDisabled();

  // Интерпретатор действительно стоит: подсвеченная инструкция не уезжает.
  await page.getByTestId('tab-list').click();
  const current = page.locator('[data-current="true"]');
  const stopped = await current.textContent();
  await page.waitForTimeout(2000);
  await expect(current).toHaveText(stopped ?? '');
});

test('точка, показанная заново, не ломает задание', async ({ page }) => {
  // У движения по прямой круг длиннее всего: поля → обратная задача → поза
  // копии → прямая задача → снова поля. Если он теряет точность, деталь мимо
  // захвата, и это должно быть видно на зачёте, а не в проде.
  await page.locator('.pp_move_linear > .ppTeachField').last().click();
  await page.getByTestId('teach-save').click();

  await page.getByTestId('play').click();

  await expect(page.getByTestId('verdict')).toContainText('Задание выполнено', {
    timeout: 60_000,
  });
});

/**
 * Ручное управление в координатах. Проверяется то, чего не видно unit-тестам:
 * что панель действительно ездит на кинематике, а не показывает свои числа.
 */

test('вкладка координат показывает позу фланца', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.getByTestId('teach-tab-cartesian').click();

  await expect(page.getByTestId('cartesian-panel')).toBeVisible();
  await expect(page.getByTestId('axis-X')).toBeVisible();
  await expect(page.getByTestId('axis-RZ')).toBeVisible();
});

test('шаг по оси двигает копию', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.getByTestId('teach-tab-cartesian').click();

  const before = Number(await page.getByTestId('axis-Z').inputValue());

  // Шаг в 10 мм: он заведомо больше допуска обратной задачи в миллиметр, и
  // округлённое до целых миллиметров число обязано измениться.
  await page.getByTestId('step-1').click();
  await page.getByTestId('jog-z-minus').click();

  await expect
    .poll(async () => Number(await page.getByTestId('axis-Z').inputValue()))
    .toBeLessThan(before);
});

test('кнопка «инструмент вниз» ставит инструмент вертикально', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.getByTestId('teach-tab-cartesian').click();
  await page.getByTestId('teach-align-down').click();

  // Обратная задача обещает 0.01 рад по ориентации, поэтому сверяем с запасом в
  // градус. Знак не важен: 180 и −180 — одна и та же ориентация.
  await expect
    .poll(async () => {
      const rx = Number(await page.getByTestId('axis-RX').inputValue());
      return Math.abs(Math.abs(rx) - 180);
    })
    .toBeLessThan(1);
});

test('перпендикуляр набирается кнопкой и сохраняется в блок', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.getByTestId('teach-tab-cartesian').click();
  await page.getByTestId('teach-align-down').click();
  await page.getByTestId('teach-save').click();

  await expect(page.getByTestId('teach-panel')).toHaveCount(0);

  // Ждём именно вердикта, а не зачёта: показанная кнопкой поза может не довести
  // деталь до зоны, и это нормально. Недопустима ошибка исполнения.
  await page.getByTestId('play').click();
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 60_000 });
});

test('удержание кнопки двигает дальше одного шага', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.getByTestId('teach-tab-cartesian').click();
  await page.getByTestId('step-1').click();

  const before = Number(await page.getByTestId('axis-Z').inputValue());

  // Щелчок для сравнения: ровно один шаг.
  await page.getByTestId('jog-z-plus').click();
  const afterTap = Number(await page.getByTestId('axis-Z').inputValue());

  // Удержание: порог 250 мс плюс восемь шагов в секунду.
  await page.getByTestId('jog-z-plus').hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();

  const afterHold = Number(await page.getByTestId('axis-Z').inputValue());

  expect(afterTap - before).toBeGreaterThan(0);
  expect(afterHold - afterTap).toBeGreaterThan(afterTap - before);
});

test('отпускание кнопки останавливает движение', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.getByTestId('teach-tab-cartesian').click();
  await page.getByTestId('step-1').click();

  await page.getByTestId('jog-z-plus').hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();

  const atRelease = Number(await page.getByTestId('axis-Z').inputValue());
  await page.waitForTimeout(700);

  expect(Number(await page.getByTestId('axis-Z').inputValue())).toBe(atRelease);
});
