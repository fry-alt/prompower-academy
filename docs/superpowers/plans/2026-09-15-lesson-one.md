# Первый урок: знакомство с коботом — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Курс открывается уроком 1, где робота приводят в заданную позу ползунками суставов — без блоков и без прогона программы.

**Architecture:** В `sim-core` появляются две цели о текущем состоянии (`jointsAtPose`, `flangeAtPoint`) и точка входа `checkGoals`, возвращающая статус каждой цели. Задание объявляет режим полем `mode` в `task.json`; экран урока разводит режимы отдельными компонентами, чтобы хуки прогона и ручного режима не вызывались условно. Память о взятых целях — чистая функция-храповик, проверяемая unit-тестом без React.

**Tech Stack:** TypeScript strict, Vitest (node), React 19 + @react-three/fiber, next-intl, Playwright.

Источник требований: [спека](../specs/2026-09-15-lesson-one-design.md), §7 брифа.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/sim-core/src/validators/task.ts` | изменяется: режим задания, разбор двух новых целей |
| `packages/sim-core/src/validators/task.test.ts` | новый: разбор задания и его ошибки |
| `packages/sim-core/src/validators/check.ts` | изменяется: `checkGoals`, проверки новых целей, аргумент `chain` |
| `packages/sim-core/src/index.ts` | изменяется: экспорт `checkGoals`, `GoalStatus`, `TaskMode` |
| `components/simulator/goal-ratchet.ts` | новый: храповик взятых целей (чистая функция) |
| `components/simulator/goal-ratchet.test.ts` | новый |
| `components/simulator/scene-frame.ts` | новый: пересчёт координат URDF → three, вынесен из `scene-objects.tsx` |
| `components/simulator/target-point.tsx` | новый: метка целевой точки в сцене |
| `components/simulator/use-jog-task.ts` | новый: углы, статусы целей, храповик, сброс |
| `components/lesson/task-brief.tsx` | новый: список целей, вердикт и подсказки — вынесены из `lesson-workspace.tsx` |
| `components/simulator/jog-lesson.tsx` | новый: экран ручного урока |
| `components/simulator/lesson-workspace.tsx` | изменяется: разводка по режиму, `TaskBrief` переезжает в свой файл |
| `lib/content.ts` | изменяется: `starter.json` необязателен |
| `messages/ru.json`, `messages/en.json` | изменяются: строки новых целей и ручного урока |
| `content/.../01-znakomstvo-s-kobotom/` | новый: теория, задание, сценарий обучения |
| `tests/sim/lesson-one.test.ts` | новый: задание урока проходится эталонными углами |
| `tests/e2e/lesson-one.spec.ts` | новый: урок проходится ползунками в браузере |

Ветка уже создана: `feat/lesson-one`.

---

### Task 1: Режим задания в разборе

**Files:**
- Create: `packages/sim-core/src/validators/task.test.ts`
- Modify: `packages/sim-core/src/validators/task.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `packages/sim-core/src/validators/task.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseTask, TaskParseError } from './task';

const MINIMAL = {
  id: 'проба',
  world: { objects: [] },
  goals: [{ type: 'gripperState', state: 'open' }],
};

describe('режим задания', () => {
  it('по умолчанию задание решается программой', () => {
    expect(parseTask(MINIMAL).mode).toBe('program');
  });

  it('ручной режим объявляется полем', () => {
    expect(parseTask({ ...MINIMAL, mode: 'jog' }).mode).toBe('jog');
  });

  it('незнакомый режим отвергается с указанием места', () => {
    expect(() => parseTask({ ...MINIMAL, mode: 'blockly' })).toThrow(TaskParseError);
    expect(() => parseTask({ ...MINIMAL, mode: 'blockly' })).toThrow(/task\.mode/);
  });

  it('ограничение на размер программы в ручном задании — ошибка содержания', () => {
    expect(() =>
      parseTask({ ...MINIMAL, mode: 'jog', constraints: [{ type: 'maxStatements', value: 5 }] }),
    ).toThrow(/ограничивать нечего/);
  });

  it('в программном задании то же ограничение разбирается как прежде', () => {
    const task = parseTask({ ...MINIMAL, constraints: [{ type: 'maxStatements', value: 5 }] });
    expect(task.constraints).toEqual([{ type: 'maxStatements', value: 5 }]);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/sim-core/src/validators/task.test.ts`
Expected: FAIL — `Property 'mode' does not exist on type 'Task'`.

- [ ] **Step 3: Реализовать**

В `packages/sim-core/src/validators/task.ts` добавить тип и поле:

```ts
/** Чем ученик решает задание: программой из блоков или ползунками суставов. */
export type TaskMode = 'program' | 'jog';

export interface Task {
  readonly id: string;
  readonly mode: TaskMode;
  readonly world: TaskWorld;
  readonly goals: readonly Goal[];
  readonly constraints: readonly Constraint[];
  readonly hints: readonly Hint[];
}
```

В `parseTask` разобрать режим и запретить ограничения в ручном задании:

```ts
export function parseTask(input: unknown): Task {
  const root = asRecord(input, 'task');
  const mode = parseMode(root['mode']);

  const constraints = optionalArray(root['constraints'], 'task.constraints').map((item, index) =>
    parseConstraint(item, `task.constraints[${index}]`),
  );

  // Ручное задание решается руками: инструкций нет, и ограничивать в нём нечего.
  // Молча пропустить такое ограничение значит показать ученику требование,
  // которое никогда не проверяется.
  if (mode === 'jog' && constraints.length > 0) {
    throw new TaskParseError('task.constraints', 'в ручном задании нет программы: ограничивать нечего');
  }

  return {
    id: asNonEmptyString(root['id'], 'task.id'),
    mode,
    world: parseWorld(root['world'], 'task.world'),
    goals: asArray(root['goals'], 'task.goals').map((goal, index) =>
      parseGoal(goal, `task.goals[${index}]`),
    ),
    constraints,
    hints: optionalArray(root['hints'], 'task.hints').map((item, index) =>
      parseHint(item, `task.hints[${index}]`),
    ),
  };
}

/** Режим не указан — задание программное: так написаны все уроки до первого. */
function parseMode(input: unknown): TaskMode {
  if (input === undefined) return 'program';
  if (input === 'program' || input === 'jog') return input;

  throw new TaskParseError('task.mode', `ожидалось program или jog, получено «${String(input)}»`);
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run packages/sim-core/src/validators/task.test.ts`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Прогнать весь набор и typecheck**

Run: `npm test && npm run typecheck`
Expected: всё зелёное — поле необязательное, старые задания не менялись.

- [ ] **Step 6: Коммит**

```bash
git add packages/sim-core/src/validators/task.ts packages/sim-core/src/validators/task.test.ts
git commit -m "feat: задание объявляет режим — программа или ползунки"
```

---

### Task 2: Цель «поза суставов»

**Files:**
- Modify: `packages/sim-core/src/validators/task.ts`, `packages/sim-core/src/validators/check.ts`
- Test: `packages/sim-core/src/validators/task.test.ts`, `packages/sim-core/src/validators/check.test.ts`

- [ ] **Step 1: Написать падающие тесты разбора**

Добавить в конец `packages/sim-core/src/validators/task.test.ts`:

