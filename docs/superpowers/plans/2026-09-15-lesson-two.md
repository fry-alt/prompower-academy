# Второй урок: безопасность — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В курсе появляется урок 2, где инструмент ведут к точке мимо зоны оператора, а въезд в зону фиксируется и не даёт зачесть задание.

**Architecture:** В `sim-core` появляется второй вид ограничения — `keepOut`, запрет входить в названную зону. Ограничения делятся по тому, о чём они говорят: про программу (`maxStatements`) или про движение (`keepOut`), и разбор пускает их только в тот режим урока, где их есть чем проверить. Проверка запрета идёт по точкам суставов и фланца от текущего состояния — так же, как проверяются цели ручного урока. Память о нарушении живёт в уроке рядом с храповиком целей.

**Tech Stack:** TypeScript strict, Vitest (node), React 19 + @react-three/fiber, next-intl, Playwright.

Источник требований: [спека](../specs/2026-09-15-lesson-two-design.md), §7 брифа.

---

## Числа задания

Посчитаны по URDF `jaka-zu7`, а не подобраны на глаз (проверка — задача 7):

| Что | Значение |
|---|---|
| Зона оператора | центр (380, −200, 300) мм, размер 260 × 260 × 400 мм |
| Цель | точка (371, −449, 199) мм, допуск 50 мм |
| Эталонный обход | J1 −60°, J2 0°, J3 50°, J4 0°, J5 80°, J6 0° |
| Поза-нарушитель | J1 −40°, J2 0°, J3 60°, J4 0°, J5 80°, J6 0° |

Домашняя поза зоны не задевает, цель отстоит от неё на 119 мм — допуск цели в
зону не заходит. Зона стоит на пути в том смысле, который в ручном уроке
единственно и осмыслен: развернуть основание первым значит пронести сложенную
руку над зоной, а порядок «плечо, локоть, запястье, основание» проходит чисто.

> Числа в таблице — итоговые. В первой редакции плана зона стояла ближе к роботу
> и вчетверо крупнее; на экране она читалась клеткой вокруг манипулятора, и
> геометрия была пересчитана. Критерий «прямой отрезок к цели идёт сквозь зону»
> из проверок убран тогда же: фланец в ручном уроке ходит дугами, и отрезок
> ничего про его путь не говорил.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/sim-core/src/validators/task.ts` | изменяется: ограничение `keepOut`, правила режима по признаку ограничения |
| `packages/sim-core/src/validators/task.test.ts` | изменяется: разбор и оба правила |
| `packages/sim-core/src/validators/check.ts` | изменяется: проверка запрета, `checkKeepOuts`, общий разбор точек робота |
| `packages/sim-core/src/validators/check.test.ts` | изменяется |
| `packages/sim-core/src/index.ts` | изменяется: экспорт `checkKeepOuts` |
| `components/simulator/use-jog-task.ts` | изменяется: нарушение считается, фиксируется, снимается сбросом |
| `components/lesson/task-brief.tsx` | изменяется: строка нарушения |
| `components/simulator/keep-out-zone.tsx` | новый: коробка запретной зоны в сцене |
| `components/simulator/jog-lesson.tsx` | изменяется: зоны запрета в сцене, нарушение в условии |
| `messages/ru.json`, `messages/en.json` | изменяются: заголовок нарушения |
| `content/.../02-bezopasnost/` | новый: теория, задание, обучение |
| `tests/sim/lesson-two.test.ts` | новый |
| `tests/e2e/lesson-two.spec.ts` | новый |

Ветка уже создана: `feat/lesson-two`.

---

### Task 1: Запрет как ограничение

**Files:**
- Modify: `packages/sim-core/src/validators/task.ts`
- Test: `packages/sim-core/src/validators/task.test.ts`

- [x] **Step 1: Написать падающие тесты**

Добавить в конец `packages/sim-core/src/validators/task.test.ts`:

```ts
describe('запрет входить в зону', () => {
  const JOG = { ...MINIMAL, mode: 'jog' as const };

  it('разбирается в ручном задании', () => {
    const task = parseTask({ ...JOG, constraints: [{ type: 'keepOut', zone: 'зона оператора' }] });
    expect(task.constraints).toEqual([{ type: 'keepOut', zone: 'зона оператора' }]);
  });

  it('зона названа обязательно', () => {
    expect(() => parseTask({ ...JOG, constraints: [{ type: 'keepOut', zone: '' }] })).toThrow(
      /task\.constraints\[0\]\.zone/,
    );
  });

  it('в программном задании отвергается: путь между точками не хранится', () => {
    expect(() =>
      parseTask({ ...MINIMAL, constraints: [{ type: 'keepOut', zone: 'зона оператора' }] }),
    ).toThrow(/только в ручном задании/);
  });

  it('ограничение на размер программы по-прежнему не пускают в ручное задание', () => {
    expect(() =>
      parseTask({ ...JOG, constraints: [{ type: 'maxStatements', value: 5 }] }),
    ).toThrow(/ограничивать нечего/);
  });
});
```

- [x] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/sim-core/src/validators/task.test.ts`
Expected: FAIL — «неизвестное ограничение «keepOut»».

