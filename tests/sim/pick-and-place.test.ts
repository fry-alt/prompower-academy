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
 * Definition of Done фазы 2: задание проходится от начала до конца, а неверное
 * решение даёт внятное объяснение почему.
 *
 * Прогон идёт на настоящем URDF Zu 7 и на настоящем задании из каталога курсов —
 * без браузера и без единой строчки React. Ровно ради этого `sim-core` и держат
 * свободным от three.js.
 */

const LESSON = 'content/courses/osnovy-raboty-s-kobotom/lessons/04-instrument-i-zahvat';

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
  });
}

function run(program: Program): RunState {
  return runToCompletion(createRun(program, startingWorld()), planner, { maxSteps: 500 });
}

describe('задание «переложи деталь из A в B»', () => {
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

  it('деталь действительно переехала в зону B', () => {
    const { world } = run(demo);
    const part = world.objects['деталь'];

    expect(part).toBeDefined();
    // Зона B лежит на -0.2 по Y, исходная зона A — на +0.2.
    expect(part!.position.y).toBeLessThan(0);
  });

  it('решение без захвата объясняет, что деталь не брали', () => {
    // Программа доезжает до места и возвращается, но схват не трогает.
    const withoutGrip: Program = {
      version: 1,
      body: demo.body.filter((statement) => statement.op !== 'gripper'),
    };

    const result = run(withoutGrip);
    const check = checkTask(task, withoutGrip, result.world, result.log);

    expect(check.passed).toBe(false);
    // Деталь никуда не уехала, поэтому проверка называет зону, в которой она
    // осталась: это точнее, чем общее «не взяли захватом».
    expect(check.failures.join(' ')).toMatch(/оказалась в зоне «зона A», а нужна в зоне «зона B»/);
  });

  it('решение, забывшее открыть захват, получает конкретное объяснение', () => {
    const holdsOn: Program = {
      version: 1,
      body: demo.body.filter(
        (statement) => !(statement.op === 'gripper' && statement.action === 'open'),
      ),
    };

    const result = run(holdsOn);
    const check = checkTask(task, holdsOn, result.world, result.log);

    expect(check.passed).toBe(false);
    expect(check.failures.join(' ')).toMatch(/Захват остался закрытым/);
  });

  it('смыкание схвата в стороне от детали объясняется отдельно', () => {
    // Хватаем сразу, не подъехав: губки в этот момент далеко от детали.
    const grabsEarly: Program = {
      version: 1,
      body: [{ op: 'gripper', action: 'close' }, ...demo.body],
    };

    const result = run(grabsEarly);

    expect(result.log.some((event) => event.kind === 'graspMissed')).toBe(true);
  });

  it('прогон детерминирован: два запуска совпадают', () => {
    expect(run(demo)).toEqual(run(demo));
  });

  it('эталонная программа укладывается в ограничение задания', () => {
    const result = run(demo);
    expect(checkTask(task, demo, result.world, result.log).failures).not.toContain(
      expect.stringContaining('инструкций'),
    );
  });
});