```ts
describe('цель «поза суставов»', () => {
  const goal = { type: 'jointsAtPose', joints: [0, 1.5, 0, 0, 0, 0], tolerance: 0.05 };

  it('разбирается', () => {
    expect(parseTask({ ...MINIMAL, goals: [goal] }).goals[0]).toEqual(goal);
  });

  it('поза без суставов ничего не задаёт', () => {
    expect(() => parseTask({ ...MINIMAL, goals: [{ ...goal, joints: [] }] })).toThrow(
      /поза без суставов/,
    );
  });

  it('допуск обязателен', () => {
    expect(() => parseTask({ ...MINIMAL, goals: [{ type: 'jointsAtPose', joints: [0] }] })).toThrow(
      /task\.goals\[0\]\.tolerance/,
    );
  });

  it('нулевой допуск недостижим и потому отвергается', () => {
    expect(() => parseTask({ ...MINIMAL, goals: [{ ...goal, tolerance: 0 }] })).toThrow(
      /больше нуля/,
    );
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/sim-core/src/validators/task.test.ts`
Expected: FAIL — «неизвестная цель «jointsAtPose»».

- [ ] **Step 3: Реализовать разбор**

В `task.ts` добавить вариант в `Goal`:

```ts
  /** Робот стоит в заданной позе: каждый сустав в пределах допуска. */
  | {
      readonly type: 'jointsAtPose';
      /** Углы в радианах, по порядку суставов плагина. */
      readonly joints: readonly number[];
      /** Допуск по каждому суставу, радианы. */
      readonly tolerance: number;
    }
```

Вынести проверку допуска из `pointsVisited` в общую функцию — она теперь нужна трём целям:

```ts
/**
 * Допуск обязателен у всех целей, где он есть.
 *
 * Подразумевать его молча значит однажды поменять значение и незаметно сломать
 * все уроки, которые на него опирались.
 */
function parseTolerance(input: unknown, path: string): number {
  const tolerance = asNumber(input, path);
  if (tolerance <= 0) {
    throw new TaskParseError(path, `допуск должен быть больше нуля, получено ${tolerance}`);
  }
  return tolerance;
}
```

В `parseGoal` заменить тело `case 'pointsVisited'` на использование `parseTolerance` и добавить новый случай:

```ts
    case 'pointsVisited': {
      const points = asArray(record['points'], `${path}.points`).map((item, index) =>
        parseVec3(item, `${path}.points[${index}]`),
      );
      if (points.length === 0) {
        throw new TaskParseError(`${path}.points`, 'нужна хотя бы одна точка');
      }

      return { type, points, tolerance: parseTolerance(record['tolerance'], `${path}.tolerance`) };
    }

    case 'jointsAtPose': {
      const joints = asArray(record['joints'], `${path}.joints`).map((value, index) =>
        asNumber(value, `${path}.joints[${index}]`),
      );
      if (joints.length === 0) {
        throw new TaskParseError(`${path}.joints`, 'поза без суставов ничего не задаёт');
      }

      return { type, joints, tolerance: parseTolerance(record['tolerance'], `${path}.tolerance`) };
    }
```

- [ ] **Step 4: Прогнать разбор**

Run: `npx vitest run packages/sim-core/src/validators/task.test.ts`
Expected: PASS.

- [ ] **Step 5: Написать падающие тесты проверки**

Добавить в конец `packages/sim-core/src/validators/check.test.ts`:

```ts
describe('цель «поза суставов»', () => {
  const TARGET = [0, 1.571, 1.571, 0, 1.571, 0];

  const POSE: Task = parseTask({
    ...RAW_TASK,
    goals: [{ type: 'jointsAtPose', joints: TARGET, tolerance: 0.05 }],
    constraints: [],
  });

  const standing = (joints: readonly number[]) =>
    createWorld({ joints: [...joints], zones: [...POSE.world.zones] });

  it('засчитывает точное попадание', () => {
    expect(checkTask(POSE, SHORT, standing(TARGET), []).passed).toBe(true);
  });

  it('промах внутри допуска — это попадание', () => {
    const close = TARGET.map((value, index) => (index === 1 ? value + 0.04 : value));
    expect(checkTask(POSE, SHORT, standing(close), []).passed).toBe(true);
  });

  it('называет сустав, который дальше всех от цели', () => {
    const off = TARGET.map((value, index) => (index === 2 ? value + 0.35 : value));
    const result = checkTask(POSE, SHORT, standing(off), []);

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toBe('Сустав 3 не на месте: нужно 90°, сейчас 110° — разница 20°.');
  });

  it('полный оборот — та же поза', () => {
    const wrapped = TARGET.map((value, index) => (index === 0 ? value + Math.PI * 2 : value));
    expect(checkTask(POSE, SHORT, standing(wrapped), []).passed).toBe(true);
  });
});
```

- [ ] **Step 6: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/sim-core/src/validators/check.test.ts`
Expected: FAIL — в `checkGoal` нет ветки `jointsAtPose` (TypeScript пожалуется на неполный `switch`).

- [ ] **Step 7: Реализовать проверку**

В `check.ts` добавить импорт и ветку. Импорт:

```ts
import { normalizeAngle } from '../kinematics/joint-limits';
```

Ветка в `checkGoal`:

```ts
    case 'jointsAtPose':
      return checkJointsAtPose(goal, world);
```

Сама проверка:

```ts
/**
 * Поза против текущих углов.
 *
 * Разница считается через `normalizeAngle`: сустав, провернувшийся на полный
 * оборот, стоит там же, где стоял, и ученик, который до этого дошёл, прав.
 *
 * Называется один сустав — тот, что дальше всех. Список из шести строк ученику
 * читать нечем, а чинить всё равно надо с худшего.
 */
function checkJointsAtPose(
  goal: Goal & { type: 'jointsAtPose' },
  world: WorldState,
): string | null {
  if (goal.joints.length > world.joints.length) {
    return `Поза задания описывает ${goal.joints.length} суставов, а у робота их ${world.joints.length}.`;
  }

  let worst = -1;
  let error = 0;

  goal.joints.forEach((target, index) => {
    const actual = world.joints[index] ?? 0;
    const gap = Math.abs(normalizeAngle(actual - target));
    if (gap > error) {
      error = gap;
      worst = index;
    }
  });

  if (worst === -1 || error <= goal.tolerance) return null;

  return (
    `Сустав ${worst + 1} не на месте: нужно ${degrees(goal.joints[worst]!)}°, ` +
    `сейчас ${degrees(world.joints[worst] ?? 0)}° — разница ${degrees(error)}°.`
  );
}

/** Градусы для человека: минус типографский, как и в миллиметрах. */
function degrees(radians: number): string {
  const value = Math.round((radians * 180) / Math.PI);
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}
```

- [ ] **Step 8: Прогнать тесты**

Run: `npx vitest run packages/sim-core/src/validators/`
Expected: PASS.

- [ ] **Step 9: Коммит**

```bash
git add packages/sim-core/src/validators/
git commit -m "feat: цель урока — робот стоит в заданной позе"
```

---

### Task 3: Цель «фланец в точке» и аргумент `chain`

**Files:**
- Modify: `packages/sim-core/src/validators/task.ts`, `packages/sim-core/src/validators/check.ts`
- Modify (вызовы): `components/simulator/use-program-run.ts`, `packages/sim-core/src/validators/check.test.ts`, `tests/sim/pick-and-place.test.ts`, `tests/sim/three-points.test.ts`, `tests/sim/conveyor.test.ts`
- Test: `packages/sim-core/src/validators/task.test.ts`, `packages/sim-core/src/validators/check.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Добавить в `packages/sim-core/src/validators/task.test.ts`:

```ts
describe('цель «фланец в точке»', () => {
  const goal = { type: 'flangeAtPoint', point: { x: 0.43, y: 0.1, z: 0.4 }, tolerance: 0.04 };

  it('разбирается', () => {
    expect(parseTask({ ...MINIMAL, goals: [goal] }).goals[0]).toEqual(goal);
  });

  it('точка обязана быть точкой', () => {
    expect(() =>
      parseTask({ ...MINIMAL, goals: [{ ...goal, point: { x: 0.4, y: 0.1 } }] }),
    ).toThrow(/task\.goals\[0\]\.point\.z/);
  });

  it('допуск обязателен', () => {
    expect(() =>
      parseTask({ ...MINIMAL, goals: [{ type: 'flangeAtPoint', point: goal.point }] }),
    ).toThrow(/task\.goals\[0\]\.tolerance/);
  });
});
```