- [x] **Step 3: Реализовать**

В `packages/sim-core/src/validators/task.ts` расширить тип:

```ts
export type Constraint =
  | { readonly type: 'maxStatements'; readonly value: number }
  /** Запрет входить в названную зону. Зона берётся из `world.zones`. */
  | { readonly type: 'keepOut'; readonly zone: string };
```

Заменить тело `parseConstraint`:

```ts
function parseConstraint(input: unknown, path: string): Constraint {
  const record = asRecord(input, path);
  const type = asNonEmptyString(record['type'], `${path}.type`);

  switch (type) {
    case 'maxStatements': {
      const value = asNumber(record['value'], `${path}.value`);
      if (!Number.isInteger(value) || value < 1) {
        throw new TaskParseError(
          `${path}.value`,
          `ожидалось целое число больше нуля, получено ${value}`,
        );
      }
      return { type, value };
    }

    case 'keepOut':
      return { type, zone: asNonEmptyString(record['zone'], `${path}.zone`) };

    default:
      throw new TaskParseError(path, `неизвестное ограничение «${type}»`);
  }
}
```

Заменить проверку ограничений в `parseTask` (правило по признаку ограничения, а
не по их числу):

```ts
  for (const constraint of constraints) {
    // Ручное задание решается руками: инструкций нет, и ограничивать в нём
    // нечего. Молча пропустить такое ограничение значит показать ученику
    // требование, которое никогда не проверяется.
    if (mode === 'jog' && about(constraint) === 'program') {
      throw new TaskParseError(
        'task.constraints',
        'в ручном задании нет программы: ограничивать нечего',
      );
    }

    // Обратная беда: журнал прогона хранит концы движений, а не путь между
    // ними, и робот, проехавший сквозь зону по прямой, выглядел бы в нём
    // безупречно. Пока путь не проверяется, запрет пускать в программу нельзя.
    if (mode === 'program' && about(constraint) === 'motion') {
      throw new TaskParseError(
        'task.constraints',
        'запрет проверяется только в ручном задании: путь программы между точками не хранится',
      );
    }
  }
```

и рядом — сам признак:

```ts
/** Про что ограничение: про текст программы или про движение робота. */
function about(constraint: Constraint): 'program' | 'motion' {
  return constraint.type === 'maxStatements' ? 'program' : 'motion';
}
```

Старую проверку `if (mode === 'jog' && constraints.length > 0)` удалить целиком.

- [x] **Step 4: Прогнать тесты**

Run: `npx vitest run packages/sim-core/src/validators/`
Expected: PASS.

- [x] **Step 5: Прогнать весь набор и typecheck**

Run: `npm test` затем `npm run typecheck`
Expected: оба чисто. TypeScript назовёт `checkConstraint` в `check.ts`, если
`switch` там перестал быть исчерпывающим, — это чинится следующей задачей.

- [x] **Step 6: Коммит**

```bash
git add packages/sim-core/src/validators/
git commit -m "feat: запрет входить в зону как ограничение задания"
```

---

### Task 2: Проверка запрета

**Files:**
- Modify: `packages/sim-core/src/validators/check.ts`, `packages/sim-core/src/index.ts`
- Test: `packages/sim-core/src/validators/check.test.ts`

- [x] **Step 1: Написать падающие тесты**

Добавить в конец `packages/sim-core/src/validators/check.test.ts`:

