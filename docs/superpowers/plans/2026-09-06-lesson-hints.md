# Подсказки в уроке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ученик, у которого задание не сходится, получает лестницу подсказок,
уже написанную автором урока в `task.json`.

**Architecture:** ядро отдаёт заслуженные подсказки чистой функцией от задания и
числа неудач; неудачи считает хук прогона, потому что он один знает, когда
программа доработала; экран урока только показывает.

**Tech Stack:** TypeScript, React 19, next-intl, Vitest, Playwright.

Спека: [../specs/2026-09-06-lesson-hints-design.md](../specs/2026-09-06-lesson-hints-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `packages/sim-core/src/validators/check.ts` | `hintFor` → `earnedHints` |
| `packages/sim-core/src/validators/check.test.ts` | тесты новой функции |
| `packages/sim-core/src/index.ts` | экспорт |
| `components/simulator/use-program-run.ts` | счёт неудачных попыток |
| `components/simulator/lesson-workspace.tsx` | раздел подсказок под вердиктом |
| `messages/ru.json`, `messages/en.json` | строки раздела |
| `tests/e2e/lesson.spec.ts` | подсказка после двух неудач |

---

## Task 1: Заслуженные подсказки в ядре

**Files:**
- Modify: `packages/sim-core/src/validators/check.ts`, `check.test.ts`, `index.ts`

- [x] **Step 1: Тесты**

Заменить блок `describe('hintFor')` на `describe('earnedHints')`: пусто до
первого порога, одна после второго, обе после четвёртого, порядок по
возрастанию порога.

- [x] **Step 2: Функция**

`earnedHints(task, failedAttempts): readonly Hint[]` вместо `hintFor`. Экспорт
в `index.ts` поправить вместе с ней, тип `Hint` тоже нужен снаружи.

- [x] **Step 3: Проверить**

Run: `npm test`
Expected: PASS.

## Task 2: Счёт неудачных попыток

**Files:**
- Modify: `components/simulator/use-program-run.ts`

- [x] **Step 1: Счётчик**

`failedAttempts` в `ProgramRun`. Растёт, когда прогон дошёл до конца и
автопроверка не пройдена; один прогон считается один раз (сравнение по
объекту состояния), перезапуск счётчик не трогает.

- [x] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

## Task 3: Показ подсказок

**Files:**
- Modify: `components/simulator/lesson-workspace.tsx`, `messages/ru.json`, `messages/en.json`

- [x] **Step 1: Строки**

`lesson.hints.title` и `lesson.hints.next` в обоих файлах переводов.

- [x] **Step 2: Раздел под вердиктом**

Заслуженные подсказки списком; пока ни одной — раздела нет; пока запас не
исчерпан — строка о следующей.

- [x] **Step 3: Проверить типы и тесты**

Run: `npm run typecheck && npm test`
Expected: без вывода, PASS.

## Task 4: Проверка

**Files:**
- Modify: `tests/e2e/lesson.spec.ts`

- [x] **Step 1: E2E**

Удалить все блоки через контекстное меню холста, дважды прогнать пустую
программу, дождаться первой подсказки.

- [x] **Step 2: Прогнать**

Run: `npx playwright test tests/e2e/lesson.spec.ts`
Expected: PASS.

- [x] **Step 3: Посмотреть глазами**

Снять экран урока с открытой подсказкой.

- [x] **Step 4: Коммит**