Добавить в `packages/sim-core/src/validators/check.test.ts` (рядом с остальными describe):

```ts
describe('цель «фланец в точке»', () => {
  // Цепь из одного звена: фланец сидит в метре по X от основания и
  // поворачивается первым суставом. Настоящая модель для проверки правила не
  // нужна — она проверяется в tests/sim на задании урока.
  const CHAIN: KinematicChain = {
    joints: [
      {
        name: 'joint_1',
        limit: { name: 'joint_1', type: 'revolute', lower: -Math.PI, upper: Math.PI },
        maxSpeed: 1,
        origin: IDENTITY,
        axis: { x: 0, y: 0, z: 1 },
      },
    ],
    baseOrigin: IDENTITY,
    toolOrigin: fromTranslation({ x: 1, y: 0, z: 0 }),
  };

  const AT_ZERO = { x: 1, y: 0, z: 0 };

  const POINT: Task = parseTask({
    ...RAW_TASK,
    goals: [{ type: 'flangeAtPoint', point: AT_ZERO, tolerance: 0.04 }],
    constraints: [],
  });

  const standing = (joints: readonly number[]) =>
    createWorld({ joints: [...joints], zones: [...POINT.world.zones] });

  it('засчитывает фланец в точке', () => {
    expect(checkTask(POINT, SHORT, standing([0]), [], CHAIN).passed).toBe(true);
  });

  it('называет расстояние до точки в миллиметрах', () => {
    const result = checkTask(POINT, SHORT, standing([Math.PI / 2]), [], CHAIN);

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toBe(
      'Инструмент в 1414 мм от точки: X 1000, Y 0, Z 0 мм.',
    );
  });
});
```

Дописать в шапку файла импорты:

```ts
import { fromTranslation, IDENTITY, type KinematicChain } from '../index';
```

Цепь собрана по `ChainJoint` из `packages/sim-core/src/kinematics/chain.ts`:
предел сустава лежит в поле `limit`, а неподвижная часть до фланца — в
`toolOrigin`. При угле 0 фланец стоит в точке цели, при π/2 — в метре по Y,
и расстояние между ними √2 м, откуда 1414 мм в ожидаемом тексте.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/sim-core/src/validators/`
Expected: FAIL — `checkTask` принимает 4 аргумента, цели `flangeAtPoint` нет.

- [ ] **Step 3: Реализовать разбор цели**

В `task.ts` добавить вариант `Goal`:

```ts
  /**
   * Фланец сейчас в заданной точке.
   *
   * Не то же, что `pointsVisited`: та читает журнал прогона («робот там
   * побывал»), эта смотрит на текущее состояние («робот там стоит»). В ручном
   * уроке журнала не существует вовсе.
   */
  | {
      readonly type: 'flangeAtPoint';
      /** Точка в координатах URDF, метры. */
      readonly point: Vec3;
      /** Допуск по расстоянию, метры. */
      readonly tolerance: number;
    }
```

и случай в `parseGoal`:

```ts
    case 'flangeAtPoint':
      return {
        type,
        point: parseVec3(record['point'], `${path}.point`),
        tolerance: parseTolerance(record['tolerance'], `${path}.tolerance`),
      };
```

- [ ] **Step 4: Реализовать проверку и провести `chain` в подпись**

В `check.ts`: импорт кинематики,

```ts
import { flangePose, type KinematicChain } from '../kinematics/chain';
```

подпись и передача дальше:

```ts
export function checkTask(
  task: Task,
  program: Program,
  world: WorldState,
  log: EventLog,
  chain: KinematicChain,
): CheckResult {
  const failures = [
    ...task.goals.map((goal) => checkGoal(goal, world, log, chain)),
    ...task.constraints.map((constraint) => checkConstraint(constraint, program)),
  ].filter((failure): failure is string => failure !== null);

  return { passed: failures.length === 0, failures };
}

function checkGoal(
  goal: Goal,
  world: WorldState,
  log: EventLog,
  chain: KinematicChain,
): string | null {
  switch (goal.type) {
    case 'objectInZone':
      return checkObjectInZone(goal, world, log);
    case 'gripperState':
      return checkGripperState(goal, world);
    case 'pointsVisited':
      return checkPointsVisited(goal, log);
    case 'jointsAtPose':
      return checkJointsAtPose(goal, world);
    case 'flangeAtPoint':
      return checkFlangeAtPoint(goal, world, chain);
  }
}
```

и сама проверка:

```ts
/**
 * Где фланец стоит сейчас — против точки задания.
 *
 * Прямая кинематика считается здесь, а не берётся из состояния мира: поза
 * фланца выводится из углов, и хранить её рядом с ними значило бы завести
 * второй источник правды об одном и том же.
 */
function checkFlangeAtPoint(
  goal: Goal & { type: 'flangeAtPoint' },
  world: WorldState,
  chain: KinematicChain,
): string | null {
  const actual = flangePose(chain, world.joints);
  const gap = distance(actual, goal.point);
  if (gap <= goal.tolerance) return null;

  return (
    `Инструмент в ${millimetres(gap)} мм от точки: ` +
    `X ${millimetres(goal.point.x)}, Y ${millimetres(goal.point.y)}, Z ${millimetres(goal.point.z)} мм.`
  );
}
```

- [ ] **Step 5: Найти все места вызова**

Run: `npm run typecheck`
Expected: FAIL со списком файлов, где `checkTask` зовут с четырьмя аргументами: `components/simulator/use-program-run.ts`, `packages/sim-core/src/validators/check.test.ts`, `tests/sim/pick-and-place.test.ts`, `tests/sim/three-points.test.ts`, `tests/sim/conveyor.test.ts`.

- [ ] **Step 6: Починить вызовы**

В `components/simulator/use-program-run.ts` — цепь уже есть аргументом хука:

```ts
  const check = useMemo(
    () => (run.status === 'running' ? null : checkTask(task, program, run.world, run.log, chain)),
    [run.status, run.world, run.log, task, program, chain],
  );
```

В `tests/sim/*.test.ts` во всех трёх файлах `chain` уже собран для планировщика — дописать его пятым аргументом в каждый вызов `checkTask`.

В `packages/sim-core/src/validators/check.test.ts` цепь не нужна ни одной из старых целей: добавить в импорт `EMPTY_CHAIN` из `../index` и дописать его пятым аргументом во все существующие вызовы.

- [ ] **Step 7: Прогнать всё**

Run: `npm run typecheck && npm test`
Expected: PASS, тестов стало больше на новые.

- [ ] **Step 8: Коммит**

```bash
git add packages/sim-core components/simulator/use-program-run.ts tests/sim
git commit -m "feat: цель урока — инструмент в заданной точке"
```

---

### Task 4: `checkGoals` — статус каждой цели

**Files:**
- Modify: `packages/sim-core/src/validators/check.ts`, `packages/sim-core/src/index.ts`
- Test: `packages/sim-core/src/validators/check.test.ts`

- [ ] **Step 1: Написать падающий тест**

Добавить в `packages/sim-core/src/validators/check.test.ts`:

```ts
describe('checkGoals', () => {
  it('отдаёт статус по каждой цели, а не общий вердикт', () => {
    const statuses = checkGoals(TASK, solved(), [{ kind: 'grasp', tick: 0, objectId: 'cube-1' }], EMPTY_CHAIN);

    expect(statuses).toHaveLength(2);
    expect(statuses.map((status) => status.failure)).toEqual([null, null]);
  });

  it('невыполненная цель приносит с собой объяснение', () => {
    const statuses = checkGoals(TASK, world(), [], EMPTY_CHAIN);

    expect(statuses[0]!.goal.type).toBe('objectInZone');
    expect(statuses[0]!.failure).toMatch(/её так и не взяли захватом/);
  });
});
```

Дописать `checkGoals` в импорт из `./check`.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/sim-core/src/validators/check.test.ts`
Expected: FAIL — `checkGoals` не экспортируется.

- [ ] **Step 3: Реализовать**

В `check.ts`:

```ts
/** Одна цель задания и то, что мешает её засчитать. */
export interface GoalStatus {
  readonly goal: Goal;
  /** Текст провала или `null`, если цель достигнута. */
  readonly failure: string | null;
}