```ts
describe('запрет входить в зону', () => {
  // Цепь из одного звена: фланец в метре по X, первый сустав его поворачивает.
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

  const KEEP_OUT: Task = parseTask({
    ...RAW_TASK,
    mode: 'jog',
    world: {
      objects: [],
      zones: [{ id: 'зона оператора', position: { x: 1, y: 0, z: 0 }, size: { x: 0.4, y: 0.4, z: 0.4 } }],
    },
    goals: [{ type: 'gripperState', state: 'open' }],
    constraints: [{ type: 'keepOut', zone: 'зона оператора' }],
    hints: [],
  });

  const standing = (joints: readonly number[]) =>
    createWorld({ joints: [...joints], zones: [...KEEP_OUT.world.zones] });

  it('молчит, пока робот снаружи', () => {
    // Сустав повёрнут на 90°: фланец ушёл на ось Y, зона осталась по X.
    expect(checkKeepOuts(KEEP_OUT, standing([Math.PI / 2]), CHAIN)).toEqual([]);
  });

  it('называет зону, в которую вошёл робот', () => {
    expect(checkKeepOuts(KEEP_OUT, standing([0]), CHAIN)).toEqual([
      'Робот вошёл в зону «зона оператора» — туда заходить нельзя.',
    ]);
  });

  it('пропавшая со сцены зона — это ошибка содержания, а не тишина', () => {
    const lost: Task = parseTask({
      ...RAW_TASK,
      mode: 'jog',
      world: { objects: [], zones: [] },
      goals: [{ type: 'gripperState', state: 'open' }],
      constraints: [{ type: 'keepOut', zone: 'зона оператора' }],
      hints: [],
    });

    expect(checkKeepOuts(lost, standing([0]), CHAIN)[0]).toBe('На сцене нет зоны «зона оператора».');
  });

  it('попадает в общий вердикт задания', () => {
    const result = checkTask(KEEP_OUT, SHORT, standing([0]), [], CHAIN);

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Робот вошёл в зону «зона оператора» — туда заходить нельзя.');
  });
});
```

Дописать `checkKeepOuts` в импорт из `./check`.

- [x] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/sim-core/src/validators/check.test.ts`
Expected: FAIL — `checkKeepOuts` не экспортируется.

- [x] **Step 3: Реализовать**

В `check.ts` дописать импорты:

```ts
import { flangePose, jointFrames, type KinematicChain } from '../kinematics/chain';
import { translationOf } from '../kinematics/transform';
import { distanceToBox, zoneContaining } from '../world/aabb';
```

(строка импорта из `aabb` уже есть — в неё добавляется `distanceToBox`).

Добавить проверку и точки робота:

```ts
/**
 * Нарушенные запреты движения.
 *
 * Отдельно от `checkTask` потому, что запрет проверяют не в конце, а всё время:
 * ручной урок спрашивает об этом на каждое движение ползунка.
 */
export function checkKeepOuts(
  task: Task,
  world: WorldState,
  chain: KinematicChain,
): readonly string[] {
  return task.constraints
    .map((constraint) =>
      constraint.type === 'keepOut' ? checkKeepOut(constraint, world, chain) : null,
    )
    .filter((failure): failure is string => failure !== null);
}

function checkKeepOut(
  constraint: Constraint & { type: 'keepOut' },
  world: WorldState,
  chain: KinematicChain,
): string | null {
  const zone = world.zones[constraint.zone];
  if (zone === undefined) return `На сцене нет зоны «${constraint.zone}».`;

  const points = robotPoints(world, chain);
  if (points === null) return jointsMismatch(world, chain);

  return points.some((point) => distanceToBox(point, zone) === 0)
    ? `Робот вошёл в зону «${zone.id}» — туда заходить нельзя.`
    : null;
}

/**
 * Точки робота: начала суставов и фланец.
 *
 * Звено между двумя точками не проверяется — очень тонкая зона между суставами
 * пройдёт незамеченной. Это та же граница, что у всей физики проекта (§13
 * брифа): кинематика и AABB — потолок, а зона урока заведомо крупнее звена.
 */
function robotPoints(world: WorldState, chain: KinematicChain): Vec3[] | null {
  if (world.joints.length !== chain.joints.length) return null;

  const flange = flangePose(chain, world.joints);
  return [
    ...jointFrames(chain, world.joints).map((frame) => translationOf(frame)),
    { x: flange.x, y: flange.y, z: flange.z },
  ];
}

