import { describe, expect, it } from 'vitest';
import type { Program, Statement } from '../program/ast';
import {
  createWorld,
  digitalOutput,
  setDigitalInput,
  type SceneObject,
  type WorldState,
} from '../world/state';
import { planned, refused, type MotionPlanner, type MotionResult } from './motion';
import { createRun, evaluate, runToCompletion, step, type RunState } from './run';
import { TICK_MS } from '../tick';

/**
 * Планировщик-пустышка: переставляет суставы в цель без всякой кинематики.
 * Интерпретатор про кинематику не знает, и это позволяет проверить логику
 * программы, не поднимая ни одной модели робота.
 */
const jumpPlanner: MotionPlanner = {
  planJoint: (_from, target) => planned({ joints: [...target], ticks: 10, waypoints: [[...target]] }),
  planLinear: () => planned({ joints: [0, 0, 0, 0, 0, 0], ticks: 10, waypoints: [[0, 0, 0, 0, 0, 0]] }),
  // Схват едет по оси X ровно на величину первого сустава: этого хватает, чтобы
  // подвести губки к детали и проверить логику захвата без модели робота.
  flangePoint: (joints, offset) => ({
    x: (joints[0] ?? 0) + offset.x,
    y: offset.y,
    z: offset.z,
  }),
  offsetFromFlange: (joints, point) => ({
    x: point.x - (joints[0] ?? 0),
    y: point.y,
    z: point.z,
  }),
};

/** Подводит схват к кубику: тот лежит на 0.3 по X. */
const overCube: Statement = {
  op: 'moveJ',
  joints: [0.3, 0, 0, 0, 0, 0],
  speed: 1,
  acc: 1,
};

/** Планировщик, который всегда отказывает: так проверяется недостижимая точка. */
const refusingPlanner: MotionPlanner = {
  planJoint: () => refuse(),
  planLinear: () => refuse(),
  flangePoint: (_joints, offset) => offset,
  offsetFromFlange: (_joints, point) => point,
};

function refuse(): MotionResult {
  return refused('Точка недостижима — цель за пределами рабочей зоны');
}

const cube: SceneObject = {
  id: 'cube-1',
  position: { x: 0.3, y: 0.02, z: 0 },
  size: { x: 0.04, y: 0.04, z: 0.04 },
};

function world(): WorldState {
  return createWorld({ joints: [0, 0, 0, 0, 0, 0], objects: [cube] });
}

function program(...body: Statement[]): Program {
  return { version: 1, body };
}

function run(p: Program, initial: WorldState = world(), planner = jumpPlanner): RunState {
  return runToCompletion(createRun(p, initial), planner);
}

function ops(state: RunState): string[] {
  return state.log.filter((event) => event.kind === 'statement').map((event) => event.op);
}

describe('последовательное исполнение', () => {
  it('выполняет инструкции по порядку и завершается', () => {
    const result = run(program({ op: 'comment', text: 'раз' }, { op: 'wait', ms: 100 }));

    expect(result.status).toBe('finished');
    expect(ops(result)).toEqual(['comment', 'wait']);
  });

  it('делает ровно одну инструкцию за шаг', () => {
    const state = createRun(program({ op: 'wait', ms: 10 }, { op: 'wait', ms: 10 }), world());

    const afterFirst = step(state, jumpPlanner);
    expect(ops(afterFirst)).toHaveLength(1);
    expect(afterFirst.status).toBe('running');

    const afterSecond = step(afterFirst, jumpPlanner);
    expect(ops(afterSecond)).toHaveLength(2);
  });

  it('пустая программа сразу завершена', () => {
    const result = run(program());
    expect(result.status).toBe('finished');
    expect(result.log).toEqual([{ kind: 'finished', tick: 0 }]);
  });

  it('шаг по завершённой программе ничего не меняет', () => {
    const finished = run(program({ op: 'comment', text: 'всё' }));
    expect(step(finished, jumpPlanner)).toBe(finished);
  });
});

