# Обучение с подсветкой — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** новичок на экране задания видит, куда нажимать: подсветка ведёт по
шагам настоящего задания, а шаг закрывается сделанным действием.

**Architecture:** сценарий — данные рядом с уроком; разбор в слое приложения
(ядру про селекторы знать нечего); компонент подсветки измеряет цель по
селектору и сам решает, когда шаг закрыт.

**Tech Stack:** React 19, next-intl, Tailwind, Vitest, Playwright.

Спека: [../specs/2026-09-06-guided-tour-design.md](../specs/2026-09-06-guided-tour-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `lib/tour.ts` | новый: типы и разбор сценария |
| `lib/tour.test.ts` | новый: разбор и подсчёт инструкций |
| `lib/content.ts` | изменяется: урок отдаёт сценарий |
| `components/lesson/tour.tsx` | новый: подсветка и продвижение |
| `components/simulator/block-editor.tsx` | изменяется: `data-category` |
| `components/simulator/lesson-workspace.tsx` | изменяется: тур и кнопка «Обучение» |
| `app/[locale]/lesson/[id]/{page,lesson-client}.tsx` | изменяются: сценарий до рабочего места |
| `messages/ru.json`, `messages/en.json` | изменяются: строки тура |
| `content/…/03-pervoe-dvizhenie/tour.ru.json` | новый: первый сценарий |
| `tests/e2e/tour.spec.ts` | новый: шаг закрывается действием |

---

## Task 1: Сценарий как данные

**Files:**
- Create: `lib/tour.ts`, `lib/tour.test.ts`

- [x] **Step 1: Тесты**

Разбор всех трёх видов завершения; ошибка называет путь; пустой список шагов —
ошибка; подсчёт инструкций считает блоки внутри циклов и ветвей.

- [x] **Step 2: Разбор**

`parseTour(input): Tour`, `countOp(program, op): number`. Проверки явные, как в
разборе заданий.

- [x] **Step 3: Проверить**

Run: `npm test`
Expected: PASS.

## Task 2: Сценарий доезжает до экрана

**Files:**
- Modify: `lib/content.ts`, `app/[locale]/lesson/[id]/page.tsx`, `lesson-client.tsx`

- [x] **Step 1: Загрузка**

`tour.<locale>.json` рядом с уроком, файла нет — `null`. Имя выбирается тем же
способом, что и у теории.

- [x] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

## Task 3: Подсветка

**Files:**
- Create: `components/lesson/tour.tsx`
- Modify: `components/simulator/block-editor.tsx`, `messages/ru.json`, `messages/en.json`

- [x] **Step 1: Строки и цели**

`lesson.tour.step`, `.skip`, `.restart`; `data-category` на категориях палитры.

- [x] **Step 2: Компонент**

Затемнение четырьмя прямоугольниками, рамка по цели, карточка рядом; опрос
позиции четыре раза в секунду; клик ловится на погружении.

## Task 4: Тур в уроке

**Files:**
- Modify: `components/simulator/lesson-workspace.tsx`
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/03-pervoe-dvizhenie/tour.ru.json`

- [x] **Step 1: Встроить**

Тур поверх обоих этапов; кнопка «Обучение» в шапке возвращает его.

- [x] **Step 2: Сценарий урока 3**

К заданию → открыть «Движение» → перетащить блок прямой → запустить → зачёт.

- [x] **Step 3: Посмотреть глазами**

Пройти тур в браузере, снять шаг с подсветкой.

## Task 5: Проверка

**Files:**
- Create: `tests/e2e/tour.spec.ts`

- [x] **Step 1: E2E**

Тур виден на теории; нажатие подсвеченного переводит на следующий шаг;
«Пропустить» убирает тур.

- [x] **Step 2: Прогнать всё**

Run: `npm run typecheck && npm test && npx playwright test`
Expected: PASS.

- [x] **Step 3: Коммит**
