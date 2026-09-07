import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkTask,
  createPlanner,
  createRun,
  createWorld,
  digitalInput,
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
 * Урок 5: деталь приезжает по конвейеру, датчик сообщает об этом.
 *
 * Проверяется то же, что и в уроке 4, плюс главное умение урока: программа без
 * ожидания сигнала обязана провалиться, иначе задание не учит ничему.
 */

const LESSON = 'content/courses/osnovy-raboty-s-kobotom/lessons/05-vhody-i-vyhody';

const task = parseTask(JSON.parse(readFileSync(`${LESSON}/task.json`, 'utf8')));
const demo = parseProgram(JSON.parse(readFileSync(`${LESSON}/demo-program.json`, 'utf8')));

const chain = parseUrdfChain(
  readFileSync('packages/robot-plugins/models/jaka-zu7/urdf/jaka-zu7.urdf', 'utf8'),
  jakaZu7.joints.map((joint) => joint.urdfName),
);
const planner = createPlanner(chain);

function startingWorld(): WorldState {
  return createWorld({
    joints: [...jakaZu7.homePose],
    objects: [...task.world.objects],
    zones: [...task.world.zones],
    conveyors: [...task.world.conveyors],
    sensors: [...task.world.sensors],
  });
}

function run(program: Program): RunState {
  // Ожидание сигнала идёт по одному тику, поэтому шагов нужно больше, чем в
  // уроке без конвейера: деталь едет две с лишним секунды.
  return runToCompletion(createRun(program, startingWorld()), planner, { maxSteps: 3000 });
}

describe('задание «забери деталь с конвейера»', () => {
  it('деталь начинает путь на ленте, а датчик молчит', () => {
    const world = startingWorld();

    expect(world.objects['деталь']!.position.y).toBeCloseTo(0.58, 6);
    expect(digitalInput(world, 'cabinet', 1)).toBe(false);
  });

  it('эталонная программа доходит до конца без ошибок', () => {
    const result = run(demo);

    expect(result.error).toBeNull();
    expect(result.status).toBe('finished');
  });

  it('и проходит автопроверку', () => {
    const result = run(demo);
    const check = checkTask(task, demo, result.world, result.log);

    expect(check.failures).toEqual([]);
    expect(check.passed).toBe(true);
  });

  it('деталь доехала до конца ленты и оказалась в зоне B', () => {
    const { world } = run(demo);
    const part = world.objects['деталь']!;

    // Лента кончается на 0.2 по Y, а зона B лежит на -0.2.
    expect(part.position.y).toBeLessThan(0);
  });

  it('датчик успевает сработать раньше, чем робот берёт деталь', () => {
    const { log } = run(demo);
    const grasp = log.find((event) => event.kind === 'grasp');

    expect(grasp).toBeDefined();
    // Захват случился не в первый тик: программа стояла и ждала сигнала.
    expect(grasp!.tick).toBeGreaterThan(200);
  });

  it('программа без ожидания сигнала хватает пустоту', () => {
    const rushing: Program = {
      version: 1,
      body: demo.body.filter((statement) => statement.op !== 'waitDI'),
    };

    const result = run(rushing);
    const check = checkTask(task, rushing, result.world, result.log);

    expect(check.passed).toBe(false);
    expect(result.log.some((event) => event.kind === 'graspMissed')).toBe(true);
  });

  it('прогон детерминирован: два запуска совпадают', () => {
    expect(run(demo)).toEqual(run(demo));
  });
});