describe('детерминированность', () => {
  it('два прогона одной программы совпадают полностью', () => {
    const p = program(
      { op: 'setVar', name: 'i', value: { kind: 'number', value: 0 } },
      {
        op: 'repeat',
        times: 3,
        body: [
          {
            op: 'setVar',
            name: 'i',
            value: {
              kind: 'binary',
              operator: '+',
              left: { kind: 'variable', name: 'i' },
              right: { kind: 'number', value: 2 },
            },
          },
          { op: 'wait', ms: 50 },
        ],
      },
    );

    expect(run(p)).toEqual(run(p));
  });

  it('время идёт тиками, а не реальными миллисекундами', () => {
    const result = run(program({ op: 'wait', ms: 250 }));
    expect(result.world.tick).toBe(250 / TICK_MS);
  });
});

describe('циклы', () => {
  it('повторяет тело заданное число раз', () => {
    const result = run(
      program({ op: 'repeat', times: 3, body: [{ op: 'comment', text: 'виток' }] }),
    );
    expect(ops(result).filter((op) => op === 'comment')).toHaveLength(3);
  });

  it('не заходит в тело при нуле повторов', () => {
    const result = run(
      program({ op: 'repeat', times: 0, body: [{ op: 'comment', text: 'не должно быть' }] }),
    );
    expect(ops(result)).toEqual(['repeat']);
  });

  it('разворачивает вложенные циклы', () => {
    const result = run(
      program({
        op: 'repeat',
        times: 2,
        body: [{ op: 'repeat', times: 3, body: [{ op: 'comment', text: 'x' }] }],
      }),
    );
    expect(ops(result).filter((op) => op === 'comment')).toHaveLength(6);
  });

  it('крутит while, пока условие истинно', () => {
    const result = run(
      program(
        { op: 'setVar', name: 'i', value: { kind: 'number', value: 0 } },
        {
          op: 'while',
          cond: {
            kind: 'compare',
            operator: '<',
            left: { kind: 'variable', name: 'i' },
            right: { kind: 'number', value: 4 },
          },
          body: [
            {
              op: 'setVar',
              name: 'i',
              value: {
                kind: 'binary',
                operator: '+',
                left: { kind: 'variable', name: 'i' },
                right: { kind: 'number', value: 1 },
              },
            },
          ],
        },
      ),
    );

    expect(result.status).toBe('finished');
    expect(result.world.variables['i']).toBe(4);
  });

  it('не зависает на цикле с пустым телом', () => {
    const result = run(
      program({
        op: 'while',
        cond: { kind: 'digitalInput', bank: 'cabinet', index: 1, value: false },
        body: [],
      }),
    );

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/условие никогда не станет ложным/);
  });

  it('обрывает бесконечный цикл понятной ошибкой', () => {
    const p = program({
      op: 'while',
      cond: { kind: 'digitalInput', bank: 'cabinet', index: 1, value: false },
      body: [{ op: 'comment', text: 'вечно' }],
    });

    const result = runToCompletion(createRun(p, world()), jumpPlanner, { maxSteps: 50 });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/не завершилась за 50 шагов/);
  });
});

describe('ветвления', () => {
  const branch = (input: boolean): RunState =>
    run(
      program({
        op: 'if',
        cond: { kind: 'digitalInput', bank: 'cabinet', index: 1, value: true },
        then: [{ op: 'comment', text: 'да' }],
        else: [{ op: 'comment', text: 'нет' }],
      }),
      setDigitalInput(world(), 'cabinet', 1, input),
    );

  it('идёт в then, когда условие истинно', () => {
    expect(ops(branch(true))).toEqual(['if', 'comment']);
  });

  it('идёт в else, когда условие ложно', () => {
    expect(ops(branch(false))).toEqual(['if', 'comment']);
  });

  it('без else просто идёт дальше', () => {
    const result = run(
      program(
        {
          op: 'if',
          cond: { kind: 'digitalInput', bank: 'cabinet', index: 1, value: true },
          then: [{ op: 'comment', text: 'да' }],
        },
        { op: 'comment', text: 'после' },
      ),
    );
    expect(ops(result)).toEqual(['if', 'comment']);
  });
});

