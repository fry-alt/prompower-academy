import { describe, expect, it } from 'vitest';
import type { Program } from '../program/ast';
import { createWorld, graspObject, moveObject, releaseObject } from '../world/state';
import { checkTask, hintFor } from './check';
import { parseTask, type Task } from './task';

const ZERO = { x: 0, y: 0, z: 0 };

const TASK: Task = parseTask({
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
});

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
    const result = checkTask(TASK, SHORT, solved(), [{ kind: 'grasp', tick: 0, objectId: 'cube-1' }]);

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('называет зону, в которой деталь оказалась', () => {
    // Кубик остался там, где лежал, — это зона A.
    const result = checkTask(TASK, SHORT, world(), [{ kind: 'grasp', tick: 0, objectId: 'cube-1' }]);

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toBe(
      'Деталь «cube-1» оказалась в зоне «zone-a», а нужна в зоне «zone-b».',
    );
  });

  it('объясняет, что схват сомкнулся впустую', () => {
    const outside = moveObject(world(), 'cube-1', { x: 0.9, y: 0.02, z: 0 });
    const result = checkTask(TASK, SHORT, outside, [{ kind: 'graspMissed', tick: 0 }]);

    expect(result.failures[0]).toMatch(/схват смыкался, но она не попала между губок/);
  });

  it('объясняет, что деталь вообще не брали', () => {
    const outside = moveObject(world(), 'cube-1', { x: 0.9, y: 0.02, z: 0 });
    const result = checkTask(TASK, SHORT, outside, []);

    expect(result.failures[0]).toMatch(/её так и не взяли захватом/);
  });

  it('ловит захват, оставшийся закрытым', () => {
    const held = graspObject(
      moveObject(world(), 'cube-1', { x: -0.3, y: 0.02, z: 0 }),
      'cube-1',
      ZERO,
    );
    const result = checkTask(TASK, SHORT, held, [{ kind: 'grasp', tick: 0, objectId: 'cube-1' }]);

    expect(result.failures).toContain('Захват остался закрытым в конце программы, а должен быть открыт.');
  });

  it('собирает все провалы, а не только первый', () => {
    const result = checkTask(TASK, SHORT, graspObject(world(), 'cube-1', ZERO), []);
    expect(result.failures.length).toBeGreaterThan(1);
  });

  it('сообщает о пропавшей со сцены детали', () => {
    const empty = createWorld({ joints: [], zones: [...TASK.world.zones] });
    expect(checkTask(TASK, SHORT, empty, []).failures[0]).toBe('На сцене нет детали «cube-1».');
  });
});

describe('ограничение на размер программы', () => {
  const long: Program = {
    version: 1,
    body: Array.from({ length: 7 }, () => ({ op: 'comment', text: 'x' }) as const),
  };

  it('ловит слишком длинную программу', () => {
    const result = checkTask(TASK, long, solved(), []);
    expect(result.failures).toContain('В программе 7 инструкций, а разрешено не больше 6.');
  });

  it('считает по дереву, а не по числу выполненных шагов', () => {
    // Цикл на сто витков — это две инструкции, а не двести.
    const loop: Program = {
      version: 1,
      body: [{ op: 'repeat', times: 100, body: [{ op: 'comment', text: 'виток' }] }],
    };

    expect(checkTask(TASK, loop, solved(), []).passed).toBe(true);
  });

  it('считает вложенные ветви', () => {
    const branchy: Program = {
      version: 1,
      body: [
        {
          op: 'if',
          cond: { kind: 'digitalInput', bank: 'cabinet', index: 1, value: true },
          then: [{ op: 'comment', text: '1' }, { op: 'comment', text: '2' }],
          else: [{ op: 'comment', text: '3' }, { op: 'comment', text: '4' }],
        },
        { op: 'comment', text: '5' },
        { op: 'comment', text: '6' },
      ],
    };

    // 1 условие + 4 внутри + 2 снаружи = 7.
    expect(checkTask(TASK, branchy, solved(), []).failures).toContain(
      'В программе 7 инструкций, а разрешено не больше 6.',
    );
  });
});

describe('hintFor', () => {
  it('до первой заслуженной подсказки молчит', () => {
    expect(hintFor(TASK, 1)).toBeNull();
  });

  it('выдаёт подсказку по числу неудач', () => {
    expect(hintFor(TASK, 2)).toBe('Подойдите к детали сверху.');
  });

  it('с ростом неудач выдаёт более подробную', () => {
    expect(hintFor(TASK, 5)).toBe('Не забудьте открыть захват над зоной B.');
  });
});
