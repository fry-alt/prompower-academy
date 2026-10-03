import { describe, expect, it } from 'vitest';
import type { Program } from '../program/ast';
import { EMPTY_CHAIN, type KinematicChain } from '../kinematics/chain';
import { fromTranslation, IDENTITY } from '../kinematics/transform';
import { createWorld, graspObject, moveObject, releaseObject, type EventLog } from '../world/state';
import { checkGoals, checkKeepOuts, checkTask, earnedHints } from './check';
import { parseTask, type Task } from './task';

const ZERO = { x: 0, y: 0, z: 0 };

const RAW_TASK = {
  id: 'pick-and-place-basic',
  world: {
    objects: [{ id: 'cube-1', position: { x: 0.3, y: 0.02, z: 0 }, size: { x: 0.04, y: 0.04, z: 0.04 } }],
    zones: [
      { id: 'zone-a', position: { x: 0.3, y: 0.01, z: 0 }, size: { x: 0.15, y: 0.02, z: 0.15 } },
      { id: 'zone-b', position: { x: -0.3, y: 0.01, z: 0 }, size: { x: 0.15, y: 0.02, z: 0.15 } },
    ],
  },
  goals: [
    { type: 'objectInZone', object: 'cube-1', zone: 'zone-b' },
    { type: 'gripperState', state: 'open' },
  ],
  constraints: [{ type: 'maxStatements', value: 6 }],
  hints: [
    { afterFailedAttempts: 2, text: 'Подойдите к детали сверху.' },
    { afterFailedAttempts: 4, text: 'Не забудьте открыть захват над зоной B.' },
  ],
};

const TASK: Task = parseTask(RAW_TASK);

function world() {
  return createWorld({
    joints: [0, 0, 0, 0, 0, 0],
    objects: [...TASK.world.objects],
    zones: [...TASK.world.zones],
  });
}

const SHORT: Program = { version: 1, body: [{ op: 'comment', text: 'решение' }] };

/** Кубик переставлен в зону B, схват открыт — эталонное прохождение. */
function solved() {
  return releaseObject(moveObject(world(), 'cube-1', { x: -0.3, y: 0.02, z: 0 }));
}

