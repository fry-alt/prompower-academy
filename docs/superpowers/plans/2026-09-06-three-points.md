# Урок «Первое движение» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** в курсе появляется урок 3 из §7 брифа, а автопроверка учится
засчитывать задание без детали — по пройденным точкам.

**Architecture:** журнал прогона получает событие о конце каждого движения;
валидатор сверяет с ним список точек задания. Ни интерпретатор, ни сцена о новой
цели не знают.

**Tech Stack:** TypeScript, Vitest, MDX.

Спека: [../specs/2026-09-06-three-points-design.md](../specs/2026-09-06-three-points-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `packages/sim-core/src/world/state.ts` | событие `moved` |
| `packages/sim-core/src/interpreter/run.ts` | запись события после движения |
| `packages/sim-core/src/validators/task.ts` | разбор цели `pointsVisited` |
| `packages/sim-core/src/validators/check.ts` | проверка цели |
| `content/courses/…/03-pervoe-dvizhenie/` | новый урок |
| `tests/sim/three-points.test.ts` | эталон и понятный провал |

---

## Task 1: Точки в журнале

**Files:**
- Modify: `packages/sim-core/src/world/state.ts`, `interpreter/run.ts`, `interpreter/run.test.ts`

- [x] **Step 1: Тест**

После движения в журнале появляется событие `moved` с точкой фланца; у
несостоявшегося движения события нет.

- [x] **Step 2: Событие**

`{ kind: 'moved'; tick; point }`. Точка берётся `planner.flangePoint(joints, 0)`.

- [x] **Step 3: Проверить**

Run: `npm test`
Expected: PASS.

## Task 2: Цель «пройти точки»

**Files:**
- Modify: `packages/sim-core/src/validators/task.ts`, `check.ts`, `check.test.ts`

- [x] **Step 1: Тесты**

Цель засчитывается, когда каждая точка встречена в пределах допуска; пропуск
называет номер точки и её координаты в миллиметрах; порядок обхода не важен.

- [x] **Step 2: Разбор и проверка**

`{ type: 'pointsVisited', points: Vec3[], tolerance: number }`. Допуск
обязателен: подразумевать его молча — значит однажды поменять и сломать уроки.

- [x] **Step 3: Проверить**

Run: `npm run typecheck && npm test`
Expected: без вывода, PASS.

## Task 3: Урок

**Files:**
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/03-pervoe-dvizhenie/{lesson.ru.mdx,task.json,starter.json,demo-program.json}`
- Create: `tests/sim/three-points.test.ts`

- [x] **Step 1: Задание и эталон**

Три зоны на столе отмечают точки; эталон обходит их по прямой. Достижимость
проверяется прогоном, а не на глаз.

- [x] **Step 2: Тест**

Эталон доходит и проходит проверку; программа без третьей точки получает
объяснение с её номером.

- [x] **Step 3: Теория**

MDX: чем движение по осям отличается от движения по прямой, когда какое нужно,
что делают скорость и ускорение.

## Task 4: Проверка

- [x] **Step 1: Всё вместе**

Run: `npm run typecheck && npm test && npx playwright test`
Expected: PASS.

- [x] **Step 2: Посмотреть глазами**

Открыть урок, снять сцену с тремя отмеченными точками.

- [x] **Step 3: Коммит**
