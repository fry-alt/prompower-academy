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
  type WorldState,
} from '@prompower/sim-core';
import { jakaZu7 } from '@prompower/robot-plugins';

/**
 * Урок 3: пройти три точки.
 *
 * Задание без детали, и проверяется оно по журналу движений. Достижимость точек
 * тоже проверяется здесь: на глаз координаты не подобрать, а урок, в котором
 * эталон не проходит, хуже отсутствующего.
 */

const LESSON = 'content/courses/osnovy-raboty-s-kobotom/lessons/03-pervoe-dvizhenie';

const task = parseTask(JSON.parse(readFileSync(`${LESSON}/task.json`, 'utf8')));
const demo = parseProgram(JSON.parse(readFileSync(`${LESSON}/demo-program.json`, 'utf8')));

const chain = parseUrdfChain(
  readFileSync('packages/robot-plugins/models/jaka-zu7/urdf/jaka-zu7.urdf', 'utf8'),
  jakaZu7.joints.map((joint) => joint.urdfName),
);
const planner = createPlanner(chain);

function startingWorld(): WorldState {
  return createWorld({ joints: [...jakaZu7.homePose], zones: [...task.world.zones] });
}

function run(program: Program): RunState {
  return runToCompletion(createRun(program, startingWorld()), planner, { maxSteps: 500 });
}

describe('задание «пройти три точки»', () => {
  it('эталонная программа доходит до конца: все точки достижимы', () => {
    const result = run(demo);

    expect(result.error).toBeNull();
    expect(result.status).toBe('finished');
  });

  it('и проходит автопроверку', () => {
    const result = run(demo);
    const check = checkTask(task, demo, result.world, result.log, chain);

    expect(check.failures).toEqual([]);
    expect(check.passed).toBe(true);
  });

  it('программа, забывшая последнюю точку, узнаёт её номер', () => {
    const short: Program = { version: 1, body: demo.body.slice(0, -1) };

    const result = run(short);
    const check = checkTask(task, short, result.world, result.log, chain);

    expect(check.passed).toBe(false);
    expect(check.failures[0]).toMatch(/не побывал в точке 3/);
  });

  it('точки отмечены на столе зонами: их видно до запуска', () => {
    expect(task.world.zones).toHaveLength(3);
    expect(task.world.zones.map((zone) => zone.id)).toEqual(['точка 1', 'точка 2', 'точка 3']);
  });
});