/**
 * Статус каждой цели по отдельности.
 *
 * Экрану урока нужна отметка против строки, а не общий вердикт в конце:
 * в ручном задании цели берут одну за другой и видят это сразу.
 */
export function checkGoals(
  task: Task,
  world: WorldState,
  log: EventLog,
  chain: KinematicChain,
): readonly GoalStatus[] {
  return task.goals.map((goal) => ({ goal, failure: checkGoal(goal, world, log, chain) }));
}

export function checkTask(
  task: Task,
  program: Program,
  world: WorldState,
  log: EventLog,
  chain: KinematicChain,
): CheckResult {
  const failures = [
    ...checkGoals(task, world, log, chain).map((status) => status.failure),
    ...task.constraints.map((constraint) => checkConstraint(constraint, program)),
  ].filter((failure): failure is string => failure !== null);

  return { passed: failures.length === 0, failures };
}
```

- [ ] **Step 4: Открыть наружу**

В `packages/sim-core/src/index.ts` заменить строку экспорта валидаторов на:

```ts
export { checkGoals, checkTask, earnedHints, type CheckResult, type GoalStatus } from './validators/check';
```

и дописать `type TaskMode` в экспорт из `./validators/task`.

- [ ] **Step 5: Прогнать всё**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add packages/sim-core
git commit -m "feat: автопроверка отдаёт статус каждой цели"
```

---

### Task 5: Храповик взятых целей

**Files:**
- Create: `components/simulator/goal-ratchet.ts`, `components/simulator/goal-ratchet.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `components/simulator/goal-ratchet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { takeGoals } from './goal-ratchet';

