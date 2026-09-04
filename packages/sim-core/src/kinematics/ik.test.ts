import { describe, expect, it } from 'vitest';
import type { Pose } from '../program/ast';
import { flangePose, forwardKinematics } from './chain';
import { solveIk } from './ik';
import { parseUrdfChain } from './urdf';

/**
 * Шестиосевая рука, похожая по строению на JAKA: плечо, локоть и запястье из
 * трёх осей. Точные размеры не важны — важно, что цепь настоящая и решение
 * приходится искать, а не угадывать.
 */
const ARM = `<robot name="six_axis">
  <link name="base"/>
  <joint name="j1" type="revolute">
    <parent link="base"/><child link="l1"/>
    <origin xyz="0 0 0.15"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"/>
  </joint>
  <link name="l1"/>
  <joint name="j2" type="revolute">
    <parent link="l1"/><child link="l2"/>
    <origin xyz="0 0 0.1"/><axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0"/>
  </joint>
  <link name="l2"/>
  <joint name="j3" type="revolute">
    <parent link="l2"/><child link="l3"/>
    <origin xyz="0 0 0.36"/><axis xyz="0 1 0"/>
    <limit lower="-2.6" upper="2.6"/>
  </joint>
  <link name="l3"/>
  <joint name="j4" type="revolute">
    <parent link="l3"/><child link="l4"/>
    <origin xyz="0 0 0.3"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"/>
  </joint>
  <link name="l4"/>
  <joint name="j5" type="revolute">
    <parent link="l4"/><child link="l5"/>
    <origin xyz="0 0 0.09"/><axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0"/>
  </joint>
  <link name="l5"/>
  <joint name="j6" type="revolute">
    <parent link="l5"/><child link="l6"/>
    <origin xyz="0 0 0.08"/><axis xyz="0 0 1"/>
    <limit lower="-6.28" upper="6.28"/>
  </joint>
  <link name="l6"/>
</robot>`;

const NAMES = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];
const chain = parseUrdfChain(ARM, NAMES);
const HOME = [0, 0.4, -0.8, 0, 0.4, 0];

/** Допуски решателя по умолчанию: проверяем обещанное, а не строже. */
const POSITION_TOLERANCE = 0.001;
const ORIENTATION_TOLERANCE = 0.01;

function distanceTo(joints: readonly number[], target: Pose): number {
  const reached = flangePose(chain, joints);
  return Math.hypot(reached.x - target.x, reached.y - target.y, reached.z - target.z);
}

describe('solveIk', () => {
  it('находит позу, до которой рука реально дотягивается', () => {
    // Цель берём из прямой кинематики: значит решение заведомо существует.
    const target = flangePose(chain, [0.3, 0.5, -0.9, 0.2, 0.4, 0.1]);

    const result = solveIk(chain, target, HOME);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(distanceTo(result.joints, target)).toBeLessThan(POSITION_TOLERANCE);
  });

  it('соблюдает заданный допуск, когда его ужесточают', () => {
    const target = flangePose(chain, [0.3, 0.5, -0.9, 0.2, 0.4, 0.1]);

    const result = solveIk(chain, target, HOME, {
      positionTolerance: 0.00001,
      maxIterations: 500,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(distanceTo(result.joints, target)).toBeLessThan(0.00001);
  });

  it('доводит и ориентацию фланца, а не только положение', () => {
    const target = flangePose(chain, [-0.4, 0.6, -1.0, 0.5, 0.3, -0.2]);

    const result = solveIk(chain, target, HOME);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const reached = flangePose(chain, result.joints);
    const orientationError = Math.hypot(
      reached.rx - target.rx,
      reached.ry - target.ry,
      reached.rz - target.rz,
    );
    expect(orientationError).toBeLessThan(ORIENTATION_TOLERANCE);
  });

  it('на цели, равной текущей позе, останавливается сразу', () => {
    const result = solveIk(chain, flangePose(chain, HOME), HOME);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.iterations).toBe(1);
  });

  it('не выходит за пределы суставов', () => {
    const target = flangePose(chain, [1.0, 1.2, -2.0, 0.5, 1.0, 0.3]);

    const result = solveIk(chain, target, HOME);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const [index, joint] of chain.joints.entries()) {
      expect(result.joints[index]!).toBeGreaterThanOrEqual(joint.limit.lower - 1e-9);
      expect(result.joints[index]!).toBeLessThanOrEqual(joint.limit.upper + 1e-9);
    }
  });

  it('отказывается от точки за пределами рабочей зоны человеческим текстом', () => {
    const result = solveIk(chain, { x: 5, y: 5, z: 5, rx: 0, ry: 0, rz: 0 }, HOME);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/за пределами рабочей зоны|упирается в свой предел/);
    expect(result.reason).not.toMatch(/converge|solver|iteration/i);
  });

  it('не крутит бесконечно: число итераций ограничено', () => {
    const started = Date.now();
    solveIk(chain, { x: 9, y: 9, z: 9, rx: 0, ry: 0, rz: 0 }, HOME, { maxIterations: 50 });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('отвергает начальную позу не той длины', () => {
    const result = solveIk(chain, flangePose(chain, HOME), [0, 0]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/Ожидалось 6 значений суставов/);
  });

  it('детерминирован: два вызова дают один результат', () => {
    const target = flangePose(chain, [0.2, 0.5, -0.7, 0.1, 0.5, 0.4]);
    expect(solveIk(chain, target, HOME)).toEqual(solveIk(chain, target, HOME));
  });

  it('начальная поза влияет на выбранное решение', () => {
    const target = flangePose(chain, [0.5, 0.6, -1.1, 0, 0.5, 0]);

    const fromLeft = solveIk(chain, target, [1.5, 0.4, -0.8, 0, 0.4, 0]);
    const fromRight = solveIk(chain, target, [-1.5, 0.4, -0.8, 0, 0.4, 0]);

    expect(fromLeft.ok).toBe(true);
    expect(fromRight.ok).toBe(true);
    if (!fromLeft.ok || !fromRight.ok) return;
    // У шестиосевой руки решений несколько, и стартовая поза выбирает ближайшее.
    expect(fromLeft.joints).not.toEqual(fromRight.joints);
  });

  it('доворачивает ориентацию, развёрнутую ровно на 180 градусов', () => {
    // Худший случай для вектора поворота: у разворота на π кососимметричная
    // часть матрицы вырождается в ноль — ровно как у нулевого поворота. Если их
    // не различить, решатель отчитается об успехе, не тронув ориентацию.
    // Цель — та же поза с шестым суставом, повёрнутым на полоборота: она
    // отличается от затравки ровно на π и достижима по построению.
    const seed = [0, 1.2, 1.2, 0, 0.742, 0];
    const target = flangePose(chain, [0, 1.2, 1.2, 0, 0.742, Math.PI]);

    const result = solveIk(chain, target, seed);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // У затравки первый элемент поворота равен −1, у цели +1. Пока полуоборот
    // не отличали от нуля, решатель возвращал затравку и отчитывался об успехе.
    const reached = forwardKinematics(chain, result.joints);
    expect(reached[0] ?? 0).toBeCloseTo(1, 2);
    expect(reached[5] ?? 0).toBeCloseTo(-1, 2);
  });
});
