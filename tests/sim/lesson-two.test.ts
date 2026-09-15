import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkGoals,
  checkKeepOuts,
  createWorld,
  distanceToBox,
  parseTask,
  parseUrdfChain,
} from '@prompower/sim-core';
import { jakaZu7 } from '@prompower/robot-plugins';

/**
 * Урок 2: провести инструмент мимо зоны оператора.
 *
 * Проверяется то, что на глаз не проверить: обход существует, ловушка тоже, а
 * домашняя поза ничего не нарушает. Урок, где обход невозможен, непроходим; урок,
 * где нарушить нельзя, ничему не учит.
 *
 * «Зона на пути» здесь означает не отрезок: фланец в ручном уроке ходит дугами,
 * и прямая от позы к позе ничего не описывает. Означает это порядок ползунков —
 * естественный первый ход заводит руку в зону, а другой порядок проходит чисто.
 */

const LESSON = 'content/courses/osnovy-raboty-s-kobotom/lessons/02-bezopasnost';

const task = parseTask(JSON.parse(readFileSync(`${LESSON}/task.json`, 'utf8')));

const chain = parseUrdfChain(
  readFileSync('packages/robot-plugins/models/jaka-zu7/urdf/jaka-zu7.urdf', 'utf8'),
  jakaZu7.joints.map((joint) => joint.urdfName),
);

const deg = (value: number): number => (value * Math.PI) / 180;

/** Эталонный обход и поза, въезжающая в зону. */
const DETOUR = [deg(-60), 0, deg(50), 0, deg(80), 0];
const INSIDE = [deg(-40), 0, deg(60), 0, deg(80), 0];

const standing = (joints: readonly number[]) => createWorld({ ...task.world, joints: [...joints] });

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

  it('до цели можно дойти ползунками, ни разу не задев зону', () => {
    // Ползунки двигают по одному, и промежуточные позы — тоже позы. Урок
    // решаем, только если существует порядок, в котором ни одна из них не
    // входит в зону: база поворачивается последней, когда рука уже опущена.
    const order = [1, 2, 4, 0];
    let joints = [...jakaZu7.homePose];

    for (const index of order) {
      joints = joints.map((value, i) => (i === index ? DETOUR[index]! : value));
      expect(checkKeepOuts(task, standing(joints), chain)).toEqual([]);
    }

    expect(checkGoals(task, standing(joints), [], chain)[0]!.failure).toBeNull();
  });

  it('поворот базы первым проносит руку над зоной: порядок в этом задании решает', () => {
    const joints = jakaZu7.homePose.map((value, i) => (i === 0 ? DETOUR[0]! : value));
    const dropped = joints.map((value, i) => (i === 1 ? DETOUR[1]! : value));

    expect(checkKeepOuts(task, standing(dropped), chain)[0]).toMatch(/вошёл в зону/);
  });

  it('цель лежит вне зоны вместе со своим допуском', () => {
    const goal = task.goals[0]!;
    if (goal.type !== 'flangeAtPoint') throw new Error('цель должна быть точкой');

    expect(distanceToBox(goal.point, zone())).toBeGreaterThan(goal.tolerance);
  });
});