describe('checkTask', () => {
  it('засчитывает выполненное задание', () => {
    const result = checkTask(TASK, SHORT, solved(), [{ kind: 'grasp', tick: 0, objectId: 'cube-1' }], EMPTY_CHAIN);

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('называет зону, в которой деталь оказалась', () => {
    // Кубик остался там, где лежал, — это зона A.
    const result = checkTask(TASK, SHORT, world(), [{ kind: 'grasp', tick: 0, objectId: 'cube-1' }], EMPTY_CHAIN);

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toBe(
      'Деталь «cube-1» оказалась в зоне «zone-a», а нужна в зоне «zone-b».',
    );
  });

  it('объясняет, что схват сомкнулся впустую', () => {
    const outside = moveObject(world(), 'cube-1', { x: 0.9, y: 0.02, z: 0 });
    const result = checkTask(TASK, SHORT, outside, [{ kind: 'graspMissed', tick: 0 }], EMPTY_CHAIN);

    expect(result.failures[0]).toMatch(/схват смыкался, но она не попала между губок/);
  });

  it('объясняет, что деталь вообще не брали', () => {
    const outside = moveObject(world(), 'cube-1', { x: 0.9, y: 0.02, z: 0 });
    const result = checkTask(TASK, SHORT, outside, [], EMPTY_CHAIN);

    expect(result.failures[0]).toMatch(/её так и не взяли захватом/);
  });

  it('ловит захват, оставшийся закрытым', () => {
    const held = graspObject(
      moveObject(world(), 'cube-1', { x: -0.3, y: 0.02, z: 0 }),
      'cube-1',
      ZERO,
    );
    const result = checkTask(TASK, SHORT, held, [{ kind: 'grasp', tick: 0, objectId: 'cube-1' }], EMPTY_CHAIN);

    expect(result.failures).toContain('Захват остался закрытым в конце программы, а должен быть открыт.');
  });

  it('собирает все провалы, а не только первый', () => {
    const result = checkTask(TASK, SHORT, graspObject(world(), 'cube-1', ZERO), [], EMPTY_CHAIN);
    expect(result.failures.length).toBeGreaterThan(1);
  });

  it('сообщает о пропавшей со сцены детали', () => {
    const empty = createWorld({ joints: [], zones: [...TASK.world.zones] });
    expect(checkTask(TASK, SHORT, empty, [], EMPTY_CHAIN).failures[0]).toBe('На сцене нет детали «cube-1».');
  });
});

describe('деталь в захвате', () => {
  it('прямо говорит, что схват не открыли', () => {
    const held = graspObject(moveObject(world(), 'cube-1', { x: -0.3, y: 0.02, z: 0 }), 'cube-1', {
      x: 0,
      y: 0,
      z: 0,
    });
    const result = checkTask(TASK, SHORT, held, [{ kind: 'grasp', tick: 0, objectId: 'cube-1' }], EMPTY_CHAIN);

    expect(result.failures).toContain(
      'Деталь «cube-1» осталась в захвате: откройте схват над зоной «zone-b».',
    );
  });
});

describe('ограничение на размер программы', () => {
  const long: Program = {
    version: 1,
    body: Array.from({ length: 7 }, () => ({ op: 'wait', ms: 0 }) as const),
  };

  it('ловит слишком длинную программу', () => {
    const result = checkTask(TASK, long, solved(), [], EMPTY_CHAIN);
    expect(result.failures).toContain('В программе 7 инструкций, а разрешено не больше 6.');
  });

  it('считает по дереву, а не по числу выполненных шагов', () => {
    // Цикл на сто витков — это две инструкции, а не двести.
    const loop: Program = {
      version: 1,
      body: [{ op: 'repeat', times: 100, body: [{ op: 'wait', ms: 0 }] }],
    };

    expect(checkTask(TASK, loop, solved(), [], EMPTY_CHAIN).passed).toBe(true);
  });

  it('комментарии не считает: подписанная программа не наказывается', () => {
    const signed: Program = {
      version: 1,
      body: [
        ...Array.from({ length: 6 }, () => ({ op: 'wait', ms: 0 }) as const),
        ...Array.from({ length: 5 }, () => ({ op: 'comment', text: 'пояснение' }) as const),
      ],
    };

    expect(checkTask(TASK, signed, solved(), [], EMPTY_CHAIN).passed).toBe(true);
  });

  it('считает вложенные ветви', () => {
    const branchy: Program = {
      version: 1,
      body: [
        {
          op: 'if',
          cond: { kind: 'digitalInput', bank: 'cabinet', index: 1, value: true },
          then: [{ op: 'wait', ms: 0 }, { op: 'wait', ms: 0 }],
          else: [{ op: 'wait', ms: 0 }, { op: 'wait', ms: 0 }],
        },
        { op: 'wait', ms: 0 },
        { op: 'wait', ms: 0 },
      ],
    };

    // 1 условие + 4 внутри + 2 снаружи = 7.
    expect(checkTask(TASK, branchy, solved(), [], EMPTY_CHAIN).failures).toContain(
      'В программе 7 инструкций, а разрешено не больше 6.',
    );
  });
});

describe('цель «пройти точки»', () => {
  const FIRST = { x: 0.35, y: 0.2, z: 0.22 };
  const SECOND = { x: 0.35, y: -0.2, z: 0.22 };

  const ROUTE: Task = parseTask({
    ...RAW_TASK,
    goals: [{ type: 'pointsVisited', points: [FIRST, SECOND], tolerance: 0.01 }],
    constraints: [],
  });

  const visit = (...points: readonly { x: number; y: number; z: number }[]): EventLog =>
    points.map((point, index) => ({ kind: 'moved', tick: index, point }) as const);

  it('засчитывает, когда фланец побывал у каждой точки', () => {
    const result = checkTask(ROUTE, SHORT, world(), visit(FIRST, SECOND), EMPTY_CHAIN);

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('порядок обхода не важен', () => {
    expect(checkTask(ROUTE, SHORT, world(), visit(SECOND, FIRST), EMPTY_CHAIN).passed).toBe(true);
  });

  it('промах в пределах допуска — это попадание', () => {
    const almost = { ...FIRST, z: FIRST.z + 0.009 };
    expect(checkTask(ROUTE, SHORT, world(), visit(almost, SECOND), EMPTY_CHAIN).passed).toBe(true);
  });

  it('пропущенная точка названа номером и координатами в миллиметрах', () => {
    const result = checkTask(ROUTE, SHORT, world(), visit(FIRST), EMPTY_CHAIN);

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toBe('Робот не побывал в точке 2: X 350, Y −200, Z 220 мм.');
  });

  it('мимо допуска — мимо точки', () => {
    const far = { ...SECOND, y: SECOND.y + 0.02 };
    expect(checkTask(ROUTE, SHORT, world(), visit(FIRST, far), EMPTY_CHAIN).passed).toBe(false);
  });
});

describe('earnedHints', () => {
  it('до первой заслуженной подсказки молчит', () => {
    expect(earnedHints(TASK, 1)).toEqual([]);
  });

  it('открывает подсказку по числу неудач', () => {
    expect(earnedHints(TASK, 2).map((hint) => hint.text)).toEqual(['Подойдите к детали сверху.']);
  });

  it('с ростом неудач копит лестницу, а не подменяет её', () => {
    expect(earnedHints(TASK, 5).map((hint) => hint.text)).toEqual([
      'Подойдите к детали сверху.',
      'Не забудьте открыть захват над зоной B.',
    ]);
  });

  it('выдаёт подсказки по возрастанию порога, а не в порядке записи', () => {
    const shuffled = parseTask({
      ...RAW_TASK,
      hints: [
        { afterFailedAttempts: 4, text: 'вторая' },
        { afterFailedAttempts: 2, text: 'первая' },
      ],
    });

    expect(earnedHints(shuffled, 4).map((hint) => hint.text)).toEqual(['первая', 'вторая']);
  });
});

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
    expect(checkTask(POSE, SHORT, standing(TARGET), [], EMPTY_CHAIN).passed).toBe(true);
  });

  it('промах внутри допуска — это попадание', () => {
    const close = TARGET.map((value, index) => (index === 1 ? value + 0.04 : value));
    expect(checkTask(POSE, SHORT, standing(close), [], EMPTY_CHAIN).passed).toBe(true);
  });

  it('называет сустав, который дальше всех от цели', () => {
    const off = TARGET.map((value, index) => (index === 2 ? value + 0.35 : value));
    const result = checkTask(POSE, SHORT, standing(off), [], EMPTY_CHAIN);

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toBe('Сустав 3 не на месте: нужно 90°, сейчас 110° — разница 20°.');
  });

  it('полный оборот — та же поза', () => {
    const wrapped = TARGET.map((value, index) => (index === 0 ? value + Math.PI * 2 : value));
    expect(checkTask(POSE, SHORT, standing(wrapped), [], EMPTY_CHAIN).passed).toBe(true);
  });
});

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

  it('несобранная сцена объясняется словами, а не исключением', () => {
    const result = checkTask(POINT, SHORT, standing([]), [], CHAIN);

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/положение инструмента не посчитать/);
  });

  it('называет расстояние до точки в миллиметрах', () => {
    const result = checkTask(POINT, SHORT, standing([Math.PI / 2]), [], CHAIN);

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toBe('Инструмент в 1414 мм от точки: X 1000, Y 0, Z 0 мм.');
  });
});

