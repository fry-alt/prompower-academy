# Задание на телефоне — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** телефон получает по кнопке «К заданию» честный ответ вместо
нерабочего редактора, а теория и переходы по курсу на нём работают как прежде.

**Architecture:** ширину окна знает один маленький хук; рабочее место урока по
нему выбирает, что показать на этапе задания. Сцена и Blockly на узком экране
не монтируются.

**Tech Stack:** React 19, next-intl, Tailwind, Playwright.

Спека: [../specs/2026-09-06-task-on-desktop-design.md](../specs/2026-09-06-task-on-desktop-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `components/lesson/use-wide-enough.ts` | новый: подписка на `matchMedia` |
| `components/lesson/task-on-desktop.tsx` | новый: экран отказа |
| `components/simulator/lesson-workspace.tsx` | изменяется: выбор на этапе задания |
| `messages/ru.json`, `messages/en.json` | изменяются: строки отказа |
| `tests/e2e/course.spec.ts` | изменяется: проверка на 390×844 |

---

## Task 1: Ширина окна

**Files:**
- Create: `components/lesson/use-wide-enough.ts`

- [x] **Step 1: Хук**

`useWideEnough()` через `useSyncExternalStore` над `matchMedia('(min-width: 768px)')`.
На сервере — `true`.

- [x] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

## Task 2: Экран отказа

**Files:**
- Create: `components/lesson/task-on-desktop.tsx`
- Modify: `messages/ru.json`, `messages/en.json`

- [x] **Step 1: Строки**

`lesson.desktopOnly.title`, `.text`, `.address`, `.back` в обоих файлах.

- [x] **Step 2: Компонент**

Заголовок, объяснение, адрес урока, кнопка возврата к теории.

## Task 3: Подмена этапа задания

**Files:**
- Modify: `components/simulator/lesson-workspace.tsx`

- [x] **Step 1: Выбор по ширине**

На узком экране этап задания показывает экран отказа; шапка не показывает
кнопки прогона — управлять нечем.

- [x] **Step 2: Проверить типы и тесты**

Run: `npm run typecheck && npm test`
Expected: без вывода, PASS.

## Task 4: Проверка

**Files:**
- Modify: `tests/e2e/course.spec.ts`

- [x] **Step 1: E2E на телефоне**

Отдельный контекст 390×844: теория видна, «К заданию» даёт отказ, `canvas` на
странице нет.

- [x] **Step 2: Прогнать**

Run: `npx playwright test tests/e2e/course.spec.ts`
Expected: PASS.

- [x] **Step 3: Коммит**