/** Мир и модель разошлись числом суставов: это ошибка сборки, а не поза. */
function jointsMismatch(world: WorldState, chain: KinematicChain): string {
  return (
    `Робот собран с ${world.joints.length} углами, а у модели ${chain.joints.length} суставов: ` +
    'положение инструмента не посчитать.'
  );
}
```

Заменить тело `checkFlangeAtPoint` на то же сообщение через общий помощник:

```ts
function checkFlangeAtPoint(
  goal: Goal & { type: 'flangeAtPoint' },
  world: WorldState,
  chain: KinematicChain,
): string | null {
  // Расхождение объясняется словами, а не исключением из кинематики: проверка
  // зовётся на каждое движение ползунка прямо в отрисовке, и брошенная ошибка
  // унесла бы с собой весь экран урока.
  if (world.joints.length !== chain.joints.length) return jointsMismatch(world, chain);

  const actual = flangePose(chain, world.joints);
  const gap = distance(actual, goal.point);
  if (gap <= goal.tolerance) return null;

  return (
    `Инструмент в ${millimetres(gap)} мм от точки: ` +
    `X ${millimetres(goal.point.x)}, Y ${millimetres(goal.point.y)}, Z ${millimetres(goal.point.z)} мм.`
  );
}
```

Провести запреты в общий вердикт: в `checkTask` собрать их вместе с целями и
ограничениями программы.

```ts
export function checkTask(
  task: Task,
  program: Program,
  world: WorldState,
  log: EventLog,
  chain: KinematicChain,
): CheckResult {
  const failures = [
    ...checkGoals(task, world, log, chain).map((status) => status.failure),
    ...checkKeepOuts(task, world, chain),
    ...task.constraints.map((constraint) => checkConstraint(constraint, program)),
  ].filter((failure): failure is string => failure !== null);

  return { passed: failures.length === 0, failures };
}
```

`checkConstraint` при этом отвечает только за ограничения программы:

```ts
/**
 * Ограничение на размер программы считается по дереву, а не по журналу.
 *
 * Иначе цикл на десять витков выглядел бы как десять инструкций, и требование
 * «уложись в 12 блоков» наказывало бы ровно за то, чему урок учит.
 *
 * Запреты движения сюда не попадают: их проверяет `checkKeepOuts`, и программа
 * им не нужна.
 */
function checkConstraint(constraint: Constraint, program: Program): string | null {
  if (constraint.type !== 'maxStatements') return null;

  const count = countStatements(program.body);
  if (count <= constraint.value) return null;

  return `В программе ${count} инструкций, а разрешено не больше ${constraint.value}.`;
}
```

- [x] **Step 4: Открыть наружу**

В `packages/sim-core/src/index.ts` дописать `checkKeepOuts` в экспорт из
`./validators/check`.

- [x] **Step 5: Прогнать всё**

Run: `npm test` затем `npm run typecheck`
Expected: PASS, typecheck чисто.

- [x] **Step 6: Коммит**

```bash
git add packages/sim-core
git commit -m "feat: проверка запрета по точкам суставов и фланца"
```

---

### Task 3: Нарушение в состоянии урока

**Files:**
- Modify: `components/simulator/use-jog-task.ts`

- [x] **Step 1: Реализовать**

В `components/simulator/use-jog-task.ts` добавить нарушение в состояние. Импорт:

```ts
import { checkGoals, checkKeepOuts, createWorld, setJoints as setWorldJoints, ... } from '@prompower/sim-core';
```

Тип и состояние:

```ts
export interface JogTask {
  readonly joints: readonly number[];
  /** Какие цели уже взяты. Взятая назад не отдаётся. */
  readonly taken: readonly boolean[];
  /** Цель, над которой работают сейчас, вместе с тем, чего ей не хватает. */
  readonly activeStatus: GoalStatus | null;
  /**
   * Нарушенный запрет. Держится, пока его не снимут сбросом: урок, который
   * забывает нарушение, стоит ученику выехать обратно, учит ровно неверному.
   */
  readonly violation: string | null;
  readonly passed: boolean;
  readonly setJoint: (index: number, radians: number) => void;
  readonly reset: () => void;
}

interface JogState {
  readonly joints: readonly number[];
  readonly taken: readonly boolean[];
  readonly violation: string | null;
}
```

Начальное состояние и переход:

```ts
  const [state, setState] = useState<JogState>(() => ({
    joints: start,
    taken: task.goals.map(() => false),
    violation: null,
  }));

  const advance = useCallback(
    (joints: readonly number[], taken: readonly boolean[], violation: string | null): JogState => {
      const world = setWorldJoints(base, joints);

      return {
        joints,
        taken: takeGoals(
          taken,
          checkGoals(task, world, [], chain).map((status) => status.failure === null),
        ),
        // Первое нарушение и остаётся: последующие ничего не добавляют, а
        // затирать его новым значит терять то, с чего всё началось.
        violation: violation ?? (checkKeepOuts(task, world, chain)[0] ?? null),
      };
    },
    [task, chain, base],
  );
```

`setJoint` и `reset` зовут `advance`, различаясь тем, что несут дальше:

```ts
    setJoint: useCallback(
      (index: number, radians: number) => {
        setState((current) =>
          advance(
            current.joints.map((value, i) => (i === index ? radians : value)),
            current.taken,
            current.violation,
          ),
        );
      },
      [advance],
    ),
    // Сброс возвращает робота в начало и снимает нарушение: это и есть
    // выученное действие — вернуться в известное состояние и пройти иначе.
    // Взятые цели при этом остаются: их ученик уже заработал.
    reset: useCallback(
      () => setState((current) => advance(start, current.taken, null)),
      [advance, start],
    ),
