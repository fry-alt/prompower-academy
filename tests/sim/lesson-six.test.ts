import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkTask,
  createPlanner,
  createRun,
  createWorld,
  parseProgram,
  parseTask,
  parseUrdfChain,
  runToCompletion,
  type Program,
  type RunState,
  type Statement,
} from '@prompower/sim-core';
import { jakaZu7 } from '@prompower/robot-plugins';

/**
 * Урок 6: разложить три детали по ячейкам паллеты циклом.
 *
 * Проверяется и то, что эталон проходит, и то, ради чего урок написан: без
 * цикла в ограничение уложиться нельзя, а с циклом — можно.
 */

const LESSON = 'content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl';

const task = parseTask(JSON.parse(readFileSync(`${LESSON}/task.json`, 'utf8')));
const demo = parseProgram(JSON.parse(readFileSync(`${LESSON}/demo-program.json`, 'utf8')));

const chain = parseUrdfChain(
  readFileSync('packages/robot-plugins/models/jaka-zu7/urdf/jaka-zu7.urdf', 'utf8'),
  jakaZu7.joints.map((joint) => joint.urdfName),
);
const planner = createPlanner(chain);

function run(program: Program): RunState {
  const world = createWorld({ ...task.world, joints: [...jakaZu7.homePose] });
  return runToCompletion(createRun(program, world), planner, { maxSteps: 4000 });
}

describe('задание «полный цикл»', () => {
  it('три детали и три ячейки', () => {
    expect(task.world.objects).toHaveLength(3);
    expect(task.goals).toHaveLength(3);
  });

  it('эталонная программа доходит до конца', () => {
    const result = run(demo);

    expect(result.error).toBeNull();
    expect(result.status).toBe('finished');
  });

  it('и раскладывает детали по ячейкам', () => {
    const result = run(demo);
    const check = checkTask(task, demo, result.world, result.log, chain);

    expect(check.failures).toEqual([]);
    expect(check.passed).toBe(true);
  });

  it('то же решение без цикла в ограничение не влезает', () => {
    const loop = demo.body.find((statement) => statement.op === 'repeat');
    if (loop === undefined || loop.op !== 'repeat') throw new Error('в эталоне нет цикла');

    // Три копии тела подряд вместо цикла — ровно то, что ученик напишет,
    // если решит обойтись без переменных.
    const unrolled: Program = {
      version: 1,
      body: [
        ...demo.body.filter((statement) => statement.op !== 'repeat'),
        ...([0, 1, 2].flatMap(() => [...loop.body]) as Statement[]),
      ],
    };

    const result = run(unrolled);
    const check = checkTask(task, unrolled, result.world, result.log, chain);

    expect(check.failures.some((failure) => failure.includes('разрешено не больше'))).toBe(true);
  });
});
