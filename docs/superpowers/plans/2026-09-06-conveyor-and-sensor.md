# Конвейер и датчик — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** деталь приезжает по ленте, датчик включает вход, и урок 5 «Входы и
выходы» собирается из уже существующих блоков ожидания сигнала.

**Architecture:** лента и датчики — часть состояния мира; единственное место,
где идёт время (`advanceTick`), двигает детали и пересчитывает входы. Всё
остальное — разбор задания, сцена, урок — только передаёт данные дальше.

**Tech Stack:** TypeScript, Vitest, three.js (@react-three/fiber), MDX.

Спека: [../specs/2026-09-06-conveyor-and-sensor-design.md](../specs/2026-09-06-conveyor-and-sensor-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `packages/sim-core/src/world/state.ts` | типы ленты и датчика, тик |
| `packages/sim-core/src/world/conveyor.test.ts` | новый: тесты движения и датчика |
| `packages/sim-core/src/validators/task.ts` | разбор ленты и датчиков из задания |
| `packages/sim-core/src/index.ts` | экспорт типов |
| `components/simulator/use-program-run.ts` | лента и датчики в стартовый мир |
| `components/simulator/scene-objects.tsx` | отрисовка ленты и датчика |
| `content/courses/…/05-vhody-i-vyhody/` | новый урок |
| `tests/sim/conveyor.test.ts` | новый: эталонная программа урока 5 |

---

## Task 1: Лента и датчик в мире

**Files:**
- Modify: `packages/sim-core/src/world/state.ts`, `index.ts`
- Create: `packages/sim-core/src/world/conveyor.test.ts`

- [x] **Step 1: Тесты**

Деталь на ленте едет за тик на `speed × TICK`; вне коробки ленты не едет;
зажатая деталь не едет; доехав до края, останавливается; датчик включает свой
вход, пока деталь внутри, и выключает, когда она вышла; пачка тиков считается
как один сдвиг на всю пачку.

- [x] **Step 2: Типы и тик**

`Conveyor { id, position, size, axis: 'x' | 'y', speed }`,
`Sensor { id, position, size, bank, channel }`. Поля в `WorldState` и
`WorldInit`. В `advanceTick`: сначала лента, потом датчики.

- [x] **Step 3: Проверить**

Run: `npm test`
Expected: PASS.

## Task 2: Лента в задании

**Files:**
- Modify: `packages/sim-core/src/validators/task.ts`, `task.test.ts` при наличии
- Modify: `components/simulator/use-program-run.ts`

- [x] **Step 1: Разбор**

`world.conveyors` и `world.sensors` — необязательные массивы. Ошибка называет
путь до места, как у остальных полей.

- [x] **Step 2: Стартовый мир**

`createWorld` в хуке прогона получает ленту и датчики из задания.

- [x] **Step 3: Проверить**

Run: `npm run typecheck && npm test`
Expected: без вывода, PASS.

## Task 3: Урок 5

**Files:**
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/05-vhody-i-vyhody/{lesson.ru.mdx,task.json,starter.json,demo-program.json}`
- Create: `tests/sim/conveyor.test.ts`

- [x] **Step 1: Задание**

Лента вдоль Y приводит деталь к точке захвата урока 4 (x 0.35, y 0.2), датчик
на её конце включает вход шкафа 1. Цель — деталь в зоне B, захват открыт.

- [x] **Step 2: Эталонная программа**

Ждать вход → подойти → взять → перенести → отпустить. Позы берутся из урока 4:
они уже проверены прогоном.

- [x] **Step 3: Тест эталона**

Прогон эталона доходит до конца, проходит проверку; программа без ожидания
сигнала хватает пустоту и проверку не проходит.

Run: `npm test`
Expected: PASS.

- [x] **Step 4: Теория**

MDX: цифровые входы и выходы, датчик как источник сигнала, зачем ждать. 2–4
минуты чтения.

## Task 4: Сцена

**Files:**
- Modify: `components/simulator/scene-objects.tsx`

- [x] **Step 1: Лента и датчик**

Лента — плита с направлением, датчик — рамка, светящаяся при включённом входе.

- [x] **Step 2: Посмотреть глазами**

Открыть урок 5, снять сцену: деталь едет, датчик срабатывает.

## Task 5: Проверка

- [ ] **Step 1: Всё вместе**

Run: `npm run typecheck && npm test && npx playwright test`
Expected: PASS.

- [ ] **Step 2: Коммит**