```

Возврат хука:

```ts
  return {
    joints: state.joints,
    taken: state.taken,
    activeStatus: active === -1 ? null : (statuses[active] ?? null),
    violation: state.violation,
    // Пока нарушение висит, задание не зачтено, даже если все цели взяты.
    passed: state.violation === null && state.taken.length > 0 && state.taken.every(Boolean),
    ...
  };
```

- [x] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: PASS.

- [x] **Step 3: Коммит**

```bash
git add components/simulator/use-jog-task.ts
git commit -m "feat: нарушение запрета держится до сброса"
```

---

### Task 4: Нарушение на экране

**Files:**
- Modify: `components/lesson/task-brief.tsx`, `messages/ru.json`, `messages/en.json`
- Create: `components/simulator/keep-out-zone.tsx`
- Modify: `components/simulator/jog-lesson.tsx`

- [x] **Step 1: Строка нарушения в условии задания**

В `components/lesson/task-brief.tsx` добавить пропс и его отрисовку. В список
пропсов:

```tsx
  /**
   * Нарушенный запрет. Не провал цели, а состояние, которое надо снять, —
   * поэтому показывается отдельно и до вердикта.
   */
  violation?: string | null;
```

в сигнатуру — `violation = null,` рядом с `activeFailure = null,`, и в разметку,
сразу после закрывающего `</section>` списка целей:

```tsx
      {violation !== null && (
        <div
          data-testid="violation"
          role="status"
          className="mt-3 rounded-panel border-l-2 border-warn bg-surface-1 p-3 text-sm text-warn"
        >
          <p className="mb-1 font-medium">{t('violation')}</p>
          <p>{violation}</p>
        </div>
      )}
```

- [x] **Step 2: Строки интерфейса**

В `messages/ru.json` в раздел `lesson` добавить:

```json
    "violation": "Нарушение правил безопасности",
```

В `messages/en.json` в то же место:

```json
    "violation": "Safety rule broken",
```

Run: `node -e "require('./messages/ru.json'); require('./messages/en.json'); console.log('ok')"`
Expected: `ok`

- [x] **Step 3: Зона запрета в сцене**

Создать `components/simulator/keep-out-zone.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { BoxGeometry, EdgesGeometry } from 'three';
import type { Zone } from '@prompower/sim-core';
import { sizeToScene, toScene } from './scene-frame';

/**
 * Запретная зона: объём, куда нельзя въезжать рукой.
 *
 * Зоны заданий лежат на столе и нарисованы плоскими пятнами — эта занимает
 * пространство, и рисуется коробкой с контуром. Цвет предупреждения здесь не
 * украшение: он единственный в сцене и значит ровно одно.
 *
 * Геометрия контура живёт между рендерами намеренно: в аргументах примитива R3F
 * сравнивает по ссылке, а рендеры во время работы ползунком идут потоком.
 */
export function KeepOutZone({ zone }: { zone: Zone }) {
  const size = sizeToScene(zone.size);
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(...size)), [size[0], size[1], size[2]]);

  return (
    <group position={toScene(zone.position)}>
      <mesh>
        <boxGeometry args={size} />
        <meshBasicMaterial color="#d98324" transparent opacity={0.12} depthWrite={false} />
      </mesh>

      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#d98324" />
      </lineSegments>
    </group>
  );
}
```

- [x] **Step 4: Подключить к уроку**

В `components/simulator/jog-lesson.tsx` импортировать зону:

```tsx
import { KeepOutZone } from './keep-out-zone';
```

Собрать список запретных зон рядом с `active`:

```tsx
  // Запретные зоны берутся из ограничений: зона, на которую никто не ссылается,
  // в сцене и не нужна.
  const keepOut = useMemo(
    () =>
      task.constraints.flatMap((constraint) =>
        constraint.type === 'keepOut'
          ? task.world.zones.filter((zone) => zone.id === constraint.zone)
          : [],
      ),
    [task],
  );
```

отрисовать их в сцене — первым узлом внутри `RobotViewer`:

```tsx
          {keepOut.map((zone) => (
            <KeepOutZone key={zone.id} zone={zone} />
          ))}
```

и передать нарушение в условие задания — в `TaskBrief` рядом с `activeFailure`:

```tsx
              violation={jog.violation}