describe('takeGoals', () => {
  it('берёт первую цель, когда она достигнута', () => {
    expect(takeGoals([false, false], [true, false])).toEqual([true, false]);
  });

  it('не берёт вторую цель раньше первой', () => {
    expect(takeGoals([false, false], [false, true])).toEqual([false, false]);
  });

  it('берёт вторую, когда первая уже взята', () => {
    expect(takeGoals([true, false], [false, true])).toEqual([true, true]);
  });

  it('взятую цель назад не отдаёт', () => {
    expect(takeGoals([true, false], [false, false])).toEqual([true, false]);
  });

  it('на пустом задании ничего не выдумывает', () => {
    expect(takeGoals([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run components/simulator/goal-ratchet.test.ts`
Expected: FAIL — файла `goal-ratchet.ts` нет.

- [ ] **Step 3: Реализовать**

Создать `components/simulator/goal-ratchet.ts`:

```ts
/**
 * Память о взятых целях ручного урока.
 *
 * Ядро проверяет состояние прямо сейчас: цель либо достигнута текущими углами,
 * либо нет. Памяти в нём нет намеренно — иначе валидатор перестал бы быть
 * чистой функцией. Помнит здесь урок, и помнит он две вещи.
 *
 * Первая: взятая цель назад не отдаётся. Ученик, сдвинувший ползунок дальше,
 * не должен терять зачёт за то, что уже сделал.
 *
 * Вторая: цели берутся подряд. Пока не взята предыдущая, следующая не
 * засчитывается, даже если ученик случайно в ней оказался, — урок ведёт по
 * шагам, а не раздаёт зачёты за совпадения.
 */
export function takeGoals(taken: readonly boolean[], reached: readonly boolean[]): boolean[] {
  const result: boolean[] = [];
  let open = true;

  for (let index = 0; index < reached.length; index += 1) {
    const already = taken[index] === true;
    const now = already || (open && reached[index] === true);

    result.push(now);
    open = now;
  }

  return result;
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run components/simulator/goal-ratchet.test.ts`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Коммит**

```bash
git add components/simulator/goal-ratchet.ts components/simulator/goal-ratchet.test.ts
git commit -m "feat: взятая цель урока не отдаётся назад"
```

---

### Task 6: Содержание урока 1

**Files:**
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/01-znakomstvo-s-kobotom/lesson.ru.mdx`
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/01-znakomstvo-s-kobotom/task.json`
- Create: `tests/sim/lesson-one.test.ts`

Числа задания посчитаны прямой кинематикой по URDF `jaka-zu7`, а не подобраны на
глаз: поза цели 1 — 20°, 30°, 80°, 0°, 70°, 0°; углы 0°, 10°, 90°, 0°, 80°, 0°
ставят фланец в точку X 432, Y 96, Z 398 мм, и цель 2 стоит в трёх миллиметрах
оттуда.

- [ ] **Step 1: Написать падающий тест содержания**

Создать `tests/sim/lesson-one.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkGoals, createWorld, parseTask, parseUrdfChain } from '@prompower/sim-core';
import { jakaZu7 } from '@prompower/robot-plugins';

/**
 * Урок 1: привести робота в заданную позу ползунками.
 *
 * Задание решается руками, поэтому прогонять здесь нечего — проверяется другое:
 * что обе цели вообще достижимы и что эталонные углы их берут. Урок, в котором
 * эталон не проходит, хуже отсутствующего.
 */

const LESSON = 'content/courses/osnovy-raboty-s-kobotom/lessons/01-znakomstvo-s-kobotom';

const task = parseTask(JSON.parse(readFileSync(`${LESSON}/task.json`, 'utf8')));

const chain = parseUrdfChain(
  readFileSync('packages/robot-plugins/models/jaka-zu7/urdf/jaka-zu7.urdf', 'utf8'),
  jakaZu7.joints.map((joint) => joint.urdfName),
);

const deg = (value: number): number => (value * Math.PI) / 180;

/** Эталонные углы: поза цели 1 и подвод фланца к точке цели 2. */
const POSE = [deg(20), deg(30), deg(80), 0, deg(70), 0];
const POINT = [0, deg(10), deg(90), 0, deg(80), 0];

const standing = (joints: readonly number[]) =>
  checkGoals(task, createWorld({ joints: [...joints] }), [], chain);

describe('задание «знакомство с коботом»', () => {
  it('решается ползунками, а не программой', () => {
    expect(task.mode).toBe('jog');
    expect(task.constraints).toEqual([]);
  });

  it('две цели: поза и точка', () => {
    expect(task.goals.map((goal) => goal.type)).toEqual(['jointsAtPose', 'flangeAtPoint']);
  });

  it('эталонная поза берёт первую цель', () => {
    expect(standing(POSE)[0]!.failure).toBeNull();
  });

  it('эталонный подвод берёт вторую цель', () => {
    expect(standing(POINT)[1]!.failure).toBeNull();
  });

  it('домашняя поза не проходит ни одной цели: заданию есть что требовать', () => {
    const home = standing(jakaZu7.homePose);

    expect(home[0]!.failure).not.toBeNull();
    expect(home[1]!.failure).not.toBeNull();
  });

  it('целевая поза лежит в пределах суставов модели', () => {
    const goal = task.goals[0]!;
    if (goal.type !== 'jointsAtPose') throw new Error('первая цель должна быть позой');

    goal.joints.forEach((value, index) => {
      const limit = chain.joints[index]!.limit;
      expect(value).toBeGreaterThanOrEqual(limit.lower);
      expect(value).toBeLessThanOrEqual(limit.upper);
    });
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run tests/sim/lesson-one.test.ts`
Expected: FAIL — `ENOENT`, файла задания нет.

- [ ] **Step 3: Написать задание**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/01-znakomstvo-s-kobotom/task.json`:

```json
{
  "id": "znakomstvo",
  "mode": "jog",
  "world": {
    "objects": []
  },
  "goals": [
    {
      "type": "jointsAtPose",
      "joints": [0.3491, 0.5236, 1.3963, 0, 1.2217, 0],
      "tolerance": 0.0524
    },
    {
      "type": "flangeAtPoint",
      "point": { "x": 0.43, "y": 0.095, "z": 0.4 },
      "tolerance": 0.04
    }
  ],
  "hints": []
}
```

Подсказок нет намеренно: лестница открывается неудачными попытками, а попытка —
это доработавшая программа. В ручном задании прогона нет, и считать нечего.
Обратная связь здесь непрерывная: цель отмечается в тот момент, когда ученик до
неё довёл.

- [ ] **Step 4: Прогнать тест содержания**

Run: `npx vitest run tests/sim/lesson-one.test.ts`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Написать теорию**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/01-znakomstvo-s-kobotom/lesson.ru.mdx`:

```mdx
---
title: Знакомство с коботом
description: Чем коллаборативный робот отличается от промышленного, из чего он состоит и что такое поза.
minutes: 3
---

Коллаборативный робот — это манипулятор, рассчитанный работать рядом с
человеком, а не за забором. Отсюда и название: *collaborative robot*, кобот.
Обычный промышленный робот быстр и силён, и потому огорожен: заходить к нему во
время работы нельзя. Кобот устроен так, чтобы соседство с человеком было
штатным режимом, а не аварией.

## Рука из шести суставов

Кобот — это цепь звеньев, соединённых суставами. Каждый сустав поворачивает всё,
что закреплено за ним, вокруг своей оси. Шесть суставов подряд дают руке
дотянуться до точки в пространстве и при этом развернуть инструмент как нужно:
трёх хватает, чтобы задать место, остальные три отвечают за ориентацию.

Суставы принято считать от основания: первый крутит робота целиком, второй и
третий поднимают и складывают руку, а последние три образуют запястье.

## Фланец и инструмент

Цепь заканчивается **фланцем** — площадкой, к которой прикручивают рабочий
инструмент: захват, присоску, сварочную горелку. Когда говорят «робот пришёл в
точку», имеют в виду именно фланец: он то место руки, чьё положение
контроллер считает и которым управляет.

## Поза

**Поза** — это набор углов всех суставов. Шесть чисел, и они полностью
описывают, как стоит рука: по ним однозначно восстанавливается, где окажется
фланец. Обратное неверно — до одной и той же точки рука часто дотягивается
несколькими разными способами, как человек достаёт чашку с полки локтем вверх
или локтем вниз.

## Пределы

Сустав не крутится бесконечно: у каждого есть верхняя и нижняя граница, за
которую он не пойдёт. Границы у каждой модели свои и записаны в её описании —
симулятор берёт их оттуда же, откуда берёт геометрию. Поэтому ползунок в
задании просто останавливается там, где остановился бы настоящий робот, и
поставить руку в невозможную позу нельзя.

## Задание

Шесть ползунков — шесть суставов. Сначала совместите робота с показанной серой
копией: это и есть «привести в заданную позу». Потом к метке в пространстве
подведите фланец — и посмотрите, сколькими способами до неё можно дотянуться.
```

- [ ] **Step 6: Проверить, что урок читается сборкой**

Run: `npm run build`
Expected: сборка проходит, среди статических страниц есть `/ru/lesson/znakomstvo-s-kobotom`. Если сборка падает на `starter.json` — это ожидаемо, чинится следующей задачей.

- [ ] **Step 7: Коммит**

```bash
git add content/courses/osnovy-raboty-s-kobotom/lessons/01-znakomstvo-s-kobotom tests/sim/lesson-one.test.ts
git commit -m "feat: урок 1 — теория о коботе и задание на позу"
```

---

### Task 7: Стартовая программа перестаёт быть обязательной

**Files:**
- Modify: `lib/content.ts`

- [ ] **Step 1: Убедиться, что сейчас ломается**

Run: `npm run build`
Expected: FAIL — `ENOENT: no such file or directory ... 01-znakomstvo-s-kobotom/starter.json`.

Unit-теста здесь нет намеренно: `loadLesson` читает диск и компилирует MDX
сервером Next — это интеграция, и проверяется она сборкой и сквозным тестом, а
не подделкой файловой системы.

- [ ] **Step 2: Реализовать**

В `lib/content.ts` заменить чтение `starter.json` в `loadLesson`:

```ts
      starter: await loadStarter(root),
```

и добавить функцию рядом с `loadTour`:

```ts
/**
 * Стартовая программа урока.
 *
 * Понятие программного урока: в ручном задании программы нет вовсе, и файла
 * рядом с ним не лежит. Пустой холст — честный ответ на его отсутствие.
 */
async function loadStarter(root: string): Promise<object> {
  try {
    return JSON.parse(await readFile(join(root, 'starter.json'), 'utf8')) as object;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}
```

- [ ] **Step 3: Проверить сборкой**

Run: `npm run build`
Expected: PASS, страница урока 1 попадает в статические.

- [ ] **Step 4: Коммит**

```bash
git add lib/content.ts
git commit -m "feat: урок без стартовой программы открывается с пустым холстом"
```

---

### Task 8: Строки интерфейса

**Files:**
- Modify: `messages/ru.json`, `messages/en.json`

- [ ] **Step 1: Дописать русские строки**

В `messages/ru.json` в раздел `lesson.goal` добавить две строки:

```json
      "jointsAtPose": "Повторить показанную позу",
      "flangeAtPoint": "Подвести инструмент к метке"
```

В раздел `lesson` добавить:

```json
    "goalDone": "Цель взята",
    "jog": {
      "title": "Суставы",
      "hint": "Двигайте ползунки — робот пойдёт за ними. Цель отметится сама, как только вы до неё доведёте."
    }
```

Там же поправить `lesson.desktopOnly.text` — он обещает блоки, а в первом уроке
их нет:

```json
      "text": "Задание выполняется в трёхмерной сцене: робот, пульт и проверка не помещаются на экран телефона. Теорию урока можно читать здесь, а задание откройте по этому адресу с компьютера."
```

- [ ] **Step 2: Дописать английские строки**

В `messages/en.json` в те же места:

```json
      "jointsAtPose": "Match the shown pose",
      "flangeAtPoint": "Bring the tool to the marker"
```

```json
    "goalDone": "Goal reached",
    "jog": {
      "title": "Joints",
      "hint": "Drag the sliders — the robot follows. A goal is marked as soon as you reach it."
    }
```

и тот же по смыслу текст в `lesson.desktopOnly.text`:

```json
      "text": "The task runs in a 3D scene: the robot, the controls and the checks do not fit a phone screen. Read the theory here and open the task at this address on a computer."
```

- [ ] **Step 3: Проверить, что файлы остались валидным JSON**

Run: `node -e "require('./messages/ru.json'); require('./messages/en.json'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Коммит**

```bash
git add messages
git commit -m "feat: строки ручного урока"
```

---

### Task 9: Метка целевой точки в сцене

**Files:**
- Create: `components/simulator/scene-frame.ts`, `components/simulator/target-point.tsx`
- Modify: `components/simulator/scene-objects.tsx`

- [ ] **Step 1: Вынести пересчёт координат**

Создать `components/simulator/scene-frame.ts`:

```ts
import type { Vec3 } from '@prompower/sim-core';

/**
 * Переход из системы координат мира в систему сцены.
 *
 * Состояние мира живёт в координатах URDF, где вверх — ось Z, а three.js
 * работает с осью Y вверх. Пересчёт собран здесь один раз: растащенный по
 * компонентам, он рано или поздно уводит деталь не туда, и искать будет негде.
 */

/** URDF (x, y, z) → three (x, z, −y). Тот же разворот, что у корня робота. */
export function toScene(point: Vec3): [number, number, number] {
  return [point.x, point.z, -point.y];
}

export function sizeToScene(size: Vec3): [number, number, number] {
  return [size.x, size.z, size.y];
}
```

В `components/simulator/scene-objects.tsx` удалить локальные `toScene` и
`sizeToScene` вместе с их комментарием и импортировать их:

```ts
import { sizeToScene, toScene } from './scene-frame';
```

- [ ] **Step 2: Проверить, что ничего не переехало**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Написать метку**

Создать `components/simulator/target-point.tsx`:

```tsx
'use client';

import type { Vec3 } from '@prompower/sim-core';
import { toScene } from './scene-frame';

/**
 * Метка целевой точки: полупрозрачный шар размером с допуск и ядро в центре.
 *
 * Радиус равен допуску задания намеренно — так ученик видит не «примерно туда»,
 * а ровно ту область, в которой цель засчитывается. Метка живёт, только пока
 * цель не взята: взятую показывать нечего.
 */
export function TargetPoint({ point, radius }: { point: Vec3; radius: number }) {
  return (
    <group position={toScene(point)}>
      <mesh>
        <sphereGeometry args={[radius, 24, 16]} />
        <meshBasicMaterial color="#f3821d" transparent opacity={0.25} depthWrite={false} />
      </mesh>

      <mesh>
        <sphereGeometry args={[radius * 0.15, 12, 8]} />
        <meshBasicMaterial color="#f3821d" />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 4: Проверить сборку**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add components/simulator/scene-frame.ts components/simulator/target-point.tsx components/simulator/scene-objects.tsx
git commit -m "feat: метка целевой точки в сцене"
```

---

### Task 10: Хук ручного задания

**Files:**
- Create: `components/simulator/use-jog-task.ts`

- [ ] **Step 1: Написать хук**

Создать `components/simulator/use-jog-task.ts`:

```ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkGoals,
  createWorld,
  type GoalStatus,
  type KinematicChain,
  type Task,
} from '@prompower/sim-core';
import { takeGoals } from './goal-ratchet';

/**
 * Ручное задание: ползунки вместо программы.
 *
 * Проверка идёт от текущих углов, а не от итога прогона, — прогонять здесь
 * нечего. Мир собирается заново на каждое движение ползунка: он состоит из
 * задания и шести чисел, и это дешевле, чем держать его в состоянии и следить
 * за его согласованностью с углами.
 */
export interface JogTask {
  readonly joints: readonly number[];
  readonly statuses: readonly GoalStatus[];
  /** Какие цели уже взяты. Взятая назад не отдаётся. */
  readonly taken: readonly boolean[];
  /** Цель, над которой работают сейчас. `null` — задание выполнено. */
  readonly active: number | null;
  readonly passed: boolean;
  readonly setJoint: (index: number, radians: number) => void;
  readonly reset: () => void;
}

export function useJogTask(
  chain: KinematicChain,
  task: Task,
  homePose: readonly number[],
): JogTask {
  const start = useMemo(
    () => [...(task.world.joints ?? homePose)],
    [task, homePose],
  );

  const [joints, setJoints] = useState<readonly number[]>(start);
  const [taken, setTaken] = useState<readonly boolean[]>(() => task.goals.map(() => false));

  const statuses = useMemo(
    () =>
      checkGoals(
        task,
        createWorld({
          joints: [...joints],
          objects: [...task.world.objects],
          zones: [...task.world.zones],
        }),
        [],
        chain,
      ),
    [task, joints, chain],
  );

  // Храповик догоняет проверку. Сравнение с прежним значением обязательно:
  // без него состояние менялось бы каждым проходом и рендер зациклился бы.
  useEffect(() => {
    setTaken((current) => {
      const next = takeGoals(
        current,
        statuses.map((status) => status.failure === null),
      );
      return next.every((value, index) => value === current[index]) ? current : next;
    });
  }, [statuses]);

  const active = taken.findIndex((value) => !value);

  return {
    joints,
    statuses,
    taken,
    active: active === -1 ? null : active,
    passed: taken.length > 0 && taken.every(Boolean),
    setJoint: useCallback((index: number, radians: number) => {
      setJoints((current) => current.map((value, i) => (i === index ? radians : value)));
    }, []),
    // Сброс возвращает робота в начало, но не отбирает взятые цели: ученик
    // сбрасывает позу как раз затем, чтобы зайти на следующую цель заново.
    reset: useCallback(() => setJoints(start), [start]),
  };
}
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
git add components/simulator/use-jog-task.ts
git commit -m "feat: состояние ручного задания"
```

---

### Task 11: Экран ручного урока

**Files:**
- Create: `components/lesson/task-brief.tsx`, `components/simulator/jog-lesson.tsx`
- Modify: `components/simulator/lesson-workspace.tsx`

- [ ] **Step 1: Вынести условие задания в свой файл**

Создать `components/lesson/task-brief.tsx` и перенести в него из
`lesson-workspace.tsx` функции `TaskBrief`, `goalText`, `Hints` и `Verdict`
целиком, вместе с их комментариями. Изменения при переносе три.

Первое — `TaskBrief` перестаёт зависеть от хука прогона и принимает то, что
показывает:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { earnedHints, type CheckResult, type Goal, type Task } from '@prompower/sim-core';

/**
 * Условие задания: цели, отметки взятых, вердикт и заслуженные подсказки.
 *
 * Общее для обоих видов уроков. Программный передаёт результат прогона,
 * ручной — отметки целей, которые ученик берёт по ходу.
 */
export function TaskBrief({
  task,
  check,
  error,
  taken,
  failedAttempts,
}: {
  task: Task;
  /** Итог автопроверки. `null` — проверять ещё нечего. */
  check: CheckResult | null;
  /** Ошибка исполнения программы. В ручном уроке её не бывает. */
  error: string | null;
  /** Отметки взятых целей. Пустой массив — отметок нет (программный урок). */
  taken: readonly boolean[];
  failedAttempts: number;
}) {
  const t = useTranslations('lesson');

  return (
    <>
      <section>
        <h2 className="mb-2 text-sm font-medium">{t('goals')}</h2>
        <ul className="flex flex-col gap-1 text-sm text-ink-dim">
          {task.goals.map((goal, index) => (
            <li
              key={index}
              data-goal={index}
              data-goal-status={taken[index] === true ? 'taken' : 'pending'}
              className="flex items-baseline gap-2"
            >
              {taken.length > 0 && (
                <span
                  aria-label={taken[index] === true ? t('goalDone') : undefined}
                  className={taken[index] === true ? 'text-ok' : 'text-ink-faint'}
                >
                  {taken[index] === true ? '✓' : '•'}
                </span>
              )}
              <span className={taken[index] === true ? 'text-ink' : undefined}>
                {goalText(goal, t)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Verdict check={check} error={error} t={t} />
      <Hints task={task} failedAttempts={failedAttempts} t={t} />
    </>
  );
}
```

Второе — `goalText` получает две новые строки:

```tsx
    case 'jointsAtPose':
      return t('goal.jointsAtPose');
    case 'flangeAtPoint':
      return t('goal.flangeAtPoint');
```

Третье — `Verdict` принимает `check` и `error` вместо хука прогона; тело его
условий не меняется, только источник данных:

```tsx
function Verdict({
  check,
  error,
  t,
}: {
  check: CheckResult | null;
  error: string | null;
  t: ReturnType<typeof useTranslations<'lesson'>>;
}) {
  if (error !== null) {
    return (
      <p data-testid="verdict" className="rounded-panel bg-surface-1 p-3 text-sm text-warn">
        {error}
      </p>
    );
  }

  if (check === null) return null;

  if (check.passed) {
    return (
      <p data-testid="verdict" className="rounded-panel bg-surface-1 p-3 text-sm text-ok">
        {t('passed')}
      </p>
    );
  }

  return (
    <div data-testid="verdict" className="rounded-panel bg-surface-1 p-3 text-sm text-warn">
      <p className="mb-1 font-medium">{t('failed')}</p>
      <ul className="flex flex-col gap-1">
        {check.failures.map((failure) => (
          <li key={failure}>{failure}</li>
        ))}
      </ul>
    </div>
  );
}
```

В `lesson-workspace.tsx` удалить перенесённые функции, импортировать `TaskBrief`
из `@/components/lesson/task-brief` и подставить в место старого вызова:

```tsx
                  <TaskBrief
                    task={task}
                    check={runner.status === 'done' ? runner.check : null}
                    error={runner.run.error}
                    taken={[]}
                    failedAttempts={runner.failedAttempts}
                  />
```

- [ ] **Step 2: Проверить, что программные уроки не изменились**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: Написать экран ручного урока**

Создать `components/simulator/jog-lesson.tsx`:

```tsx
'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { jointLimits, type KinematicChain, type RobotPlugin, type Task } from '@prompower/sim-core';
import type { URDFRobot } from 'urdf-loader';
import { GuidedTour } from '@/components/lesson/guided-tour';
import { LessonHeader } from '@/components/lesson/lesson-header';
import { LessonNav, type LessonLink } from '@/components/lesson/lesson-nav';
import { TaskBrief } from '@/components/lesson/task-brief';
import { TheoryView } from '@/components/lesson/theory-view';
import type { Tour } from '@/lib/tour';
import type { RobotBounds } from './fit-robot';
import { GhostRobot } from './ghost-robot';
import { JointPanel } from './joint-panel';
import { RobotViewer } from './robot-viewer';
import { SplitPane } from './split-pane';
import { TargetPoint } from './target-point';
import { useJogTask } from './use-jog-task';

/**
 * Урок без программы: робота ведут ползунками.
 *
 * Отдельный компонент, а не ветка внутри урока с блоками: хук прогона и хук
 * ручного задания нельзя звать условно, а вызывать оба ради одного значит
 * поднимать интерпретатор там, где исполнять нечего.
 *
 * Сборка экрана повторяет программный урок — шапка, этап теории, две зоны.
 * Повторяются сборки, а не логика: и шапка, и теория, и разделитель давно
 * вынесены в свои компоненты.
 */
export function JogLesson({
  plugin,
  task,
  tour,
  title,
  theory,
  previous,
  next,
  robot,
  chain,
  bounds,
  onFps,
  fps,
}: {
  plugin: RobotPlugin;
  task: Task;
  tour: Tour | null;
  title: string;
  theory: ReactNode;
  previous: LessonLink | null;
  next: LessonLink | null;
  robot: URDFRobot;
  chain: KinematicChain;
  bounds: RobotBounds;
  onFps: (value: number) => void;
  fps: number;
}) {
  const t = useTranslations('lesson');
  const tKey = useTranslations();
  const tCourse = useTranslations('course');

  const [reading, setReading] = useState(true);
  const [touring, setTouring] = useState(tour !== null);

  const jog = useJogTask(chain, task, plugin.homePose);
  const limits = useMemo(() => jointLimits(chain), [chain]);
  const jointNames = useMemo(() => plugin.joints.map((joint) => joint.urdfName), [plugin]);

  // Подсказка активной цели в сцене: поза показывается серой копией, точка —
  // меткой. Взятая цель со сцены уходит: показывать в ней больше нечего.
  const active = jog.active === null ? null : (jog.statuses[jog.active]?.goal ?? null);

  return (
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      <LessonHeader title={title} model={tKey(plugin.displayNameKey)}>
        {tour !== null && !touring && (
          <button
            type="button"
            data-testid="tour-restart"
            onClick={() => setTouring(true)}
            className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
          >
            {t('tour.restart')}
          </button>
        )}

        {!reading && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="back-to-theory"
              onClick={() => setReading(true)}
              className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
            >
              {tCourse('backToTheory')}
            </button>

            <button
              type="button"
              data-testid="reset"
              onClick={jog.reset}
              className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
            >
              {t('controls.reset')}
            </button>
          </div>
        )}
      </LessonHeader>

      {plugin.placeholderNoticeKey !== null && (
        <p role="status" className="border-b border-line bg-surface-1 px-5 py-2 text-sm text-warn">
          {tKey(plugin.placeholderNoticeKey)}
        </p>
      )}

      {reading ? (
        <>
          <TheoryView onStart={() => setReading(false)}>{theory}</TheoryView>
          <div className="border-t border-line px-5 py-3">
            <LessonNav previous={previous} next={next} />
          </div>
        </>
      ) : (
        <SplitPane
          label={tCourse('splitLabel')}
          initial={0.42}
          left={
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-line p-5">
                <TaskBrief
                  task={task}
                  check={jog.passed ? { passed: true, failures: [] } : null}
                  error={null}
                  taken={jog.taken}
                  failedAttempts={0}
                />
              </div>

              <div
                data-testid="joint-panel"
                className="min-h-0 flex-1 overflow-y-auto p-5"
              >
                <h2 className="mb-1 text-sm font-medium">{t('jog.title')}</h2>
                <p className="mb-4 text-sm text-ink-faint">{t('jog.hint')}</p>

                <JointPanel
                  joints={plugin.joints}
                  limits={limits}
                  values={jog.joints}
                  onChange={jog.setJoint}
                />
              </div>
            </div>
          }
          right={
            <main className="relative min-h-0 flex-1">
              <RobotViewer
                robot={robot}
                jointNames={jointNames}
                values={jog.joints}
                scene={plugin.scene}
                bounds={bounds}
                onFpsSample={onFps}
              >
                {active?.type === 'jointsAtPose' && (
                  <GhostRobot source={robot} jointNames={jointNames} values={active.joints} />
                )}

                {active?.type === 'flangeAtPoint' && (
                  <TargetPoint point={active.point} radius={active.tolerance} />
                )}
              </RobotViewer>

              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,transparent_45%,rgba(0,0,0,0.5)_100%)]"
              />

              <p
                data-testid="scene-stats"
                className="pointer-events-none absolute bottom-3 right-4 font-mono text-xs text-ink-faint"
              >
                {fps} fps
              </p>
            </main>
          }
        />
      )}

      {tour !== null && touring && (
        <GuidedTour
          tour={tour}
          program={{ version: 1, body: [] }}
          passed={jog.passed}
          onClose={() => setTouring(false)}
        />
      )}
    </div>
  );
}
```

`RobotBounds` — тот же тип, что принимает `RobotViewer`: `{ liftY, radius,
centerY }` из `components/simulator/fit-robot.ts`. Пересчёт кадра под сцену
(`includeScene`) здесь не нужен: ни деталей, ни зон в задании нет, а целевая
точка лежит в пределах руки и в габариты робота уже входит.

- [ ] **Step 4: Развести режимы**

В `components/simulator/lesson-workspace.tsx`, в `WideLesson`, после проверок
загрузки модели и цепи — выбор экрана по режиму задания:

```tsx
  if (task.mode === 'jog') {
    return (
      <JogLesson
        plugin={plugin}
        task={task}
        tour={tour}
        title={title}
        theory={theory}
        previous={previous}
        next={next}
        robot={model.robot}
        chain={chain.chain}
        bounds={model.bounds}
        fps={fps}
        onFps={setFps}
      />
    );
  }
```

Импорт рядом с остальными:

```tsx
import { JogLesson } from './jog-lesson';
```

- [ ] **Step 5: Посмотреть глазами**

Run: `npm run dev`, открыть `http://localhost:3000/ru/lesson/znakomstvo-s-kobotom`

Проверить:
- теория читается, кнопка «К заданию» открывает задание;
- слева две цели, первая с точкой-маркером, вторая тоже;
- в сцене стоит серая копия в целевой позе;
- ползунки двигают робота;
- выставив 20, 30, 80, 0, 70, 0 — первая цель отмечается галочкой, копия
  исчезает, появляется оранжевая метка;
- выставив 0, 10, 90, 0, 80, 0 — отмечается вторая цель и появляется
  «Задание выполнено»;
- «Сброс» возвращает робота в домашнюю позу, отметки остаются.

- [ ] **Step 6: Коммит**

```bash
git add components
git commit -m "feat: экран урока с ползунками вместо блоков"
```

---

### Task 12: Сценарий обучения урока 1

**Files:**
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/01-znakomstvo-s-kobotom/tour.ru.json`

- [ ] **Step 1: Написать сценарий**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/01-znakomstvo-s-kobotom/tour.ru.json`:

```json
{
  "steps": [
    {
      "target": "[data-testid=theory-start]",
      "text": "Теория прочитана — переходите к заданию. Дальше подсветка покажет, куда смотреть.",
      "done": "click"
    },
    {
      "target": "[data-testid=joint-panel]",
      "text": "Шесть ползунков — шесть суставов робота. Двигайте их, пока робот не совместится с серой копией, а потом ведите инструмент к метке. Цели отмечаются сами.",
      "done": "passed"
    }
  ]
}
```

Шагов два, а не шесть, как в уроке 3: там подсветка вела по палитре блоков, где
без указания не разобраться, а здесь всё управление — ползунки, и они на виду.

- [ ] **Step 2: Проверить глазами**

Run: `npm run dev`, открыть `http://localhost:3000/ru/lesson/znakomstvo-s-kobotom`
Expected: подсветка на кнопке «К заданию»; после нажатия — на панели суставов;
после выполнения задания сценарий закрывается.

- [ ] **Step 3: Коммит**

```bash
git add content/courses/osnovy-raboty-s-kobotom/lessons/01-znakomstvo-s-kobotom/tour.ru.json
git commit -m "feat: обучение урока 1 указывает на ползунки"
```

---

### Task 13: Сквозной тест урока

**Files:**
- Create: `tests/e2e/lesson-one.spec.ts`

- [ ] **Step 1: Написать тест**

Создать `tests/e2e/lesson-one.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

/**
 * Урок 1 проходится ползунками.
 *
 * Углы проверены unit-тестом на настоящем задании, здесь проверяется другое:
 * что интерфейс действительно ездит на автопроверке — отметки целей приходят от
 * валидатора, а не нарисованы, и вторая цель не берётся раньше первой.
 */

const LESSON = '/ru/lesson/znakomstvo-s-kobotom';

/** Эталонные углы в градусах: как их показывает ползунок. */
const POSE = { joint_1: '20', joint_2: '30', joint_3: '80', joint_5: '70' };
const POINT = { joint_1: '0', joint_2: '10', joint_3: '90', joint_5: '80' };

async function setJoints(page: import('@playwright/test').Page, values: Record<string, string>) {
  for (const [joint, value] of Object.entries(values)) {
    await page.locator(`[data-joint="${joint}"]`).fill(value);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(LESSON);
  await page.getByTestId('theory-start').click();
  // Подсветка обучения перекрывает экран: она проверена своим тестом.
  await page.getByTestId('tour-skip').click();
  await expect(page.locator('main canvas')).toBeVisible();
});

test('задание открывается ползунками, а не блоками', async ({ page }) => {
  await expect(page.getByTestId('joint-panel')).toBeVisible();
  await expect(page.getByTestId('block-editor')).toHaveCount(0);
  await expect(page.getByTestId('play')).toHaveCount(0);
  await expect(page.getByTestId('load-failure')).toHaveCount(0);
});

test('до начала работы ни одна цель не взята', async ({ page }) => {
  await expect(page.locator('[data-goal-status="taken"]')).toHaveCount(0);
  await expect(page.getByTestId('verdict')).toHaveCount(0);
});

test('вторая цель не берётся раньше первой', async ({ page }) => {
  await setJoints(page, POINT);

  // Фланец в точке второй цели, но первая ещё не пройдена — зачёта нет.
  await expect(page.locator('[data-goal-status="taken"]')).toHaveCount(0);
});

test('две цели подряд доводят задание до зачёта', async ({ page }) => {
  await setJoints(page, POSE);
  await expect(page.locator('[data-goal="0"]')).toHaveAttribute('data-goal-status', 'taken');

  await setJoints(page, POINT);
  await expect(page.locator('[data-goal="1"]')).toHaveAttribute('data-goal-status', 'taken');
  await expect(page.getByTestId('verdict')).toContainText('Задание выполнено');
});

test('сброс возвращает позу, но не отбирает взятую цель', async ({ page }) => {
  await setJoints(page, POSE);
  await expect(page.locator('[data-goal="0"]')).toHaveAttribute('data-goal-status', 'taken');

  await page.getByTestId('reset').click();

  await expect(page.locator('[data-joint-value="joint_2"]')).toHaveText('90.0°');
  await expect(page.locator('[data-goal="0"]')).toHaveAttribute('data-goal-status', 'taken');
});
```

- [ ] **Step 2: Прогнать**

Run: `npx playwright test tests/e2e/lesson-one.spec.ts`
Expected: PASS, 5 тестов. Первый прогон собирает приложение — это несколько минут.

- [ ] **Step 3: Коммит**

```bash
git add tests/e2e/lesson-one.spec.ts
git commit -m "test: урок 1 проходится ползунками"
```

---

### Task 14: Карта курса, README и полная проверка

**Files:**
- Modify: `README.md`
- Test: `tests/e2e/course.spec.ts` (только прогон, правок не требует)

- [ ] **Step 1: Проверить, что карта курса не сломалась**

Run: `npx playwright test tests/e2e/course.spec.ts`
Expected: PASS без единой правки в тесте. Ни одна проверка там не считает уроки
числом и не опирается на то, какой урок первый: карта ищет заголовки, переходы
идут от урока 4 к уроку 5, а «последний урок» — это по-прежнему «Входы и
выходы».

- [ ] **Step 2: Обновить README**

В разделе «Что уже работает» дописать абзац после описания песочницы:

```markdown
Курс «Основы работы с коботом» открывается уроком «Знакомство с коботом»: теория
об устройстве руки и задание, которое решается ползунками суставов, без
программы. Робота приводят в показанную серой копией позу, а затем подводят
инструмент к метке в пространстве; обе цели отмечаются в тот момент, когда
ученик до них довёл.
```

- [ ] **Step 3: Полная проверка**

Run: `npm run typecheck && npm test && npm run build && npm run test:e2e`
Expected: typecheck чистый; Vitest зелёный; сборка проходит; Playwright зелёный
целиком, включая уроки 3, 4 и 5 — их задания не менялись.

- [ ] **Step 4: Коммит**

```bash
git add README.md
git commit -m "docs: курс начинается с урока о коботе"
```

- [ ] **Step 5: Отметить выполненные шаги плана и закрыть ветку**

Проставить галочки в этом файле, закоммитить, затем перейти к скиллу
`superpowers:finishing-a-development-branch`.