describe('checkGoals', () => {
  it('отдаёт статус по каждой цели, а не общий вердикт', () => {
    const statuses = checkGoals(
      TASK,
      solved(),
      [{ kind: 'grasp', tick: 0, objectId: 'cube-1' }],
      EMPTY_CHAIN,
    );

    expect(statuses).toHaveLength(2);
    expect(statuses.map((status) => status.failure)).toEqual([null, null]);
  });

  it('невыполненная цель приносит с собой объяснение', () => {
    const statuses = checkGoals(TASK, world(), [], EMPTY_CHAIN);

    expect(statuses[0]!.goal.type).toBe('objectInZone');
    expect(statuses[0]!.failure).toMatch(/оказалась в зоне «zone-a»/);
  });
});

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
      zones: [
        { id: 'зона оператора', position: { x: 1, y: 0, z: 0 }, size: { x: 0.4, y: 0.4, z: 0.4 } },
      ],
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

    // Мир собран по этому же заданию: зоны в нём нет ни в списке, ни на сцене.
    const empty = createWorld({ joints: [0], zones: [...lost.world.zones] });

    expect(checkKeepOuts(lost, empty, CHAIN)[0]).toBe('На сцене нет зоны «зона оператора».');
  });

  it('попадает в общий вердикт задания', () => {
    const result = checkTask(KEEP_OUT, SHORT, standing([0]), [], CHAIN);

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Робот вошёл в зону «зона оператора» — туда заходить нельзя.');
  });
});