```

- [x] **Step 5: Проверить сборку**

Run: `npm run typecheck` затем `npm run build`
Expected: оба чисто.

- [x] **Step 6: Коммит**

```bash
git add components messages
git commit -m "feat: запретная зона в сцене и нарушение в условии"
```

---

### Task 5: Содержание урока 2

**Files:**
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/02-bezopasnost/task.json`
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/02-bezopasnost/lesson.ru.mdx`
- Create: `tests/sim/lesson-two.test.ts`

- [x] **Step 1: Написать падающий тест содержания**

Создать `tests/sim/lesson-two.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkGoals,
  checkKeepOuts,
  createWorld,
  distanceToBox,
  flangePose,
  parseTask,
  parseUrdfChain,
  type Vec3,
} from '@prompower/sim-core';
import { jakaZu7 } from '@prompower/robot-plugins';

/**
 * Урок 2: провести инструмент мимо зоны оператора.
 *
 * Проверяется то, что на глаз не проверить: зона действительно стоит на пути,
 * обход существует, а домашняя поза ничего не нарушает. Урок, где обход
 * невозможен или где ученик нарушает запрет не двинувшись, хуже отсутствующего.
 */

const LESSON = 'content/courses/osnovy-raboty-s-kobotom/lessons/02-bezopasnost';

const task = parseTask(JSON.parse(readFileSync(`${LESSON}/task.json`, 'utf8')));

const chain = parseUrdfChain(
  readFileSync('packages/robot-plugins/models/jaka-zu7/urdf/jaka-zu7.urdf', 'utf8'),
  jakaZu7.joints.map((joint) => joint.urdfName),
);

const deg = (value: number): number => (value * Math.PI) / 180;

/** Эталонный обход и поза, въезжающая в зону. */
const DETOUR = [deg(-60), deg(10), deg(50), 0, deg(90), 0];
const INSIDE = [deg(-40), deg(10), deg(70), 0, deg(80), 0];

const standing = (joints: readonly number[]) =>
  createWorld({ ...task.world, joints: [...joints] });

const zone = () => task.world.zones[0]!;

describe('задание «безопасность»', () => {
  it('решается ползунками и объявляет запрет', () => {
    expect(task.mode).toBe('jog');
    expect(task.constraints).toEqual([{ type: 'keepOut', zone: zone().id }]);
  });

  it('домашняя поза запрета не нарушает: урок начинается чистым', () => {
    expect(checkKeepOuts(task, standing(jakaZu7.homePose), chain)).toEqual([]);
  });

  it('эталонный обход берёт цель, не входя в зону', () => {
    expect(checkGoals(task, standing(DETOUR), [], chain)[0]!.failure).toBeNull();
    expect(checkKeepOuts(task, standing(DETOUR), chain)).toEqual([]);
  });

  it('поза напрямик к цели нарушает запрет', () => {
    expect(checkKeepOuts(task, standing(INSIDE), chain)[0]).toMatch(/вошёл в зону/);
  });

  it('зона стоит на прямом пути от домашней позы к цели, а не сбоку', () => {
    const goal = task.goals[0]!;
    if (goal.type !== 'flangeAtPoint') throw new Error('цель должна быть точкой');

    const home = flangePose(chain, jakaZu7.homePose);
    const start: Vec3 = { x: home.x, y: home.y, z: home.z };

    const crossed = Array.from({ length: 101 }, (_, step) => step / 100).filter((t) =>
      distanceToBox(
        {
          x: start.x + (goal.point.x - start.x) * t,
          y: start.y + (goal.point.y - start.y) * t,
          z: start.z + (goal.point.z - start.z) * t,
        },
        zone(),
      ) === 0,
    );

    expect(crossed.length).toBeGreaterThan(5);
  });

  it('цель лежит вне зоны вместе со своим допуском', () => {
    const goal = task.goals[0]!;
    if (goal.type !== 'flangeAtPoint') throw new Error('цель должна быть точкой');

    expect(distanceToBox(goal.point, zone())).toBeGreaterThan(goal.tolerance);
  });
});
```

- [x] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run tests/sim/lesson-two.test.ts`
Expected: FAIL — `ENOENT`, файла задания нет.

- [x] **Step 3: Написать задание**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/02-bezopasnost/task.json`:

```json
{
  "id": "bezopasnost",
  "mode": "jog",
  "world": {
    "objects": [],
    "zones": [
      {
        "id": "зона оператора",
        "position": { "x": 0.3, "y": -0.15, "z": 0.35 },
        "size": { "x": 0.3, "y": 0.25, "z": 0.45 }
      }
    ]
  },
  "goals": [
    {
      "type": "flangeAtPoint",
      "point": { "x": 0.375, "y": -0.42, "z": 0.296 },
      "tolerance": 0.05
    }
  ],
  "constraints": [{ "type": "keepOut", "zone": "зона оператора" }],
  "hints": []
}
```

- [x] **Step 4: Прогнать тест содержания**

Run: `npx vitest run tests/sim/lesson-two.test.ts`
Expected: PASS, 6 тестов.

- [x] **Step 5: Написать теорию**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/02-bezopasnost/lesson.ru.mdx`:

