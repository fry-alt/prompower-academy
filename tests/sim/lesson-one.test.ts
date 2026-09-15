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