describe('переменные', () => {
  it('считает арифметику', () => {
    expect(
      evaluate(
        {
          kind: 'binary',
          operator: '*',
          left: { kind: 'number', value: 3 },
          right: { kind: 'number', value: 4 },
        },
        {},
      ),
    ).toBe(12);
  });

  it('необъявленная переменная равна нулю', () => {
    expect(evaluate({ kind: 'variable', name: 'нет такой' }, {})).toBe(0);
  });

  it('деление на ноль даёт ноль, а не бесконечность', () => {
    const value = evaluate(
      {
        kind: 'binary',
        operator: '/',
        left: { kind: 'number', value: 1 },
        right: { kind: 'number', value: 0 },
      },
      {},
    );
    expect(value).toBe(0);
  });

  it('пишет присваивание в журнал', () => {
    const result = run(program({ op: 'setVar', name: 'счёт', value: { kind: 'number', value: 7 } }));
    expect(result.log).toContainEqual({ kind: 'variable', tick: 0, name: 'счёт', value: 7 });
  });
});

describe('выходы и захват', () => {
  it('переключает цифровой выход и пишет событие', () => {
    const result = run(program({ op: 'setDO', bank: 'cabinet', index: 3, value: true }));

    expect(digitalOutput(result.world, 'cabinet', 3)).toBe(true);
    expect(result.log).toContainEqual({
      kind: 'output',
      tick: 0,
      bank: 'cabinet',
      index: 3,
      value: true,
    });
  });

  it('различает банк шкафа и банк инструмента', () => {
    // Захват на реальной ячейке висит на выходе инструмента, а не шкафа.
    const result = run(program({ op: 'setDO', bank: 'tool', index: 1, value: true }));

    expect(digitalOutput(result.world, 'tool', 1)).toBe(true);
    expect(digitalOutput(result.world, 'cabinet', 1)).toBe(false);
  });

  it('берёт деталь, когда губки до неё дотягиваются', () => {
    const result = run(program(overCube, { op: 'gripper', action: 'close' }));

    expect(result.world.grasped).toBe('cube-1');
    expect(result.log.some((event) => event.kind === 'grasp')).toBe(true);
  });

  it('не берёт деталь, до которой не дотянуться, и говорит об этом', () => {
    // Схват остался над началом координат, а кубик лежит на 0.3 по X.
    const result = run(program({ op: 'gripper', action: 'close' }));

    expect(result.world.grasped).toBeNull();
    expect(result.world.gripperOpen).toBe(false);
    expect(result.log).toContainEqual({ kind: 'graspMissed', tick: 0 });
  });

  it('берёт и отпускает деталь', () => {
    const result = run(
      program(overCube, { op: 'gripper', action: 'close' }, { op: 'gripper', action: 'open' }),
    );

    expect(result.world.grasped).toBeNull();
    expect(result.log.some((event) => event.kind === 'grasp')).toBe(true);
    expect(result.log.some((event) => event.kind === 'release')).toBe(true);
  });

  it('зажатая деталь едет вместе с рукой', () => {
    const result = run(
      program(overCube, { op: 'gripper', action: 'close' }, {
        op: 'moveJ',
        joints: [0.8, 0, 0, 0, 0, 0],
        speed: 1,
        acc: 1,
      }),
    );

    expect(result.world.grasped).toBe('cube-1');
    // Схват уехал с 0.3 на 0.8, деталь обязана уехать на те же 0.5.
    expect(result.world.objects['cube-1']?.position.x).toBeCloseTo(cube.position.x + 0.5, 9);
  });

  it('отпущенная деталь остаётся там, где её оставили', () => {
    const result = run(
      program(
        overCube,
        { op: 'gripper', action: 'close' },
        { op: 'moveJ', joints: [0.8, 0, 0, 0, 0, 0], speed: 1, acc: 1 },
        { op: 'gripper', action: 'open' },
        { op: 'moveJ', joints: [0, 0, 0, 0, 0, 0], speed: 1, acc: 1 },
      ),
    );

    expect(result.world.grasped).toBeNull();
    expect(result.world.objects['cube-1']?.position.x).toBeCloseTo(cube.position.x + 0.5, 9);
  });

  it('открыть пустой схват не ошибка и события не даёт', () => {
    const result = run(program({ op: 'gripper', action: 'open' }));

    expect(result.status).toBe('finished');
    expect(result.log.some((event) => event.kind === 'release')).toBe(false);
  });

  it('досягаемость губок настраивается', () => {
    // С нулевой досягаемостью нужно попасть точно внутрь детали.
    const state = createRun(program(overCube, { op: 'gripper', action: 'close' }), world());
    const result = runToCompletion(state, jumpPlanner, { graspReach: 0 });

    expect(result.world.grasped).toBe('cube-1');
  });
});