```mdx
---
title: Безопасность
description: Почему кобот безопасен не сам по себе, какие бывают режимы совместной работы и чего делать нельзя.
minutes: 4
---

Кобота продают как робота, рядом с которым можно работать. Это правда с одной
оговоркой, и оговорка важнее самого утверждения: безопасен не робот, а
**ячейка** — робот вместе с инструментом, деталью, столом и тем, что он делает.

## Безопасность — свойство установки, а не модели

Один и тот же кобот может стоять без ограждения и может требовать забора. Решает
это оценка риска конкретной установки: что робот несёт, с какой скоростью, где
проходит человек, чем заканчивается рука. Нож в захвате делает опасным любого
робота, каким бы «коллаборативным» он ни был.

Отсюда правило, которое стоит запомнить раньше всех команд: **числа берутся из
оценки риска, а не из паспорта робота**. Скорость, усилие, размеры зон
устанавливает тот, кто отвечает за ячейку.

## Четыре режима совместной работы

Стандарты описывают четыре способа работать рядом с человеком, и они не
исключают друг друга — в одной ячейке могут использоваться разные.

- **Останов с контролем.** Робот стоит, пока человек в зоне. Пришёл человек —
  движение прекращено, но питание не снято; ушёл — работа продолжается.
- **Ручное ведение.** Человек берёт робота за руку и показывает движение сам.
- **Слежение за скоростью и расстоянием.** Чем ближе человек, тем медленнее
  робот; на минимальной дистанции он останавливается.
- **Ограничение мощности и усилия.** Робот устроен и настроен так, что
  возможное касание не травмирует. Это тот самый режим, за который коботов
  обычно и ценят.

## Зоны

Зона — это часть пространства, про которую сказано, что в ней можно. Рабочая
зона — где робот работает. Зона оператора — где стоит человек и куда рука
заходить не должна вовсе. Зона совместной работы — где они встречаются, и
скорость там ограничена.

Границы зон не рисуют на полу для красоты: на них настраивается контроллер, и
программа, которая ведёт инструмент сквозь чужую зону, — это ошибка
программиста, а не случайность.

## Чего делать нельзя

- **Рассчитывать, что робот «сам остановится».** Останавливает его не доброта, а
  настроенная функция безопасности. Не настроена — не остановит.
- **Обходить датчики и снимать ограждения,** чтобы «на минуточку» что-то
  поправить. Большинство травм в робототехнике случается не в работе, а при
  наладке.
- **Вести инструмент через зону оператора,** даже когда там никого нет.
  Программа переживёт смену, а человек придёт.
- **Забывать про инструмент.** Безопасен робот — не значит безопасен захват,
  фреза или сварочная горелка.

## Задание

В сцене отмечена зона оператора. Приведите инструмент в отмеченную точку, не
заводя в неё робота — ни фланцем, ни локтем. Прямая дорога к точке идёт сквозь
зону, так что дорогу придётся выбрать самому.

Если робот всё же оказался в зоне, урок это запомнит: нарушение снимается только
сбросом. На настоящей ячейке возврат в известное состояние — то же самое
действие.
```

- [x] **Step 6: Проверить сборкой**

Run: `npm run build`
Expected: сборка проходит, среди статических страниц есть
`/ru/lesson/bezopasnost`.

- [x] **Step 7: Коммит**

```bash
git add content/courses/osnovy-raboty-s-kobotom/lessons/02-bezopasnost tests/sim/lesson-two.test.ts
git commit -m "feat: урок 2 — теория о безопасности и задание с запретной зоной"
```

---

### Task 6: Обучение урока 2

**Files:**
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/02-bezopasnost/tour.ru.json`

- [x] **Step 1: Написать сценарий**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/02-bezopasnost/tour.ru.json`:

```json
{
  "steps": [
    {
      "target": "[data-testid=theory-start]",
      "text": "Теория прочитана — переходите к заданию.",
      "done": "click"
    },
    {
      "target": "[data-testid=joint-panel]",
      "text": "Ведите инструмент к метке теми же ползунками. Оранжевая коробка — зона оператора: в неё нельзя заводить ни инструмент, ни локоть. Нарушение снимается кнопкой «Сброс».",
      "done": "passed"
    }
  ]
}
```

- [x] **Step 2: Коммит**

```bash
git add content/courses/osnovy-raboty-s-kobotom/lessons/02-bezopasnost/tour.ru.json
git commit -m "feat: обучение урока 2 объясняет зону"
```

---

### Task 7: Сквозной тест урока

**Files:**
- Create: `tests/e2e/lesson-two.spec.ts`

