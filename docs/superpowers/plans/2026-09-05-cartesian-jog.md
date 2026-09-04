# Декартово ручное управление и учебные оси — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** дать в режиме показа точки декартово ручное управление — шаг фланца по осям в системе мира или инструмента, точный ввод позы, кнопка «инструмент вниз» — и показать оси инструмента прямо в сцене.

**Architecture:** вся арифметика в новом чистом модуле `packages/sim-core/src/kinematics/jog.ts`: шаг считается матрицами и переводится в позу только для обратной задачи. Панель показа получает вкладки «Суставы» и «Координаты»; вторая — тонкий компонент, который переводит миллиметры и градусы в СИ и зовёт `jogPose`. Триада осей берёт матрицу из той же прямой задачи, что и числа в панели.

**Tech Stack:** TypeScript strict, Vitest, three.js через @react-three/fiber, next-intl, Playwright.

Спека: [../specs/2026-09-05-cartesian-jog-design.md](../specs/2026-09-05-cartesian-jog-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `packages/sim-core/src/kinematics/jog.ts` | новый: шаг фланца, точная поза, «инструмент вниз». Чистая кинематика |
| `packages/sim-core/src/kinematics/jog.test.ts` | новый: unit-тесты модуля |
| `packages/sim-core/src/index.ts` | изменяется: экспорт нового модуля |
| `components/simulator/axes-triad.tsx` | новый: оси на фланце и в основании |
| `components/simulator/cartesian-panel.tsx` | новый: кнопки подвода, точный ввод, выбор системы координат |
| `components/simulator/teach-panel.tsx` | изменяется: две вкладки вместо одной панели |
| `components/simulator/lesson-workspace.tsx` | изменяется: обработчики жога, триады в сцене |
| `messages/ru.json`, `messages/en.json` | изменяются: строки панели |
| `tests/e2e/lesson.spec.ts` | изменяется: сценарий набора перпендикуляра |

Ключевые соглашения, проверенные по коду перед написанием плана:

- Матрицы `Matrix4` — **построчные** (`fromTranslation` кладёт `v.x` в индекс 3, `translationOf` читает `m[3]`).
- `fromRpy(roll, pitch, yaw)` — это `Rz(yaw)·Ry(pitch)·Rx(roll)`, конвенция URDF.
- Робот в сцене повёрнут: `robot.rotation.x = -Math.PI / 2` в `use-urdf-robot.ts`. Всё, что ставится рядом с ним по координатам симулятора, должно лежать в группе с тем же поворотом.
- `solveIk(chain, target: Pose, seed, options?)` возвращает `{ ok: true, joints, iterations } | { ok: false, reason: string }`.

---

## Task 1: Модуль жога в `sim-core`

**Files:**
- Create: `packages/sim-core/src/kinematics/jog.ts`
- Create: `packages/sim-core/src/kinematics/jog.test.ts`
- Modify: `packages/sim-core/src/index.ts`

- [x] **Step 1: Написать падающие тесты**

Создать `packages/sim-core/src/kinematics/jog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { flangePose, forwardKinematics } from './chain';
import { alignToolDown, jogPose, jogToPose } from './jog';
import { parseUrdfChain } from './urdf';

/** Шестиосевая рука тех же пропорций, что в тестах обратной задачи. */
const ARM = `<robot name="six_axis">
  <link name="base"/>
  <joint name="j1" type="revolute">
    <parent link="base"/><child link="l1"/>
    <origin xyz="0 0 0.15"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"/>
  </joint>
  <link name="l1"/>
  <joint name="j2" type="revolute">
    <parent link="l1"/><child link="l2"/>
    <origin xyz="0 0 0.1"/><axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0"/>
  </joint>
  <link name="l2"/>
  <joint name="j3" type="revolute">
    <parent link="l2"/><child link="l3"/>
    <origin xyz="0 0 0.36"/><axis xyz="0 1 0"/>
    <limit lower="-2.6" upper="2.6"/>
  </joint>
  <link name="l3"/>
  <joint name="j4" type="revolute">
    <parent link="l3"/><child link="l4"/>
    <origin xyz="0 0 0.3"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"/>
  </joint>
  <link name="l4"/>
  <joint name="j5" type="revolute">
    <parent link="l4"/><child link="l5"/>
    <origin xyz="0 0 0.09"/><axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0"/>
  </joint>
  <link name="l5"/>
  <joint name="j6" type="revolute">
    <parent link="l5"/><child link="l6"/>
    <origin xyz="0 0 0.08"/><axis xyz="0 0 1"/>
    <limit lower="-6.28" upper="6.28"/>
  </joint>
  <link name="l6"/>
</robot>`;

const chain = parseUrdfChain(ARM, ['j1', 'j2', 'j3', 'j4', 'j5', 'j6']);

const HOME = [0, 0.4, -0.8, 0, 0.4, 0];
/** Та же поза, развёрнутая первым суставом: система фланца заметно расходится с миром. */
const TURNED = [Math.PI / 2, 0.4, -0.8, 0, 0.4, 0];

const STEP = 0.05;

/**
 * Обратная задача обещает 1 мм по положению, поэтому сравниваем с запасом:
 * `toBeCloseTo(x, 2)` — это «различие меньше 5 мм».
 */
const PLACES = 2;

describe('шаг по прямой', () => {
  it('в системе мира двигает фланец вдоль оси мира', () => {
    const before = flangePose(chain, HOME);

    const result = jogPose(chain, HOME, 'world', 'x', STEP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.x - before.x).toBeCloseTo(STEP, PLACES);
    expect(after.y - before.y).toBeCloseTo(0, PLACES);
    expect(after.z - before.z).toBeCloseTo(0, PLACES);
  });

  it('в системе фланца идёт вдоль оси инструмента, а не мира', () => {
    // Первый столбец матрицы — ось X инструмента в координатах мира.
    const m = forwardKinematics(chain, TURNED);
    const axis = { x: m[0] ?? 0, y: m[4] ?? 0, z: m[8] ?? 0 };
    const before = flangePose(chain, TURNED);

    const result = jogPose(chain, TURNED, 'flange', 'x', STEP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.x - before.x).toBeCloseTo(STEP * axis.x, PLACES);
    expect(after.y - before.y).toBeCloseTo(STEP * axis.y, PLACES);
    expect(after.z - before.z).toBeCloseTo(STEP * axis.z, PLACES);
  });
});

describe('поворот', () => {
  it('в системе инструмента не сдвигает точку фланца', () => {
    const before = flangePose(chain, HOME);

    const result = jogPose(chain, HOME, 'flange', 'ry', 0.2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.x).toBeCloseTo(before.x, PLACES);
    expect(after.y).toBeCloseTo(before.y, PLACES);
    expect(after.z).toBeCloseTo(before.z, PLACES);
  });

  it('в системе мира тоже не сдвигает точку фланца', () => {
    // Ось поворота проходит через фланец, а не через основание робота. Если
    // сопряжение потерять, рука уедет по дуге и этот тест поймает именно это.
    const before = flangePose(chain, HOME);

    const result = jogPose(chain, HOME, 'world', 'rz', 0.2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.x).toBeCloseTo(before.x, PLACES);
    expect(after.y).toBeCloseTo(before.y, PLACES);
    expect(after.z).toBeCloseTo(before.z, PLACES);
  });
});

describe('инструмент вниз', () => {
  it('ставит ось Z инструмента вертикально вниз', () => {
    const result = alignToolDown(chain, HOME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Третий столбец матрицы — ось Z инструмента в координатах мира.
    const m = forwardKinematics(chain, result.joints);
    expect(m[2] ?? 0).toBeCloseTo(0, PLACES);
    expect(m[6] ?? 0).toBeCloseTo(0, PLACES);
    expect(m[10] ?? 0).toBeCloseTo(-1, PLACES);
  });

  it('не сдвигает точку фланца', () => {
    const before = flangePose(chain, HOME);

    const result = alignToolDown(chain, HOME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.x).toBeCloseTo(before.x, PLACES);
    expect(after.y).toBeCloseTo(before.y, PLACES);
    expect(after.z).toBeCloseTo(before.z, PLACES);
  });
});

describe('отказ', () => {
  it('недостижимый шаг не меняет углы и объясняет причину', () => {
    const result = jogPose(chain, HOME, 'world', 'x', 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unreachable');
  });
});

describe('точная поза', () => {
  it('приводит фланец в заданную точку', () => {
    const target = { ...flangePose(chain, HOME), z: (flangePose(chain, HOME).z ?? 0) - 0.05 };

    const result = jogToPose(chain, HOME, target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.z).toBeCloseTo(target.z, PLACES);
  });
});
```

- [x] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run packages/sim-core/src/kinematics/jog.test.ts`
Expected: FAIL — модуль `./jog` не найден.

- [x] **Step 3: Написать модуль**

Создать `packages/sim-core/src/kinematics/jog.ts`:

```ts
import type { Pose } from '../program/ast';
import { forwardKinematics, type KinematicChain } from './chain';
import { solveIk } from './ik';
import {
  fromAxisAngle,
  fromTranslation,
  multiply,
  poseOf,
  translationOf,
  type Matrix4,
} from './transform';

/**
 * Ручное управление в декартовых координатах: шаг фланца по одной оси, переход
 * в заданную позу и постановка инструмента вертикально.
 *
 * Шаг считается матрицами и переводится в позу только на входе в обратную
 * задачу. Углы RPY по дороге не накапливаются: исходная матрица каждый раз
 * берётся прямой задачей от текущих суставов. Поэтому у `ry = ±90°`, где
 * разложение на углы вырождается, рука всё равно едет ровно.
 */

/** В какой системе координат понимать шаг. */
export type JogFrame = 'world' | 'flange';

export type JogAxis = 'x' | 'y' | 'z' | 'rx' | 'ry' | 'rz';

export type JogResult =
  | { readonly ok: true; readonly joints: readonly number[] }
  | { readonly ok: false; readonly reason: 'unreachable' };

/** «Инструмент вниз» — поворот на 180° вокруг X, ось Z смотрит в стол. */
const TOOL_DOWN = { rx: Math.PI, ry: 0, rz: 0 } as const;

/**
 * Шаг фланца по одной оси. Линейные оси в метрах, угловые в радианах.
 *
 * Неудавшийся шаг не применяется вовсе: углы остаются прежними. Частичного
 * доползания нет — на пульте робот в такой ситуации тоже просто стоит.
 */
export function jogPose(
  chain: KinematicChain,
  joints: readonly number[],
  frame: JogFrame,
  axis: JogAxis,
  delta: number,
): JogResult {
  const current = forwardKinematics(chain, joints);
  const target =
    frame === 'world' ? stepInWorld(current, axis, delta) : stepInFlange(current, axis, delta);

  return reach(chain, poseOf(target), joints);
}

/** Переход в заданную позу целиком: точный ввод числа в панели. */
export function jogToPose(
  chain: KinematicChain,
  joints: readonly number[],
  pose: Pose,
): JogResult {
  return reach(chain, pose, joints);
}

/** Ориентация меняется на «ось Z вниз», точка фланца остаётся на месте. */
export function alignToolDown(chain: KinematicChain, joints: readonly number[]): JogResult {
  const point = translationOf(forwardKinematics(chain, joints));
  return reach(chain, { ...point, ...TOOL_DOWN }, joints);
}

function reach(chain: KinematicChain, target: Pose, seed: readonly number[]): JogResult {
  const solved = solveIk(chain, target, seed);
  return solved.ok ? { ok: true, joints: solved.joints } : { ok: false, reason: 'unreachable' };
}

function stepInWorld(current: Matrix4, axis: JogAxis, delta: number): Matrix4 {
  if (isLinear(axis)) {
    return multiply(fromTranslation(along(axis, delta)), current);
  }

  // Ось поворота проводим через фланец, а не через основание робота: без
  // сопряжения «поверни инструмент» уводило бы руку по дуге через всю зону.
  const point = translationOf(current);
  const spin = fromAxisAngle(along(angular(axis), 1), delta);
  const back = fromTranslation({ x: -point.x, y: -point.y, z: -point.z });

  return multiply(multiply(fromTranslation(point), multiply(spin, back)), current);
}

function stepInFlange(current: Matrix4, axis: JogAxis, delta: number): Matrix4 {
  return isLinear(axis)
    ? multiply(current, fromTranslation(along(axis, delta)))
    : multiply(current, fromAxisAngle(along(angular(axis), 1), delta));
}

function isLinear(axis: JogAxis): axis is 'x' | 'y' | 'z' {
  return axis === 'x' || axis === 'y' || axis === 'z';
}

/** Ось поворота: у `rx` это `x`. */
function angular(axis: 'rx' | 'ry' | 'rz'): 'x' | 'y' | 'z' {
  if (axis === 'rx') return 'x';
  return axis === 'ry' ? 'y' : 'z';
}

function along(axis: 'x' | 'y' | 'z', amount: number): { x: number; y: number; z: number } {
  return {
    x: axis === 'x' ? amount : 0,
    y: axis === 'y' ? amount : 0,
    z: axis === 'z' ? amount : 0,
  };
}
```

- [x] **Step 4: Экспортировать из пакета**

В `packages/sim-core/src/index.ts` после блока `export { solveIk, ... } from './kinematics/ik';` добавить:

```ts
export {
  alignToolDown,
  jogPose,
  jogToPose,
  type JogAxis,
  type JogFrame,
  type JogResult,
} from './kinematics/jog';
```

- [x] **Step 5: Прогнать тесты**

Run: `npx vitest run packages/sim-core/src/kinematics/jog.test.ts`
Expected: PASS, 8 тестов.

- [x] **Step 6: Коммит**

```bash
git add packages/sim-core/src/kinematics/jog.ts packages/sim-core/src/kinematics/jog.test.ts packages/sim-core/src/index.ts
git commit -m "feat: шаг фланца по осям, точная поза и постановка инструмента вниз"
```

---

## Task 2: Оси инструмента и основания

**Files:**
- Create: `components/simulator/axes-triad.tsx`

- [x] **Step 1: Написать компонент**

Создать `components/simulator/axes-triad.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { forwardKinematics, type KinematicChain } from '@prompower/sim-core';

/**
 * Оси координат в сцене: X красная, Y зелёная, Z синяя.
 *
 * Ориентация берётся матрицей прямой задачи, а не углами RPY: у `ry = ±90°`
 * разложение на углы вырождается, и стрелки прыгали бы там, где рука едет
 * ровно. Матрица приходит из той же функции, по которой считаются числа в
 * панели, — иначе стрелки показывали бы одно, а числа другое.
 */

const ORIGIN = new Vector3(0, 0, 0);

const AXES = [
  { direction: new Vector3(1, 0, 0), color: 0xe0564a },
  { direction: new Vector3(0, 1, 0), color: 0x5ac46b },
  { direction: new Vector3(0, 0, 1), color: 0x4a8fe0 },
] as const;

/**
 * Робот в сцене повёрнут на −90° вокруг X (`use-urdf-robot.ts`), потому что
 * URDF считает вверх по Z, а three.js — по Y. Всё, что ставится по координатам
 * симулятора, живёт внутри такой же группы.
 */
function SimFrame({ children }: { children: React.ReactNode }) {
  return <group rotation={[-Math.PI / 2, 0, 0]}>{children}</group>;
}

function Triad({ size }: { size: number }) {
  return (
    <>
      {AXES.map(({ direction, color }) => (
        <arrowHelper
          key={color}
          args={[direction, ORIGIN, size, color, size * 0.28, size * 0.16]}
        />
      ))}
    </>
  );
}

/** Оси инструмента: показывают, куда смотрит фланец. */
export function FlangeTriad({
  chain,
  values,
  size,
}: {
  chain: KinematicChain;
  values: readonly number[];
  size: number;
}) {
  const placement = useMemo(() => {
    // Наши матрицы построчные, `fromArray` читает по столбцам — отсюда транспонирование.
    const matrix = new Matrix4().fromArray([...forwardKinematics(chain, values)]).transpose();
    const position = new Vector3();
    const quaternion = new Quaternion();
    matrix.decompose(position, quaternion, new Vector3());
    return { position, quaternion };
  }, [chain, values]);

  return (
    <SimFrame>
      <group position={placement.position} quaternion={placement.quaternion}>
        <Triad size={size} />
      </group>
    </SimFrame>
  );
}

/** Оси основания: показывают, относительно чего считаются числа в системе мира. */
export function BaseTriad({ size }: { size: number }) {
  return (
    <SimFrame>
      <Triad size={size} />
    </SimFrame>
  );
}
```

- [x] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

- [x] **Step 3: Коммит**

```bash
git add components/simulator/axes-triad.tsx
git commit -m "feat: оси инструмента и основания в сцене"
```

---

## Task 3: Строки интерфейса

**Files:**
- Modify: `messages/ru.json`
- Modify: `messages/en.json`

- [x] **Step 1: Добавить русские строки**

В `messages/ru.json` внутри `lesson.teach` добавить ключ `blocked` в `hint` и новые ключи рядом с `flange`:

```json
"teach": {
  "title": "Показать роботу точку",
  "hint": {
    "ok": "Двигайте ползунки — серая копия покажет, куда приедет робот.",
    "clamped": "Записанные углы выходят за пределы робота: копия встала в ближайшую возможную позу.",
    "unreachable": "Записанная точка недостижима: копия стоит в текущей позе робота.",
    "blocked": "Дальше не достаёт: шаг не применён, копия осталась на месте."
  },
  "flange": "Фланец",
  "save": "Сохранить",
  "cancel": "Отмена",
  "tab": {
    "joints": "Суставы",
    "cartesian": "Координаты"
  },
  "frame": {
    "label": "Система координат",
    "world": "Мир",
    "flange": "Фланец"
  },
  "step": "Шаг",
  "alignDown": "Инструмент вниз",
  "alignDownNote": "Учебная кнопка. На промышленном пульте ориентацию набирают вручную или через систему координат."
}
```

В том же файле в `lesson.unit` добавить единицы:

```json
"unit": {
  "seconds": "с",
  "millimetres": "мм",
  "degrees": "°"
}
```

- [x] **Step 2: Добавить английские строки**

В `messages/en.json` внутри `lesson.teach`:

```json
"teach": {
  "title": "Teach the robot a point",
  "hint": {
    "ok": "Drag the sliders — the grey copy shows where the robot will go.",
    "clamped": "The stored angles are past the robot's limits: the copy stands at the closest pose it can reach.",
    "unreachable": "The stored point is out of reach: the copy starts from the current pose.",
    "blocked": "Out of reach: the step was not applied, the copy stayed put."
  },
  "flange": "Flange",
  "save": "Save",
  "cancel": "Cancel",
  "tab": {
    "joints": "Joints",
    "cartesian": "Coordinates"
  },
  "frame": {
    "label": "Coordinate system",
    "world": "World",
    "flange": "Flange"
  },
  "step": "Step",
  "alignDown": "Tool down",
  "alignDownNote": "A training button. On an industrial pendant you set orientation by hand or through a coordinate system."
}
```

И в `lesson.unit` того же файла:

```json
"unit": {
  "seconds": "s",
  "millimetres": "mm",
  "degrees": "°"
}
```

- [x] **Step 3: Коммит**

```bash
git add messages/ru.json messages/en.json
git commit -m "feat: строки панели координат"
```

---

## Task 4: Панель координат

**Files:**
- Create: `components/simulator/cartesian-panel.tsx`

- [x] **Step 1: Написать панель**

Создать `components/simulator/cartesian-panel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { fieldsFromJoints } from '@prompower/blocks';
import type { JogAxis, JogFrame, KinematicChain, Pose } from '@prompower/sim-core';

/**
 * Ручное управление в декартовых координатах: подвод кнопками и точный ввод.
 *
 * Числа всегда показывают позу в системе мира — так же, как на промышленном
 * пульте. Переключатель системы координат меняет только то, куда поедут кнопки
 * `−` и `+`: по осям мира или по осям инструмента.
 */

const MM = 0.001;
const DEG = Math.PI / 180;

/** Шаги подвода: линейные в миллиметрах, угловые в градусах. */
const LINEAR_STEPS = [1, 10, 100] as const;
const ANGULAR_STEPS = [1, 5, 15] as const;
const DEFAULT_STEP = 1;

const LINEAR_AXES = ['x', 'y', 'z'] as const;
const ANGULAR_AXES = ['rx', 'ry', 'rz'] as const;

/** Имя поля позы для оси: у `rx` это `RX`. */
function fieldOf(axis: JogAxis): string {
  return axis.toUpperCase();
}

export function CartesianPanel({
  chain,
  values,
  onJog,
  onPose,
  onAlignDown,
}: {
  chain: KinematicChain;
  values: readonly number[];
  onJog: (frame: JogFrame, axis: JogAxis, delta: number) => void;
  onPose: (pose: Pose) => void;
  onAlignDown: () => void;
}) {
  const t = useTranslations('lesson');
  const [frame, setFrame] = useState<JogFrame>('world');
  const [step, setStep] = useState(DEFAULT_STEP);

  // Ровно те числа, что уедут в блок по «Сохранить»: считать их здесь отдельно
  // значило бы показывать одно, а записывать другое.
  const shown = fieldsFromJoints('pose', values, chain);

  /** Поза из показанных чисел с заменой одной оси. Миллиметры и градусы — в СИ. */
  const poseWith = (axis: JogAxis, display: number): Pose => {
    const next = { ...shown, [fieldOf(axis)]: display };
    return {
      x: (next.X ?? 0) * MM,
      y: (next.Y ?? 0) * MM,
      z: (next.Z ?? 0) * MM,
      rx: (next.RX ?? 0) * DEG,
      ry: (next.RY ?? 0) * DEG,
      rz: (next.RZ ?? 0) * DEG,
    };
  };

  const rows = [
    ...LINEAR_AXES.map((axis) => ({
      axis: axis satisfies JogAxis,
      unit: t('unit.millimetres'),
      delta: LINEAR_STEPS[step] ?? 1,
      si: MM,
    })),
    ...ANGULAR_AXES.map((axis) => ({
      axis: axis satisfies JogAxis,
      unit: t('unit.degrees'),
      delta: ANGULAR_STEPS[step] ?? 1,
      si: DEG,
    })),
  ];

  return (
    <div data-testid="cartesian-panel" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-ink-faint">{t('teach.frame.label')}</span>
        <div className="flex gap-1">
          {(['world', 'flange'] as const).map((option) => (
            <button
              key={option}
              type="button"
              data-testid={`frame-${option}`}
              aria-pressed={frame === option}
              onClick={() => setFrame(option)}
              className={
                frame === option
                  ? 'rounded-panel border border-brand/50 bg-brand/15 px-2 py-1 text-xs text-ink'
                  : 'rounded-panel border border-line px-2 py-1 text-xs text-ink-dim hover:text-ink'
              }
            >
              {t(`teach.frame.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-ink-faint">{t('teach.step')}</span>
        <div className="flex gap-1">
          {LINEAR_STEPS.map((millimetres, index) => (
            <button
              key={millimetres}
              type="button"
              data-testid={`step-${index}`}
              aria-pressed={step === index}
              onClick={() => setStep(index)}
              className={
                step === index
                  ? 'rounded-panel border border-brand/50 bg-brand/15 px-2 py-1 font-mono text-xs text-ink'
                  : 'rounded-panel border border-line px-2 py-1 font-mono text-xs text-ink-dim hover:text-ink'
              }
            >
              {millimetres}/{ANGULAR_STEPS[index]}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map(({ axis, unit, delta, si }) => (
          <li key={axis} className="flex items-center gap-2">
            <span className="w-8 font-mono text-xs text-ink-dim">{fieldOf(axis)}</span>

            <button
              type="button"
              data-testid={`jog-${axis}-minus`}
              onClick={() => onJog(frame, axis, -delta * si)}
              className="rounded-panel border border-line px-2 py-1 font-mono text-xs text-ink-dim hover:text-ink"
            >
              −
            </button>

            <input
              type="number"
              data-testid={`axis-${fieldOf(axis)}`}
              value={shown[fieldOf(axis)] ?? 0}
              onChange={(event) => onPose(poseWith(axis, event.target.valueAsNumber))}
              className="w-20 rounded-panel border border-line bg-transparent px-2 py-1 text-right font-mono text-xs tabular-nums text-ink"
            />

            <button
              type="button"
              data-testid={`jog-${axis}-plus`}
              onClick={() => onJog(frame, axis, delta * si)}
              className="rounded-panel border border-line px-2 py-1 font-mono text-xs text-ink-dim hover:text-ink"
            >
              +
            </button>

            <span className="text-xs text-ink-faint">{unit}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          data-testid="teach-align-down"
          onClick={onAlignDown}
          className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink hover:bg-brand/10"
        >
          {t('teach.alignDown')}
        </button>
        <p className="text-xs text-ink-faint">{t('teach.alignDownNote')}</p>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

- [x] **Step 3: Коммит**

```bash
git add components/simulator/cartesian-panel.tsx
git commit -m "feat: панель ручного управления в декартовых координатах"
```

---

## Task 5: Вкладки и проводка на экране урока

**Files:**
- Modify: `components/simulator/teach-panel.tsx`
- Modify: `components/simulator/lesson-workspace.tsx`

- [x] **Step 1: Вкладки в панели показа**

Заменить содержимое `components/simulator/teach-panel.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  jointLimits,
  type JogAxis,
  type JogFrame,
  type JointDescriptor,
  type KinematicChain,
  type Pose,
} from '@prompower/sim-core';
import { fieldsFromJoints, type SeedNote } from '@prompower/blocks';
import { CartesianPanel } from './cartesian-panel';
import { JointPanel } from './joint-panel';

/**
 * Панель показа точки: ручное управление, двигающее серую копию, а не робота.
 *
 * Две вкладки повторяют экран ручного управления промышленного пульта: суставы
 * по отдельности и поза фланца в координатах.
 */

/** Что стало с позой копии. `blocked` — последний шаг не прошёл. */
export type TeachNote = SeedNote | 'blocked';

type Tab = 'joints' | 'cartesian';

export function TeachPanel({
  joints,
  chain,
  values,
  note,
  onChange,
  onJog,
  onPose,
  onAlignDown,
  onSave,
  onCancel,
}: {
  joints: readonly JointDescriptor[];
  chain: KinematicChain;
  values: readonly number[];
  /** Что стало с показанной точкой: об этом надо сказать человеку. */
  note: TeachNote;
  onChange: (index: number, radians: number) => void;
  onJog: (frame: JogFrame, axis: JogAxis, delta: number) => void;
  onPose: (pose: Pose) => void;
  onAlignDown: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('lesson');
  const [tab, setTab] = useState<Tab>('joints');

  // Пределы ползунков — те же, по которым зажимается показанная поза: два
  // разбора одного URDF разошлись бы молча, и ползунок разрешил бы недоступное.
  const limits = useMemo(() => jointLimits(chain), [chain]);

  // Ровно те числа, которые уедут в блок по «Сохранить». Считать их здесь
  // отдельно значило бы показывать одно, а записывать другое.
  const flange = useMemo(() => fieldsFromJoints('pose', values, chain), [values, chain]);

  return (
    <section data-testid="teach-panel" className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium">{t('teach.title')}</h2>
        <p className="mt-1 text-sm text-ink-dim">{t(`teach.hint.${note}`)}</p>
      </div>

      <p data-testid="teach-flange" className="font-mono text-xs tabular-nums text-ink-faint">
        {t('teach.flange')} X {flange.X} Y {flange.Y} Z {flange.Z}
      </p>

      <div className="flex gap-1">
        {(['joints', 'cartesian'] as const).map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`teach-tab-${option}`}
            aria-pressed={tab === option}
            onClick={() => setTab(option)}
            className={
              tab === option
                ? 'rounded-panel border border-brand/50 bg-brand/15 px-2 py-1 text-xs text-ink'
                : 'rounded-panel border border-line px-2 py-1 text-xs text-ink-dim hover:text-ink'
            }
          >
            {t(`teach.tab.${option}`)}
          </button>
        ))}
      </div>

      {tab === 'joints' ? (
        <JointPanel joints={joints} limits={limits} values={values} onChange={onChange} />
      ) : (
        <CartesianPanel
          chain={chain}
          values={values}
          onJog={onJog}
          onPose={onPose}
          onAlignDown={onAlignDown}
        />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="teach-save"
          onClick={onSave}
          className="rounded-panel border border-brand/50 bg-brand/15 px-3 py-1.5 text-sm text-ink hover:bg-brand/25"
        >
          {t('teach.save')}
        </button>
        <button
          type="button"
          data-testid="teach-cancel"
          onClick={onCancel}
          className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
        >
          {t('teach.cancel')}
        </button>
      </div>
    </section>
  );
}
```

- [x] **Step 2: Обработчики жога на экране урока**

В `components/simulator/lesson-workspace.tsx`:

Заменить импорт `sim-core` и добавить импорты триад и типа заметки:

```tsx
import {
  alignToolDown,
  jogPose,
  jogToPose,
  type JogAxis,
  type JogFrame,
  type Pose,
  type Program,
  type RobotPlugin,
  type Task,
} from '@prompower/sim-core';
import { BaseTriad, FlangeTriad } from './axes-triad';
import { TeachPanel, type TeachNote } from './teach-panel';
```

Импорт `import { TeachPanel } from './teach-panel';` при этом убрать, а из импорта `@prompower/blocks` убрать `type SeedNote` (он больше не нужен — заметку описывает `TeachNote`).

В интерфейсе `Teaching` заменить тип поля `note`:

```tsx
interface Teaching {
  readonly kind: TeachKind;
  readonly joints: readonly number[];
  readonly note: TeachNote;
  /** Куда вернуть показанное: замыкание на тот самый блок в редакторе. */
  readonly write: (fields: TeachFields) => void;
}
```

После `moveTeaching` добавить три обработчика:

```tsx
/** Общая часть: результат шага либо кладём в позу, либо говорим, что не достаём. */
const applyJog = (compute: (joints: readonly number[]) => JogResult): void => {
  setTeaching((current) => {
    if (current === null) return null;

    const result = compute(current.joints);
    // Копия уже там, куда её привели: прежняя оговорка с этого момента неверна.
    return result.ok
      ? { ...current, joints: result.joints, note: 'ok' }
      : { ...current, note: 'blocked' };
  });
};

const jogTeaching = (frame: JogFrame, axis: JogAxis, delta: number): void => {
  applyJog((joints) => jogPose(chain, joints, frame, axis, delta));
};

const poseTeaching = (pose: Pose): void => {
  applyJog((joints) => jogToPose(chain, joints, pose));
};

const alignTeaching = (): void => {
  applyJog((joints) => alignToolDown(chain, joints));
};
```

Добавить `type JogResult` в импорт из `@prompower/sim-core`.

Передать обработчики в `TeachPanel`:

```tsx
<TeachPanel
  joints={plugin.joints}
  chain={chain}
  values={teaching.joints}
  note={teaching.note}
  onChange={moveTeaching}
  onJog={jogTeaching}
  onPose={poseTeaching}
  onAlignDown={alignTeaching}
  onSave={saveTeaching}
  onCancel={() => setTeaching(null)}
/>
```

(Существующие пропсы `onSave` и `onCancel` оставить как есть — здесь показаны для полноты вызова.)

- [x] **Step 3: Показать оси в сцене**

В том же файле внутри `<RobotViewer>` рядом с `GhostRobot` добавить триады. Размер осей берём от габаритов робота, чтобы стрелки не тонули в модели и не заслоняли сцену:

```tsx
{teaching !== null && (
  <>
    <GhostRobot source={model.robot} jointNames={jointNames} values={teaching.joints} />
    <FlangeTriad chain={chain} values={teaching.joints} size={bounds.radius * 0.25} />
    <BaseTriad size={bounds.radius * 0.25} />
  </>
)}
```

`bounds.radius` — радиус описывающей сферы модели в метрах (`RobotBounds` в
[fit-robot.ts](../../../components/simulator/fit-robot.ts)); по нему же
`RobotViewer` считает дистанцию камеры. Размер осей берём долей габарита, а не
константой в метрах: у Zu 3 и Zu 20 разный масштаб, и стрелка в 10 см у одного
потеряется, а у другого закроет сцену.

- [x] **Step 4: Проверить типы и тесты**

Run: `npm run typecheck && npm test`
Expected: typecheck без вывода, тесты PASS.

- [x] **Step 5: Коммит**

```bash
git add components/simulator/teach-panel.tsx components/simulator/lesson-workspace.tsx
git commit -m "feat: вкладка координат и оси инструмента на экране урока"
```

---

## Task 6: Сквозной сценарий

**Files:**
- Modify: `tests/e2e/lesson.spec.ts`

- [x] **Step 1: Написать тесты**

Добавить в конец `tests/e2e/lesson.spec.ts`:

```ts
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
  await page.getByTestId('step-1').click();
  await page.getByTestId('jog-z-plus').click();

  await expect
    .poll(async () => Number(await page.getByTestId('axis-Z').inputValue()))
    .toBeGreaterThan(before);
});

test('кнопка «инструмент вниз» ставит инструмент вертикально', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.getByTestId('teach-tab-cartesian').click();
  await page.getByTestId('teach-align-down').click();

  // Обратная задача обещает 0.01 рад по ориентации, поэтому сверяем с запасом
  // в градус. Знак не важен: 180 и −180 — одна и та же ориентация.
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

  // Программа осталась исполнимой: показанная поза достижима по построению.
  await page.getByTestId('play').click();
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 40_000 });
});
```

Вердикт ищется по `data-testid="verdict"` — тому же, что в существующих тестах
прогона. Проверяем именно появление вердикта, а не зачёт: показанная кнопкой
поза может не довести деталь до зоны, и это нормально. Недопустимо другое —
ошибка исполнения.

- [x] **Step 2: Прогнать**

Run: `npx playwright test tests/e2e/lesson.spec.ts`
Expected: PASS, прежние 14 тестов урока плюс 4 новых.

- [x] **Step 3: Коммит**

```bash
git add tests/e2e/lesson.spec.ts
git commit -m "test: сквозной набор перпендикуляра в координатах"
```

---

## Task 7: Проверка целиком

**Files:** нет

- [x] **Step 1: Типы**

Run: `npm run typecheck`
Expected: без вывода.

- [x] **Step 2: Unit**

Run: `npm test`
Expected: PASS, не меньше прежних 337 тестов плюс 8 новых.

- [x] **Step 3: E2E**

Run: `npx playwright test`
Expected: PASS, прежние 22 плюс 4 новых.

- [ ] **Step 4: Посмотреть глазами**

Открыть урок, показать точку, перейти на вкладку «Координаты». Проверить:
пошаговый подвод по X/Y/Z работает в обеих системах координат; поворот не
уводит руку по дуге; кнопка «инструмент вниз» ставит инструмент вертикально;
триада на фланце совпадает с числами в панели; недостижимый шаг даёт внятную
оговорку и не двигает копию.

- [ ] **Step 5: Закрыть ветку**

Использовать `superpowers:finishing-a-development-branch`.