describe('ожидание входа', () => {
  it('идёт дальше, когда сигнал уже есть', () => {
    const result = run(
      program({ op: 'waitDI', bank: 'cabinet', index: 2, value: true }),
      setDigitalInput(world(), 'cabinet', 2, true),
    );
    expect(result.status).toBe('finished');
  });

  it('обрывается по таймауту с объяснением', () => {
    const result = run(program({ op: 'waitDI', bank: 'cabinet', index: 2, value: true, timeoutMs: 100 }));

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/так и не появился за 100 мс/);
  });

  it('ждёт по тику за шаг, а не мгновенно', () => {
    const state = createRun(program({ op: 'waitDI', bank: 'cabinet', index: 2, value: true }), world());

    const afterOne = step(state, jumpPlanner);
    expect(afterOne.status).toBe('running');
    expect(afterOne.world.tick).toBe(1);
  });

  it('сообщает о несуществующем входе', () => {
    const result = run(program({ op: 'waitDI', bank: 'tool', index: 99, value: true }));
    expect(result.error).toMatch(/входа 99 у инструмента нет/);
  });
});

describe('движения', () => {
  it('переставляет суставы по плану', () => {
    const target = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    const result = run(program({ op: 'moveJ', joints: target, speed: 1, acc: 1 }));

    expect(result.world.joints).toEqual(target);
    expect(result.world.tick).toBe(10);
  });

  it('отдаёт траекторию сцене', () => {
    const target = [1, 1, 1, 1, 1, 1];
    const result = run(program({ op: 'moveJ', joints: target, speed: 1, acc: 1 }));
    expect(result.lastMotion).toEqual([target]);
  });

  it('отказ планировщика останавливает программу человеческим текстом', () => {
    const result = run(
      program({ op: 'moveL', pose: { x: 9, y: 9, z: 9, rx: 0, ry: 0, rz: 0 }, speed: 1, acc: 1 }),
      world(),
      refusingPlanner,
    );

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Точка недостижима — цель за пределами рабочей зоны');
  });

  it('при отказе робот остаётся на месте', () => {
    const before = world();
    const result = run(
      program({ op: 'moveJ', joints: [1, 1, 1, 1, 1, 1], speed: 1, acc: 1 }),
      before,
      refusingPlanner,
    );
    expect(result.world.joints).toEqual(before.joints);
  });
});

describe('подсветка текущего блока', () => {
  it('показывает инструкцию, которая выполнится следующей', () => {
    const state = createRun(
      program({ op: 'comment', id: 'block-1', text: 'раз' }, { op: 'comment', id: 'block-2', text: 'два' }),
      world(),
    );

    expect(state.current?.id).toBe('block-1');
    expect(step(state, jumpPlanner).current?.id).toBe('block-2');
  });

  it('после завершения не подсвечивает ничего', () => {
    expect(run(program({ op: 'comment', text: 'всё' })).current).toBeNull();
  });
});