- [x] **Step 1: Написать тест**

Создать `tests/e2e/lesson-two.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

/**
 * Урок 2: запрет проверяется во время работы, а не в конце.
 *
 * Углы проверены unit-тестом на настоящем задании, здесь — что интерфейс
 * действительно ездит на проверке: нарушение приходит от валидатора, держится
 * до сброса и не даёт зачесть задание.
 */

const LESSON = '/ru/lesson/bezopasnost';

/** Эталонный обход и поза, въезжающая в зону, в градусах ползунка. */
const DETOUR = { joint_1: '-60', joint_2: '10', joint_3: '50', joint_5: '90' };
const INSIDE = { joint_1: '-40', joint_2: '10', joint_3: '70', joint_5: '80' };

async function setJoints(page: Page, values: Record<string, string>): Promise<void> {
  for (const [joint, value] of Object.entries(values)) {
    await page.locator(`[data-joint="${joint}"]`).fill(value);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(LESSON);
  await page.getByTestId('theory-start').click();
  await page.getByTestId('tour-skip').click();
  await expect(page.locator('main canvas')).toBeVisible();
});

test('задание начинается без нарушений', async ({ page }) => {
  await expect(page.getByTestId('violation')).toHaveCount(0);
  await expect(page.getByTestId('verdict')).toHaveCount(0);
});

test('въезд в зону оператора становится нарушением', async ({ page }) => {
  await setJoints(page, INSIDE);

  await expect(page.getByTestId('violation')).toContainText('зона оператора');
});

test('нарушение не забывается само', async ({ page }) => {
  await setJoints(page, INSIDE);
  await expect(page.getByTestId('violation')).toBeVisible();

  // Робот выведен из зоны — но случившееся из урока не исчезает.
  await setJoints(page, { joint_1: '-60' });
  await expect(page.getByTestId('violation')).toBeVisible();
});

test('с нарушением задание не зачтено, даже когда цель взята', async ({ page }) => {
  await setJoints(page, INSIDE);
  await setJoints(page, DETOUR);

  await expect(page.getByTestId('violation')).toBeVisible();
  await expect(page.getByTestId('verdict')).toHaveCount(0);
});

test('сброс снимает нарушение, и обход доводит задание до зачёта', async ({ page }) => {
  await setJoints(page, INSIDE);
  await expect(page.getByTestId('violation')).toBeVisible();

  await page.getByTestId('reset').click();
  await expect(page.getByTestId('violation')).toHaveCount(0);

  await setJoints(page, DETOUR);
  await expect(page.getByTestId('verdict')).toContainText('Задание выполнено');
  await expect(page.getByTestId('violation')).toHaveCount(0);
});
```

- [x] **Step 2: Прогнать**

Run: `npx playwright test tests/e2e/lesson-two.spec.ts`
Expected: PASS, 5 тестов. Первый прогон собирает приложение — это несколько
минут.

- [x] **Step 3: Коммит**

```bash
git add tests/e2e/lesson-two.spec.ts
git commit -m "test: урок 2 ловит нарушение и снимает его сбросом"
```

---

### Task 8: Порядок курса, README и полная проверка

**Files:**
- Modify: `tests/e2e/course.spec.ts`, `README.md`

- [x] **Step 1: Поправить проверку карты курса**

В `tests/e2e/course.spec.ts` тест «курс начинается с урока о коботе» считает
уроки: их стало пять. Заменить ожидание длины:

```ts
  expect(titles).toHaveLength(5);
```

и дописать проверку порядка:

```ts
  expect(titles[1]).toBe('Безопасность');
```

- [x] **Step 2: Обновить README**

В разделе «Что уже работает» дописать после абзаца об уроке 1:

```markdown
Второй урок — о безопасности: в сцене отмечена зона оператора, инструмент надо
провести к точке мимо неё. Въезд в зону фиксируется и не снимается сам собой —
пока нарушение висит, задание не зачтено, а снимает его тот же «Сброс», что
возвращает робота в стартовую позу.
```

- [x] **Step 3: Полная проверка**

Run: `npm run typecheck`, затем `npm test`, затем `npm run build`, затем
`npm run test:e2e`
Expected: typecheck чисто; Vitest зелёный; сборка проходит; Playwright зелёный
целиком, включая уроки 1, 3, 4 и 5 — их задания не менялись.

- [x] **Step 4: Коммит**

```bash
git add README.md tests/e2e/course.spec.ts
git commit -m "docs: в курсе появился урок о безопасности"
```

- [x] **Step 5: Отметить шаги плана и закрыть ветку**

Проставить галочки в этом файле, закоммитить, затем перейти к скиллу
`superpowers:finishing-a-development-branch`.
